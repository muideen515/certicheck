const express = require('express');
const Application = require('../models/Application');
const pool = require('../db/connection');
const { verifyToken, verifyAdmin, logAudit } = require('../middleware/auth');

const router = express.Router();

// ── SUBMIT APPLICATION ──────────────────────────────────────────────────────
router.post('/submit', verifyToken, async (req, res) => {
  try {
    const { orgName, orgType, website, contactName, contactEmail, contactRole, volume, useCase, wallet } = req.body;

    if (!orgName || !contactName) {
      return res.status(400).json({ error: 'Organization and contact name are required' });
    }

    const normalizedEmail = Application.normalizeIssuerEmail(contactEmail, contactName);

    const app = await Application.create(
      req.user.id, orgName, orgType, website, contactName, normalizedEmail, contactRole, volume, useCase, wallet
    );

    await logAudit(req.user.id, 'APPLICATION_SUBMIT', 'application', app.id, 'success', null, {
      institution: orgName,
      email: normalizedEmail,
      name: contactName,
      orgType,
      contactRole,
      website
    });

    res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      application: app
    });
  } catch (err) {
    console.error('Application submit error:', err);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// ── GET PENDING APPLICATIONS (ADMIN) ────────────────────────────────────────
router.get('/pending', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const apps = await Application.getPending(limit, offset);
    const count = await Application.countByStatus('pending');

    res.json({
      success: true,
      applications: apps,
      total: count,
      limit,
      offset
    });
  } catch (err) {
    console.error('Fetch pending apps error:', err);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// ── GET REJECTED APPLICATIONS (ADMIN) ───────────────────────────────────────
router.get('/rejected', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const apps = await Application.getByStatus('rejected', limit, offset);
    const count = await Application.countByStatus('rejected');

    res.json({
      success: true,
      applications: apps,
      total: count,
      limit,
      offset
    });
  } catch (err) {
    console.error('Fetch rejected apps error:', err);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// ── APPROVE APPLICATION (ADMIN) ─────────────────────────────────────────────
router.put('/:appId/approve', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { appId } = req.params;

    const app = await Application.approve(appId, req.user.id);
    const applicationInfo = await pool.query(
      `SELECT organization_name, contact_name, contact_email FROM pending_applications WHERE id = $1 LIMIT 1`,
      [appId]
    );
    const application = applicationInfo.rows[0] || {};

    await logAudit(req.user.id, 'APPLICATION_APPROVE', 'application', appId, 'success', null, {
      institution: application.organization_name || app?.organization_name || 'Unknown institution',
      email: application.contact_email || '',
      name: application.contact_name || ''
    });

    res.json({
      success: true,
      message: 'Application approved',
      application: app
    });
  } catch (err) {
    console.error('Approve application error:', err);
    res.status(500).json({ error: 'Failed to approve application' });
  }
});

// ── CREATE OR LINK ISSUER ACCOUNT FOR APPLICATION (ADMIN) ──────────────────
router.post('/:appId/create-account', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { appId } = req.params;

    // Fetch pending application and its issuer_profile
    const appRes = await pool.query(
      `SELECT pa.*, ip.id AS issuer_profile_id, ip.user_id
       FROM pending_applications pa
       LEFT JOIN issuer_profiles ip ON pa.issuer_id = ip.id
       WHERE pa.id = $1 LIMIT 1`,
      [appId]
    );

    const app = appRes.rows[0];
    if (!app) return res.status(404).json({ error: 'Application not found' });

    // If there's already a linked user, return that info (no-op)
    if (app.user_id) {
      const userRes = await pool.query('SELECT id, email, first_name, last_name FROM users WHERE id = $1 LIMIT 1', [app.user_id]);
      const user = userRes.rows[0];
      return res.json({ success: true, user });
    }

    // Create a new user account for the contact email
    const contactEmail = String(app.contact_email || app.contactEmail || '').trim().toLowerCase();
    if (!contactEmail) return res.status(400).json({ error: 'No contact email available to create account' });

    const User = require('../models/User');

    // If user exists, link it
    const existing = await User.findByEmail(contactEmail);
    if (existing) {
      // Link issuer_profile to existing user
      if (app.issuer_profile_id) {
        await pool.query('UPDATE issuer_profiles SET user_id = $1, updated_at = NOW() WHERE id = $2', [existing.id, app.issuer_profile_id]);
      }
      return res.json({ success: true, user: { id: existing.id, email: existing.email, first_name: existing.first_name, last_name: existing.last_name } });
    }

    // Generate temporary password
    const tmpPassword = 'pw-' + Math.random().toString(36).slice(2, 10);

    // Split contact name into first/last
    const contactName = String(app.contact_name || app.contactName || '').trim();
    const parts = contactName.split(/\s+/).filter(Boolean);
    const firstName = parts.shift() || 'Issuer';
    const lastName = parts.join(' ') || 'User';

    // Create user and set as issuer
    const newUser = await User.create(contactEmail, tmpPassword, firstName, lastName, 'issuer');

    // Link issuer profile
    if (app.issuer_profile_id) {
      await pool.query("UPDATE issuer_profiles SET user_id = $1, status = COALESCE(status, 'approved'), updated_at = NOW() WHERE id = $2", [newUser.id, app.issuer_profile_id]);
    }

    // Also update users table to ensure user_type=issuer (already set by create)

    // Return generated credentials to admin
    res.json({ success: true, credentials: { email: contactEmail, password: tmpPassword }, user: { id: newUser.id, email: newUser.email, first_name: newUser.first_name, last_name: newUser.last_name } });
  } catch (err) {
    console.error('Create account for application error:', err);
    res.status(500).json({ error: 'Failed to create or link account for application' });
  }
});

// ── REJECT APPLICATION (ADMIN) ──────────────────────────────────────────────
router.put('/:appId/reject', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { appId } = req.params;

    const app = await Application.reject(appId, req.user.id);
    const applicationInfo = await pool.query(
      `SELECT organization_name, contact_name, contact_email FROM pending_applications WHERE id = $1 LIMIT 1`,
      [appId]
    );
    const application = applicationInfo.rows[0] || {};

    await logAudit(req.user.id, 'APPLICATION_REJECT', 'application', appId, 'success', null, {
      institution: application.organization_name || app?.organization_name || 'Unknown institution',
      email: application.contact_email || '',
      name: application.contact_name || ''
    });

    res.json({
      success: true,
      message: 'Application rejected',
      application: app
    });
  } catch (err) {
    console.error('Reject application error:', err);
    res.status(500).json({ error: 'Failed to reject application' });
  }
});

// ── GET ALL APPLICATIONS (ADMIN) ────────────────────────────────────────────
router.get('/', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const apps = await Application.getAll(limit, offset);

    res.json({
      success: true,
      applications: apps,
      limit,
      offset
    });
  } catch (err) {
    console.error('Fetch all apps error:', err);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

module.exports = router;
