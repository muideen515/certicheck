const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const OTP = require('../models/OTP');
const EmailService = require('../services/emailService');
const { logAudit, verifyToken } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function ensureSeededAccounts() {
  const defaultAccounts = [
    {
      email: process.env.ADMIN_EMAIL || 'admin@certicheck.com',
      password: process.env.ADMIN_PASSWORD || 'admin123',
      firstName: 'Admin',
      lastName: 'User',
      userType: 'admin'
    },
    {
      email: process.env.ISSUER_EMAIL || 'issuer@certicheck.com',
      password: process.env.ISSUER_PASSWORD || 'issuer123',
      firstName: 'Issuer',
      lastName: 'User',
      userType: 'issuer'
    }
  ];

  for (const account of defaultAccounts) {
    const existingUser = await User.findByEmail(account.email);
    if (!existingUser) {
      await User.create(account.email, account.password, account.firstName, account.lastName, account.userType);
      continue;
    }

    await User.updatePassword(account.email, account.password);
  }
}

// ── SEND OTP FOR SIGNUP ──────────────────────────────────────────────────────
router.post('/send-otp', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if email already registered
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    // Generate and store OTP
    const otp = await OTP.create(email, 'signup');
    
    // Send OTP email
    await EmailService.sendOTP(email, otp.otp_code, 'signup');

    res.json({
      success: true,
      message: 'OTP sent to email',
      expiresAt: otp.expires_at
    });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

// ── VERIFY OTP ───────────────────────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = req.body.otp;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP required' });
    }

    const verified = await OTP.verify(email, otp, 'signup');
    
    if (!verified) {
      await OTP.incrementAttempts(email, otp, 'signup');
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }

    res.json({
      success: true,
      message: 'OTP verified successfully'
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    res.status(500).json({ error: 'OTP verification failed' });
  }
});

// ── REGISTER WITH OTP ────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { firstName, lastName } = req.body;
    const fixedPassword = 'password';
    const userType = String(req.body.userType || 'issuer').toLowerCase() || 'issuer';

    const fallbackOrgName = [firstName || 'Issuer', lastName].filter(Boolean).join(' ') || 'Issuer';
    const orgName = String(req.body.orgName || `${fallbackOrgName} - Pending Issuer`).trim();
    const orgType = String(req.body.orgType || 'other').trim();
    const website = String(req.body.website || '').trim();
    const fallbackContactName = [firstName, lastName].filter(Boolean).join(' ') || 'Issuer';
    const contactName = String(req.body.contactName || fallbackContactName).trim();
    const contactEmail = normalizeEmail(req.body.contactEmail || email);
    const contactRole = String(req.body.contactRole || 'Issuer').trim();
    const volume = String(req.body.volume || '1 - 100 certificates').trim();
    const useCase = String(req.body.useCase || 'Pending issuer signup approval').trim();
    const wallet = String(req.body.wallet || '').trim();

    if (!email || !firstName || !lastName) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!email.endsWith('@certicheck.com')) {
      return res.status(400).json({ error: 'Please use a @certicheck.com email address.' });
    }

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const newUser = await User.create(email, fixedPassword, firstName, lastName, userType, false);

    const app = await require('../models/Application').create(
      newUser.id,
      orgName,
      orgType,
      website,
      contactName,
      contactEmail,
      contactRole,
      volume,
      useCase,
      wallet
    );

    await logAudit(newUser.id, 'REGISTER', 'user', newUser.id, 'success', null, {
      pendingApplicationId: app?.id,
      institution: orgName,
      email,
      name: `${firstName} ${lastName}`.trim()
    });

    await EmailService.sendWelcome(email, firstName);

    res.status(201).json({
      success: true,
      message: 'Registration submitted for approval',
      user: { ...newUser, user_type: newUser.user_type, is_active: false },
      pending: app
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── FORGOT PASSWORD - SEND OTP ───────────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if email exists
    const user = await User.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists for security
      return res.json({
        success: true,
        message: 'If email exists, OTP will be sent'
      });
    }

    // Generate and store OTP
    const otp = await OTP.create(email, 'forgot_password');
    
    // Send OTP email
    await EmailService.sendOTP(email, otp.otp_code, 'forgot_password');

    res.json({
      success: true,
      message: 'OTP sent to email',
      expiresAt: otp.expires_at
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to send reset OTP' });
  }
});

