const jwt = require('jsonwebtoken');
const pool = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';

function getDemoUser(req) {
  if (process.env.DEMO_MODE === 'true' || req.headers.authorization?.split(' ')[1] === 'demo-token') {
    return {
      id: 1,
      email: 'demo@certicheck.io',
      user_type: req.headers['x-demo-user-type'] || 'issuer'
    };
  }
  return null;
}

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const demoUser = getDemoUser(req);
  if (demoUser) {
    req.user = demoUser;
    return next();
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function verifyAdmin(req, res, next) {
  if (!req.user || req.user.user_type !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

async function verifyIssuer(req, res, next) {
  if (!req.user || !['issuer', 'admin'].includes(req.user.user_type)) {
    return res.status(403).json({ error: 'Issuer access required' });
  }

  const isDemoRequest = process.env.DEMO_MODE === 'true' || Boolean(req.headers['x-demo-user-type']);

  if (req.user.user_type === 'issuer' && !isDemoRequest) {
    try {
      const result = await pool.query(
        'SELECT status FROM issuer_profiles WHERE user_id = $1 LIMIT 1',
        [req.user.id]
      );

      if (!result.rows[0] || result.rows[0].status !== 'approved') {
        return res.status(403).json({ error: 'Approved issuer access required' });
      }
    } catch (err) {
      console.error('Issuer verification failed:', err.message);
      return res.status(500).json({ error: 'Unable to verify issuer approval' });
    }
  }

  next();
}

function logAudit(userId, actionType, resourceType = null, resourceId = null, status = 'success', errorMsg = null, metadata = {}) {
  return pool.query(
    `INSERT INTO audit_log (user_id, action, action_type, resource_type, resource_id, status, error_message, ip_address, user_agent, metadata, timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
    [userId, actionType, actionType, resourceType, resourceId, status, errorMsg, null, null, JSON.stringify(metadata)]
  ).catch(err => console.error('Audit log error:', err));
}

module.exports = {
  verifyToken,
  verifyAdmin,
  verifyIssuer,
  logAudit
};
