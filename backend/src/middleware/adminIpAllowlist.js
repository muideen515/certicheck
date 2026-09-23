const allowedIps = (process.env.ADMIN_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);

function adminIpAllowlist(req, res, next) {
  if (!allowedIps.length) return next(); // no allowlist configured
  const ip = req.ip || req.connection?.remoteAddress || req.headers['x-forwarded-for']?.split(',')[0];
  if (!ip) return res.status(403).json({ error: 'Forbidden' });
  if (allowedIps.includes(ip)) return next();
  return res.status(403).json({ error: 'Admin access from this IP is not allowed' });
}

module.exports = { adminIpAllowlist };
