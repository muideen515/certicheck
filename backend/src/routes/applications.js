const express = require('express');
const Application = require('../models/Application');
const pool = require('../db/connection');
const { verifyToken, verifyAdmin, verifyAdminToken, logAudit } = require('../middleware/auth');
const EmailService = require('../services/emailService');

const router = express.Router();

// ── SUBMIT APPLICATION ──────────────────────────────────────────────────────
router.post('/submit', async (req, res) => {
  try {
    const { orgName, orgType, website, contactName, contactEmail, contactRole, volume, useCase, wallet } = req.body;

    if (!orgName || !contactName || !contactEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let userId = req.user?.id || null;
    if (!userId) {
      if (process.env.DEMO_MODE === 'true') {
        userId = 1;
      } else {
        const User = require('../models/User');
        const normalizedEmail = String(contactEmail).trim().toLowerCase();
        const defaultIssuerPassword = process.env.ISSUER_PASSWORD || 'password';
        let existingUser = await User.findByEmail(normalizedEmail);

        if (!existingUser) {
          const firstName = String(contactName).trim().split(/\s+/)[0] || 'Applicant';
          const lastName = String(contactName).trim().split(/\s+/).slice(1).join(' ') || 'User';
          existingUser = await User.create(normalizedEmail, defaultIssuerPassword, firstName, lastName, 'issuer');
        } else {
          await User.updatePassword(normalizedEmail, defaultIssuerPassword);
        }

        userId = existingUser.id;
      }
    }

    const app = await Application.create(
      userId, orgName, orgType, website, contactName, contactEmail, contactRole, volume, useCase, wallet
    );

    await EmailService.sendApplicationReceived(contactEmail, contactName, orgName);

    await logAudit(userId, 'APPLICATION_SUBMIT', 'application', app.id, 'success');

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
router.get('/pending', verifyAdminToken, verifyAdmin, async (req, res) => {
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
router.get('/rejected', verifyAdminToken, verifyAdmin, async (req, res) => {
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

// ── GET APPROVED APPLICATIONS (ADMIN) ───────────────────────────────────────
router.get('/approved', verifyAdminToken, verifyAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const apps = await Application.getByStatus('approved', limit, offset);
    const count = await Application.countByStatus('approved');

    res.json({
      success: true,
      applications: apps,
      total: count,
      limit,
      offset
    });
  } catch (err) {
    console.error('Fetch approved apps error:', err);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// ── APPROVE APPLICATION (ADMIN) ─────────────────────────────────────────────
router.put('/:appId/approve', verifyAdminToken, verifyAdmin, async (req, res) => {
  try {
    const { appId } = req.params;

    const app = await Application.approve(appId, req.user.id);

    if (app?.contact_email) {
      await EmailService.sendApplicationDecision(
        app.contact_email,
        app.contact_name,
        app.organization_name,
        true
      );
    }

    await logAudit(req.user.id, 'APPLICATION_APPROVE', 'application', appId, 'success');

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
router.post('/:appId/create-account', verifyAdminToken, verifyAdmin, async (req, res) => {
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

    // If user exists, link it and reset to the default issuer password
    const existing = await User.findByEmail(contactEmail);
    if (existing) {
      await User.updatePassword(contactEmail, process.env.ISSUER_PASSWORD || 'password');
      if (app.issuer_profile_id) {
        await pool.query('UPDATE issuer_profiles SET user_id = $1, updated_at = NOW() WHERE id = $2', [existing.id, app.issuer_profile_id]);
      }
      return res.json({ success: true, user: { id: existing.id, email: existing.email, first_name: existing.first_name, last_name: existing.last_name } });
    }

    // Default issuer password for accounts created from approved applications
    const tmpPassword = process.env.ISSUER_PASSWORD || 'password';

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
router.put('/:appId/reject', verifyAdminToken, verifyAdmin, async (req, res) => {
  try {
    const { appId } = req.params;

    const app = await Application.reject(appId, req.user.id);

    if (app?.contact_email) {
      await EmailService.sendApplicationDecision(
        app.contact_email,
        app.contact_name,
        app.organization_name,
        false,
        req.body?.reason || ''
      );
    }

    await logAudit(req.user.id, 'APPLICATION_REJECT', 'application', appId, 'success');

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
router.get('/', verifyAdminToken, verifyAdmin, async (req, res) => {
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
