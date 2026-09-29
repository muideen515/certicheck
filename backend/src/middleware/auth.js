const jwt = require('jsonwebtoken');
const pool = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || JWT_SECRET;

function getDemoUser(req) {
  if (process.env.DEMO_MODE === 'true' && req.headers.authorization?.split(' ')[1] === 'demo-token') {
    return {
      id: 1,
      email: 'demo@certicheck.io',
      user_type: 'issuer',
      userType: 'issuer',
      issuer_status: 'approved',
      is_active: true,
      isDemo: true
    };
  }
  return null;
}

function verifyAdminToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  if (process.env.DEMO_MODE === 'true' && token === 'demo-token') {
    req.user = {
      id: 1,
      email: 'demo-admin@certicheck.io',
      user_type: 'admin',
      userType: 'admin',
      is_active: true,
      isDemo: true
    };
    return next();
  }

  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    const userType = decoded?.userType ?? decoded?.user_type;
    if (userType !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.user = {
      ...decoded,
      id: decoded.id ?? decoded.adminId,
      adminId: decoded.adminId ?? decoded.id,
      user_type: userType,
      userType,
      isDemo: process.env.DEMO_MODE === 'true' && decoded.isAdmin === true
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

async function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const demoUser = getDemoUser(req);
  if (demoUser) {
    req.user = demoUser;
    return next();
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  let mustChangePassword = decoded.must_change_password;
  if (mustChangePassword === undefined) {
    try {
      const result = await pool.query(
        'SELECT must_change_password FROM users WHERE id = $1 LIMIT 1',
        [decoded.id]
      );
      mustChangePassword = result.rows[0]?.must_change_password;
    } catch (err) {
      console.error('Password-change requirement lookup failed:', err.message);
      return res.status(500).json({ error: 'Unable to verify account password status' });
    }
  }
  if (mustChangePassword && req.path !== '/change-password') {
    return res.status(403).json({
      code: 'PASSWORD_CHANGE_REQUIRED',
      error: 'Change your initial password before using the platform'
    });
  }

  req.user = {
    ...decoded,
    first_name: decoded.first_name ?? decoded.firstName,
    last_name: decoded.last_name ?? decoded.lastName,
    user_type: decoded.user_type ?? decoded.userType
  };
  req.user.firstName = req.user.first_name;
  req.user.lastName = req.user.last_name;
  req.user.userType = req.user.user_type;
  next();
}

async function resolveUserAccess(req) {
  if (!req.user || !req.user.id) {
    return null;
  }

  if (req.user.isDemo === true && process.env.DEMO_MODE === 'true') {
    return req.user;
  }

  const result = await pool.query(
    `SELECT u.id, u.user_type, u.is_active, ip.status AS issuer_status,
            ip.wallet_address AS issuer_wallet
     FROM users u
     LEFT JOIN issuer_profiles ip ON ip.user_id = u.id
     WHERE u.id = $1 LIMIT 1`,
    [req.user.id]
  );

  if (!result.rows[0]) {
    return null;
  }

  return result.rows[0];
}

async function verifyAdmin(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const user = await resolveUserAccess(req);
    const tokenUserType = req.user.userType || req.user.user_type;
    const effectiveUserType = tokenUserType === 'admin'
      ? 'admin'
      : user?.user_type || tokenUserType;

    if (effectiveUserType !== 'admin' || user?.is_active === false) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.user.user_type = effectiveUserType;
    req.user.userType = effectiveUserType;
    req.user.is_active = user?.is_active ?? req.user.is_active;
    next();
  } catch (err) {
    console.error('Admin verification failed:', err.message);
    return res.status(500).json({ error: 'Unable to verify admin access' });
  }
}

async function verifyIssuer(req, res, next) {
  if (!req.user || !req.user.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const user = await resolveUserAccess(req);
    if (
      !user ||
      user.user_type !== 'issuer' ||
      !user.is_active ||
      user.issuer_status !== 'approved'
    ) {
      return res.status(403).json({ error: 'Issuer approval required' });
    }

    req.user.user_type = user.user_type;
    req.user.userType = user.user_type;
    req.user.is_active = user.is_active;
    req.user.issuer_status = user.issuer_status;
    next();
  } catch (err) {
    console.error('Issuer verification failed:', err.message);
    return res.status(500).json({ error: 'Unable to verify issuer approval' });
  }
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
  logAudit,
  verifyAdminToken
};
