const express = require('express');
const VerifyHistory = require('../models/VerifyHistory');
const { verifyToken, verifyAdmin, logAudit } = require('../middleware/auth');

const router = express.Router();

// ── LOG CERTIFICATE VERIFICATION ───────────────────────────────────────────
router.post('/check', async (req, res) => {
  try {
    const { certId, status, message } = req.body;

    if (!certId || !status) {
      return res.status(400).json({ error: 'Missing certId or status' });
    }

    const entry = await VerifyHistory.create(req.user?.id || null, certId, status, message);

    await logAudit(req.user?.id || null, 'CERTIFICATE_VERIFY', 'certificate', entry.id, 'success', null, { certId, status });

    res.status(201).json({
      success: true,
      message: 'Verification logged',
      entry
    });
  } catch (err) {
    console.error('Verify check error:', err);
    res.status(500).json({ error: 'Failed to log verification' });
  }
});

// ── GET VERIFICATION HISTORY (ADMIN) ────────────────────────────────────────
router.get('/history', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const history = await VerifyHistory.getHistory(limit, offset);
    const count = await VerifyHistory.count();

    res.json({
      success: true,
      history,
      total: count,
      limit,
      offset
    });
  } catch (err) {
    console.error('Fetch history error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ── GET USER VERIFICATION HISTORY ───────────────────────────────────────────
router.get('/my-history', verifyToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const history = await VerifyHistory.getUserHistory(req.user.id, limit, offset);

    res.json({
      success: true,
      history,
      limit,
      offset
    });
  } catch (err) {
    console.error('Fetch user history error:', err);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ── REVOKE CERTIFICATE (ADMIN) ──────────────────────────────────────────────
router.put('/:entryId/revoke', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { entryId } = req.params;

    const entry = await VerifyHistory.revoke(entryId, req.user.id);

    await logAudit(req.user.id, 'CERTIFICATE_REVOKE', 'certificate', entryId, 'success');

    res.json({
      success: true,
      message: 'Certificate revoked',
      entry
    });
  } catch (err) {
    console.error('Revoke certificate error:', err);
    res.status(500).json({ error: 'Failed to revoke certificate' });
  }
});

// ── GET REVOKED CERTIFICATES (ADMIN) ────────────────────────────────────────
router.get('/revoked', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const revoked = await VerifyHistory.getRevokedCerts(limit, offset);

    res.json({
      success: true,
      revoked,
      limit,
      offset
    });
  } catch (err) {
    console.error('Fetch revoked certs error:', err);
    res.status(500).json({ error: 'Failed to fetch revoked certificates' });
  }
});

module.exports = router;
