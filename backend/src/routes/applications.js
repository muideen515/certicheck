const express = require('express');
const Application = require('../models/Application');
const { verifyToken, verifyAdmin, logAudit } = require('../middleware/auth');

const router = express.Router();

// ── SUBMIT APPLICATION ──────────────────────────────────────────────────────
router.post('/submit', verifyToken, async (req, res) => {
  try {
    const { orgName, orgType, website, contactName, contactEmail, contactRole, volume, useCase, wallet } = req.body;

    if (!orgName || !contactName || !contactEmail) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const app = await Application.create(
      req.user.id, orgName, orgType, website, contactName, contactEmail, contactRole, volume, useCase, wallet
    );

    await logAudit(req.user.id, 'APPLICATION_SUBMIT', 'application', app.id, 'success');

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

// ── REJECT APPLICATION (ADMIN) ──────────────────────────────────────────────
router.put('/:appId/reject', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { appId } = req.params;

    const app = await Application.reject(appId, req.user.id);

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
