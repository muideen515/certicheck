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
      email: process.env.ISSUER_EMAIL || 'issuer@oau.edu.ng',
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

    if (!EmailService.isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address (e.g. name@example.com)' });
    }

    // Check if email already registered
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'This email is already registered. Please sign in instead.' });
    }

    // Generate and store OTP
    const otp = await OTP.create(email, 'signup');
    
    // Send OTP email
    await EmailService.sendOTP(email, otp.otp_code, 'signup');

    res.json({
      success: true,
      message: `OTP sent successfully to ${email}`,
      expiresAt: otp.expires_at
    });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ error: 'Failed to send OTP: ' + (err.message || 'Internal error') });
  }
});

// ── RESEND OTP ──────────────────────────────────────────────────────────────
router.post('/resend-otp', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email || !EmailService.isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'This email is already registered. Please sign in instead.' });
    }

    const otp = await OTP.create(email, 'signup');
    await EmailService.sendOTP(email, otp.otp_code, 'signup');

    res.json({
      success: true,
      message: `A new OTP has been sent to ${email}`,
      expiresAt: otp.expires_at
    });
  } catch (err) {
    console.error('Resend OTP error:', err);
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
});

// ── VERIFY OTP ───────────────────────────────────────────────────────────────
router.post('/verify-otp', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || '').trim();

    if (!email || !otp) {
      return res.status(400).json({ error: 'Both email and 6-digit OTP are required' });
    }

    if (!EmailService.isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address format' });
    }

    const verified = await OTP.verify(email, otp, 'signup');
    
    if (!verified) {
      await OTP.incrementAttempts(email, otp, 'signup');
      return res.status(401).json({ error: 'Invalid or expired OTP code. Please try again.' });
    }

    res.json({
      success: true,
      message: 'Email verified successfully'
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
    const { password, firstName, lastName, userType = 'user', otp } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'Missing required fields: email, password, firstName, lastName' });
    }

    if (!EmailService.isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address' });
    }

    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Verify OTP requirement: check if verified in session or via direct OTP parameter
    let otpValid = await OTP.isVerified(email, 'signup');
    if (!otpValid && otp) {
      const verifiedRecord = await OTP.verify(email, otp, 'signup');
      otpValid = !!verifiedRecord;
    }

    if (!otpValid) {
      return res.status(403).json({ 
        error: 'Email has not been verified with OTP. Please complete OTP verification first.' 
      });
    }

    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const newUser = await User.create(email, password, firstName, lastName, userType);
    
    // Invalidate the verified OTP now that registration is complete
    await OTP.consume(email, 'signup');

    await logAudit(newUser.id, 'REGISTER', 'user', newUser.id, 'success');

    // Send welcome email
    await EmailService.sendWelcome(email, firstName);

    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, user_type: newUser.user_type },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: newUser,
      token
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed: ' + (err.message || 'Internal server error') });
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

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    await ensureSeededAccounts();

    const user = await User.verifyPassword(email, password);
    
    if (!user) {
      await logAudit(null, 'LOGIN', 'user', null, 'failed', 'Invalid credentials');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_active) {
      await logAudit(user.id, 'LOGIN', 'user', user.id, 'failed', 'Account inactive');
      return res.status(403).json({ error: 'Account is inactive' });
    }

    await logAudit(user.id, 'LOGIN', 'user', user.id, 'success');

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

// ── ADMIN LOGIN (separate endpoint) ─────────────────────────────────────────
router.post('/admin/login', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // If running in DEMO_MODE, allow a built-in admin account without DB.
    if (process.env.DEMO_MODE === 'true') {
      const demoEmail = (process.env.ADMIN_EMAIL || 'admin@certicheck.com').toLowerCase();
      const demoPassword = process.env.ADMIN_PASSWORD || 'admin123';
      if (email === demoEmail && password === demoPassword) {
        const token = jwt.sign({ id: 0, email: email, user_type: 'admin', isAdmin: true }, process.env.ADMIN_JWT_SECRET || JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });
        await logAudit(0, 'LOGIN', 'admin', 0, 'success');
        return res.json({ success: true, token, user: { id: 0, email, first_name: 'Admin', last_name: 'User', user_type: 'admin' } });
      }
      await logAudit(null, 'LOGIN', 'admin', null, 'failed', 'Invalid admin credentials (demo)');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    await ensureSeededAccounts();

    const user = await User.verifyPassword(email, password);
    if (!user || user.user_type !== 'admin') {
      // generic error to avoid account enumeration
      await logAudit(null, 'LOGIN', 'admin', null, 'failed', 'Invalid admin credentials');
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_active) {
      await logAudit(user.id, 'LOGIN', 'admin', user.id, 'failed', 'Admin account inactive');
      return res.status(403).json({ error: 'Account inactive' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, user_type: 'admin', isAdmin: true }, process.env.ADMIN_JWT_SECRET || JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

    await logAudit(user.id, 'LOGIN', 'admin', user.id, 'success');

    res.json({ success: true, token, user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, user_type: user.user_type } });
  } catch (err) {
    console.error('Admin login error:', err);
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
