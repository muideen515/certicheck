const express = require('express');
const pool = require('../db/connection');
const { verifyToken, verifyAdmin, logAudit } = require('../middleware/auth');

const router = express.Router();

// ── ADMIN DASHBOARD STATS ───────────────────────────────────────────────────
router.get('/dashboard', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const pendingApps = await pool.query(
      'SELECT COUNT(*) as count FROM pending_applications WHERE status = $1',
      ['pending']
    );

    const approvedApps = await pool.query(
      'SELECT COUNT(*) as count FROM pending_applications WHERE status = $1',
      ['approved']
    );

    const revokedCerts = await pool.query(
      'SELECT COUNT(*) as count FROM verify_history WHERE verification_status = $1',
      ['revoked']
    );

    const totalVerifications = await pool.query(
      'SELECT COUNT(*) as count FROM verify_history'
    );

    const recentAudit = await pool.query(
      'SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT 20'
    );

    res.json({
      success: true,
      stats: {
        pendingApplications: parseInt(pendingApps.rows[0].count),
        approvedApplications: parseInt(approvedApps.rows[0].count),
        revokedCertificates: parseInt(revokedCerts.rows[0].count),
        totalVerifications: parseInt(totalVerifications.rows[0].count)
      },
      recentAudit: recentAudit.rows
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard stats' });
  }
});

// ── ADMIN ACCESS LOG ────────────────────────────────────────────────────────
router.post('/access-log', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { section, method } = req.body;

    await pool.query(
      `INSERT INTO admin_access_log (admin_id, access_type, dashboard_section, login_method)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, 'access', section, method]
    );

    await logAudit(req.user.id, 'ADMIN_ACCESS', 'dashboard', null, 'success', null, { section, method });

    res.json({ success: true, message: 'Access logged' });
  } catch (err) {
    console.error('Admin access log error:', err);
    res.status(500).json({ error: 'Failed to log access' });
  }
});

// ── GET AUDIT LOG ───────────────────────────────────────────────────────────
router.get('/audit-log', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;
    const actionType = req.query.actionType;

    let query = 'SELECT * FROM audit_log';
    const params = [];

    if (actionType) {
      query += ' WHERE action_type = $1';
      params.push(actionType);
    }

    query += ' ORDER BY timestamp DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      auditLog: result.rows,
      limit,
      offset
    });
  } catch (err) {
    console.error('Fetch audit log error:', err);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// ── GET LOGIN ATTEMPTS (with failures) ──────────────────────────────────────
router.get('/login-attempts', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT user_id, COUNT(*) as count, MAX(timestamp) as last_attempt, status
       FROM audit_log WHERE action_type = 'LOGIN'
       GROUP BY user_id, status
       ORDER BY last_attempt DESC
       LIMIT 100`
    );

    res.json({
      success: true,
      loginAttempts: result.rows
    });
  } catch (err) {
    console.error('Fetch login attempts error:', err);
    res.status(500).json({ error: 'Failed to fetch login attempts' });
  }
});

// ── GET EVIDENCE SNAPSHOT ─────────────────────────────────────────────────
router.get('/evidence', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const pendingApps = await pool.query(
      `SELECT id, organization_name, contact_name, contact_email, status, submitted_at
       FROM pending_applications ORDER BY submitted_at DESC LIMIT 10`
    );

    const recentVerifications = await pool.query(
      `SELECT id, certificate_id, verification_status, verification_message, checked_at
       FROM verify_history ORDER BY checked_at DESC LIMIT 10`
    );

    res.json({
      success: true,
      pendingApplications: pendingApps.rows,
      recentVerifications: recentVerifications.rows
    });
  } catch (err) {
    console.error('Evidence snapshot error:', err);
    res.status(500).json({ error: 'Failed to fetch evidence snapshot' });
  }
});

// ── GET FAILED PASSWORD ATTEMPTS ────────────────────────────────────────────
router.get('/failed-passwords', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM wrong_password_attempts WHERE attempt_count > 3
       ORDER BY last_attempt DESC
       LIMIT 100`
    );

    res.json({
      success: true,
      failedAttempts: result.rows
    });
  } catch (err) {
    console.error('Fetch failed passwords error:', err);
    res.status(500).json({ error: 'Failed to fetch failed password attempts' });
  }
});

module.exports = router;
