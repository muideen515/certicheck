const rateLimit = require('express-rate-limit');

// Basic rate limiter for admin routes
const adminRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'Too many requests, slow down.' });
  }
});

module.exports = { adminRateLimiter };