// ── VERIFY FORGOT PASSWORD OTP ───────────────────────────────────────────────
router.post('/verify-forgot-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = req.body.otp;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP required' });
    }

    const verified = await OTP.verify(email, otp, 'forgot_password');
    
    if (!verified) {
      await OTP.incrementAttempts(email, otp, 'forgot_password');
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }

    res.json({
      success: true,
      message: 'OTP verified successfully'
    });
  } catch (err) {
    console.error('Verify forgot password OTP error:', err);
    res.status(500).json({ error: 'OTP verification failed' });
  }
});

// ── RESET PASSWORD ───────────────────────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { newPassword, otp } = req.body;

    if (!email || !newPassword) {
      return res.status(400).json({ error: 'Email and new password required' });
    }

    // Verify OTP
    const isOtpVerified = await OTP.isVerified(email, 'forgot_password');
    if (!isOtpVerified) {
      return res.status(401).json({ error: 'OTP verification required' });
    }

    // Check if email exists
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Update password
    await User.updatePassword(email, newPassword);
    
    await logAudit(user.id, 'PASSWORD_CHANGE', 'user', user.id, 'success');

    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ── LOGIN ───────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;
    const loginContext = String(req.body.loginContext || 'user').toLowerCase();

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    await ensureSeededAccounts();

    const user = await User.verifyPassword(email, password);
    
    if (!user) {
      await logAudit(null, 'LOGIN', 'user', null, 'failed', 'Invalid credentials');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.user_type === 'admin' && loginContext !== 'admin') {
      await logAudit(user.id, 'LOGIN', 'user', user.id, 'failed', 'Admin login restricted to admin dashboard');
      return res.status(403).json({ error: 'Admin accounts are only for the admin dashboard.' });
    }

    if (user.user_type === 'issuer') {
      if (!user.email.toLowerCase().endsWith('@certicheck.com')) {
        await logAudit(user.id, 'LOGIN', 'user', user.id, 'failed', 'Issuer email must use @certicheck.com');
        return res.status(403).json({ error: 'Issuer accounts must use a @certicheck.com email.' });
      }

      const profileRes = await pool.query(
        'SELECT status FROM issuer_profiles WHERE user_id = $1 LIMIT 1',
        [user.id]
      );
      const profileStatus = profileRes.rows[0]?.status || 'pending';

      if (profileStatus !== 'approved') {
        await logAudit(user.id, 'LOGIN', 'user', user.id, 'failed', `Issuer approval status: ${profileStatus}`);
        return res.status(403).json({ error: 'Issuer access is still pending approval.' });
      }
    }

    if (!user.is_active) {
      await logAudit(user.id, 'LOGIN', 'user', user.id, 'failed', 'Account inactive');
      return res.status(403).json({ error: 'Account is inactive' });
    }

    await logAudit(user.id, 'LOGIN', 'user', user.id, 'success', null, {
      institution: user.user_type === 'issuer' ? 'CertiCheck Issuer' : 'CertiCheck',
      email: user.email,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, user_type: user.user_type },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, user_type: user.user_type },
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── GET PROFILE ─────────────────────────────────────────────────────────────
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ success: true, user: { ...user, userType: user.user_type } });
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// ── UPDATE PROFILE ──────────────────────────────────────────────────────────
router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { firstName, lastName } = req.body;
    const user = await User.updateProfile(req.user.id, firstName, lastName);
    
    await logAudit(req.user.id, 'PROFILE_UPDATE', 'user', req.user.id, 'success');
    
    res.json({ success: true, user });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
