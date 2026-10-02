const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db/connection');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Application = require('../models/Application');
const OTP = require('../models/OTP');
const EmailService = require('../services/emailService');
const { sendOtpEmail } = require('../services/otpEmail');
const demoAdminStore = require('../services/demoAdminStore');
const { DEFAULT_ADMIN_ACCOUNTS } = require('../services/defaultAdminAccounts');
const { logAudit, verifyToken, verifyAdmin, verifyAdminToken } = require('../middleware/auth');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isReservedAdminEmail(email) {
  return DEFAULT_ADMIN_ACCOUNTS.some(account => account.email === normalizeEmail(email));
}

function buildAuthIdentity(user, adminProfile = null) {
  const firstName = user.first_name ?? user.firstName ?? '';
  const lastName = user.last_name ?? user.lastName ?? '';
  const userType = user.user_type ?? user.userType ?? 'user';
  const name = adminProfile?.name || user.name || [firstName, lastName].filter(Boolean).join(' ');

  return {
    id: user.id,
    adminId: userType === 'admin' ? (adminProfile?.id || user.id) : undefined,
    name,
    profilePicture: (adminProfile?.profile_picture_url || user.profile_picture_url)
      ? `/api/auth/admin/${adminProfile?.id || user.id}/profile-picture`
      : null,
    firstName,
    lastName,
    email: user.email,
    userType,
    first_name: firstName,
    last_name: lastName,
    user_type: userType
  };
}

function getStoredProfilePictureUrl(admin) {
  return admin?.profile_picture_url ? `/api/auth/admin/${admin.id}/profile-picture` : null;
}

function isValidProfilePicture(value) {
  if (value === null) return true;
  if (typeof value !== 'string') return false;

  const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/);
  if (!match) return false;
  const image = Buffer.from(match[2], 'base64');
  return image.length > 0 &&
    image.toString('base64') === match[2] &&
    image.length <= 2 * 1024 * 1024;
}

function createAdminToken(identity) {
  const tokenIdentity = {
    ...identity,
    profilePicture: typeof identity.profilePicture === 'string' && !identity.profilePicture.startsWith('data:image/')
      ? identity.profilePicture
      : null
  };
  return jwt.sign(
    { ...tokenIdentity, isAdmin: true },
    process.env.ADMIN_JWT_SECRET || JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
}

async function findPasswordResetAccount(email) {
  if (process.env.DEMO_MODE === 'true') {
    const demoAdmin = await demoAdminStore.findByEmail(email, DEFAULT_ADMIN_ACCOUNTS);
    return demoAdmin || User.findByEmail(email);
  }
  return User.findByEmail(email);
}

function isAdminAccount(account) {
  return account?.user_type === 'admin' || account?.role === 'admin';
}

function getLoginApplicationNotice(application) {
  if (application?.status === 'pending') {
    return {
      status: 403,
      code: 'APPLICATION_PENDING',
      error: 'Your application has not been approved yet. Please check again later. If you believe it should already be approved, contact us through the website.'
    };
  }
  if (application?.status === 'rejected') {
    return {
      status: 403,
      code: 'APPLICATION_REJECTED',
      error: 'Your application was rejected. Please contact us through the website to lodge a complaint.'
    };
  }
  if (application?.status === 'approved') {
    return {
      status: 403,
      code: 'APPLICATION_APPROVED',
      error: 'Your application is approved. Sign in with the Certicheck account email provided for your application, or contact us through the website for help.'
    };
  }
  return null;
}

function validateNewPassword(password) {
  return typeof password === 'string' && password.length >= 6 && password !== 'password';
}

function emailConfigurationError(err) {
  return err?.code === 'EMAIL_NOT_CONFIGURED' || err?.code === 'EMAIL_FROM_MISMATCH';
}

function setAuthCookie(res, token) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('token', token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

async function ensureSeededAccounts() {
  const defaultAccounts = [
    ...DEFAULT_ADMIN_ACCOUNTS,
    {
      email: process.env.ISSUER_EMAIL || 'issuer@certicheck.com',
      password: process.env.ISSUER_PASSWORD || 'password',
      firstName: 'Issuer',
      lastName: 'User',
      userType: 'issuer'
    }
  ];

  for (const account of defaultAccounts) {
    const existingUser = await User.findByEmail(account.email);
    if (!existingUser) {
      const created = await User.create(account.email, account.password, account.firstName, account.lastName, account.userType);
      await pool.query(
        'UPDATE users SET is_active = TRUE, must_change_password = FALSE, updated_at = NOW() WHERE id = $1',
        [created.id]
      );
      if (account.userType === 'issuer') {
        await pool.query(
          `INSERT INTO issuer_profiles (user_id, organization_name, organization_type, website, contact_name, contact_role, certificate_volume, use_case, wallet_address, status, approval_timestamp, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'approved', NOW(), NOW(), NOW())
           ON CONFLICT (user_id) DO UPDATE SET status = 'approved', approval_timestamp = NOW(), updated_at = NOW()`,
          [created.id, `${account.firstName} ${account.lastName}`, 'Default Issuer', '', `${account.firstName} ${account.lastName}`, 'Administrator', '1-50', 'Default seeded issuer account', '',]
        );
      }
      continue;
    }

    if (account.userType === 'admin') {
      const legacyPassword = process.env.ADMIN_PASSWORD || 'admin123';
      if (existingUser.user_type === 'admin' && account.password !== legacyPassword && await User.verifyPassword(account.email, legacyPassword)) {
        await User.updatePassword(account.email, account.password, false);
      }
      continue;
    }

    if (account.userType === 'issuer') {
      const profileExists = await pool.query(
        'SELECT id FROM issuer_profiles WHERE user_id = $1 LIMIT 1',
        [existingUser.id]
      );

      if (!profileExists.rows[0]) {
        await pool.query(
          `INSERT INTO issuer_profiles (user_id, organization_name, organization_type, website, contact_name, contact_role, certificate_volume, use_case, wallet_address, status, approval_timestamp, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'approved', NOW(), NOW(), NOW())`,
          [existingUser.id, `${account.firstName} ${account.lastName}`, 'Default Issuer', '', `${account.firstName} ${account.lastName}`, 'Administrator', '1-50', 'Default seeded issuer account', '']
        );
      } else {
        await pool.query(
          `UPDATE issuer_profiles SET status = 'approved', approval_timestamp = COALESCE(approval_timestamp, NOW()), updated_at = NOW() WHERE user_id = $1`,
          [existingUser.id]
        );
      }
    }
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
      return res.status(400).json({ error: 'Please use a valid email address' });
    }

    if (isReservedAdminEmail(email)) {
      return res.status(403).json({ error: 'This email is reserved for admin access' });
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
    res.status(emailConfigurationError(err) ? 503 : 500).json({
      error: emailConfigurationError(err)
        ? err.message
        : 'Failed to send OTP email. Please try again.'
    });
  }
});

// ── RESEND OTP ──────────────────────────────────────────────────────────────
router.post('/resend-otp', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!email || !EmailService.isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    if (isReservedAdminEmail(email)) {
      return res.status(403).json({ error: 'This email is reserved for admin access' });
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
    res.status(emailConfigurationError(err) ? 503 : 500).json({
      error: emailConfigurationError(err)
        ? err.message
        : 'Failed to resend OTP email. Please try again.'
    });
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
    const { firstName, lastName, userType = 'user', otp } = req.body;

    if (!email || !firstName || !lastName) {
      return res.status(400).json({ error: 'Missing required fields: email, firstName, lastName' });
    }

    if (userType === 'admin') {
      return res.status(403).json({ error: 'Admin accounts cannot be created through registration' });
    }
    if (!['user', 'issuer'].includes(userType)) {
      return res.status(400).json({ error: 'Invalid user type' });
    }

    if (!EmailService.isValidEmail(email)) {
      return res.status(400).json({ error: 'Please use a valid email address' });
    }

    if (isReservedAdminEmail(email)) {
      return res.status(403).json({ error: 'This email is reserved for admin access' });
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

    const newUser = await User.create(email, 'password', firstName, lastName, userType);
    
    // Invalidate the verified OTP now that registration is complete
    await OTP.consume(email, 'signup');

    await logAudit(newUser.id, 'REGISTER', 'user', newUser.id, 'success');

    let welcomeEmailSent = false;
    try {
      const delivery = await EmailService.sendWelcome(email, firstName);
      welcomeEmailSent = EmailService.getReadiness().configured && Boolean(delivery);
    } catch {
      console.error('Welcome email was not delivered.');
    }

    res.status(201).json({
      success: true,
      code: 'ACCOUNT_PENDING_APPROVAL',
      message: 'Registration successful. Your account is pending admin approval. Once approved, sign in with the default password and change it immediately.',
      notification: { emailSent: welcomeEmailSent },
      user: {
        id: newUser.id,
        email: newUser.email,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        user_type: newUser.user_type,
        is_active: false,
        is_approved: false,
        isApproved: false,
        must_change_password: true,
        mustChangePassword: true
      }
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

    if (!email || !EmailService.isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    EmailService.assertConfigured();
    const user = await findPasswordResetAccount(email);
    if (!user) {
      // Don't reveal if email exists for security
      return res.json({
        success: true,
        message: 'If email exists, OTP will be sent'
      });
    }
    // Generate and store OTP
    const isDemoAdmin = process.env.DEMO_MODE === 'true' && isAdminAccount(user);
    const otp = isDemoAdmin
      ? await OTP.create(email, 'forgot_password')
      : await User.createPasswordResetOtp(email);
    if (!otp) {
      return res.json({ success: true, message: 'If email exists, OTP will be sent' });
    }
    
    // Send OTP email
    await sendOtpEmail(email, otp.otp_code, 'forgot_password');

    res.json({
      success: true,
      message: 'OTP sent to email',
      expiresAt: otp.expires_at
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(emailConfigurationError(err) ? 503 : 500).json({
      error: emailConfigurationError(err)
        ? err.message
        : 'Failed to send reset OTP email. Please try again.'
    });
  }
});

// ── VERIFY FORGOT PASSWORD OTP ───────────────────────────────────────────────
router.post('/verify-forgot-password', async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = req.body.otp;

    if (!email || !/^\d{6}$/.test(String(otp || '')) || !EmailService.isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email and OTP are required' });
    }
    const user = await findPasswordResetAccount(email);
    const verified = user && process.env.DEMO_MODE === 'true' && isAdminAccount(user)
      ? await OTP.verify(email, otp, 'forgot_password')
      : user
        ? await User.verifyPasswordResetOtp(email, otp)
        : false;
    
    if (!verified) {
      if (user && process.env.DEMO_MODE === 'true' && isAdminAccount(user)) {
        await OTP.incrementAttempts(email, otp, 'forgot_password');
      }
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

    if (!email || !newPassword || !/^\d{6}$/.test(String(otp || '')) || !EmailService.isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email and new password are required' });
    }
    const user = await findPasswordResetAccount(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired OTP' });
    }
    if (!validateNewPassword(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters and cannot be "password"' });
    }

    if (process.env.DEMO_MODE === 'true' && isAdminAccount(user)) {
      const verified = await OTP.isVerifiedCode(email, otp, 'forgot_password') ||
        await OTP.verify(email, otp, 'forgot_password');
      if (!verified) {
        await OTP.incrementAttempts(email, otp, 'forgot_password');
        return res.status(401).json({ error: 'Invalid or expired OTP' });
      }
      await demoAdminStore.updatePassword(user.id, newPassword, DEFAULT_ADMIN_ACCOUNTS);
      await OTP.consume(email, 'forgot_password');
    } else {
      const verified = await User.verifyPasswordResetOtp(email, otp);
      if (!verified) return res.status(401).json({ error: 'Invalid or expired OTP' });
      const updatedUser = await User.resetPasswordWithOtp(email, otp, newPassword);
      if (!updatedUser) return res.status(401).json({ error: 'Invalid or expired OTP' });
      if (isAdminAccount(user)) await Admin.syncPasswordHash(user.id);
    }
    
    await logAudit(user.id, 'PASSWORD_CHANGE', isAdminAccount(user) ? 'admin' : 'user', user.id, 'success', null, {
      adminId: isAdminAccount(user) ? user.id : null,
      adminName: isAdminAccount(user) ? (user.name || [user.first_name, user.last_name].filter(Boolean).join(' ')) : null
    });

    res.json({
      success: true,
      message: 'Password reset successfully'
    });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ── SET INITIAL PASSWORD ────────────────────────────────────────────────────
router.post('/change-password', verifyToken, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!validateNewPassword(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters and cannot be "password"' });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.is_active) return res.status(403).json({ error: 'Account is pending admin approval' });

    const updatedUser = await User.updatePassword(user.email, newPassword, false);
    if (user.user_type === 'admin') await Admin.syncPasswordHash(user.id);
    await logAudit(user.id, 'PASSWORD_CHANGE', 'user', user.id, 'success');
    const identity = buildAuthIdentity({ ...user, ...updatedUser });
    const token = jwt.sign(identity, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });
    setAuthCookie(res, token);
    res.json({ success: true, message: 'Password changed successfully', token, user: identity });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ error: 'Failed to change password' });
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
    if (!EmailService.isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    await ensureSeededAccounts();

    const user = await User.verifyPassword(email, password);
    
    if (!user) {
      const registeredUser = await User.findByEmail(email);
      if (!registeredUser) {
        const application = await Application.findApplicationByEmail(email);
        const applicationNotice = getLoginApplicationNotice(application);
        if (applicationNotice) {
          await logAudit(null, 'LOGIN', 'user', null, 'failed', applicationNotice.code);
          return res.status(applicationNotice.status).json(applicationNotice);
        }

        await logAudit(null, 'LOGIN', 'user', null, 'failed', 'Email not registered');
        return res.status(404).json({
          code: 'EMAIL_NOT_REGISTERED',
          error: 'We could not find an account or application for this email. Check the address or apply through the website first.'
        });
      }

      await logAudit(null, 'LOGIN', 'user', null, 'failed', 'Incorrect email or password');
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    if (!user.is_active) {
      const application = await Application.findApplicationByEmail(email);
      const applicationNotice = getLoginApplicationNotice(application);
      if (applicationNotice) {
        await logAudit(user.id, 'LOGIN', 'user', user.id, 'failed', applicationNotice.code);
        return res.status(applicationNotice.status).json(applicationNotice);
      }

      await logAudit(user.id, 'LOGIN', 'user', user.id, 'failed', 'Account pending approval');
      return res.status(403).json({
        code: 'USER_PENDING_APPROVAL',
        error: 'Your account is pending admin approval. You will be able to sign in after it is approved.'
      });
    }

    await logAudit(user.id, 'LOGIN', 'user', user.id, 'success');

    const issuerProfile = await pool.query(
      'SELECT organization_name, status, wallet_address FROM issuer_profiles WHERE user_id = $1 LIMIT 1',
      [user.id]
    );
    const profile = issuerProfile.rows[0] || {};

    const identity = buildAuthIdentity(user);
    const token = jwt.sign(
      { ...identity, must_change_password: user.must_change_password },
      JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    setAuthCookie(res, token);

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        ...identity,
        is_approved: Boolean(user.is_active),
        isApproved: Boolean(user.is_active),
        must_change_password: user.must_change_password,
        mustChangePassword: Boolean(user.must_change_password),
        organization_name: profile.organization_name || '',
        issuer_status: profile.status || '',
        wallet: profile.wallet_address || ''
      },
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
    if (!EmailService.isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }

    // In demo mode, accept each of the seeded admin identities without a database.
    if (process.env.DEMO_MODE === 'true') {
      const demoAdmin = await demoAdminStore.verifyPassword(email, password, DEFAULT_ADMIN_ACCOUNTS);
      if (demoAdmin) {
      const identity = buildAuthIdentity({
        id: demoAdmin.id,
        email: demoAdmin.email,
        first_name: demoAdmin.name,
        last_name: '',
        user_type: 'admin'
      }, demoAdmin);
      const token = createAdminToken(identity);
      setAuthCookie(res, token);
      await logAudit(demoAdmin.id, 'LOGIN', 'admin', demoAdmin.id, 'success', null, {
        adminId: demoAdmin.id,
        adminName: demoAdmin.name
      });
        return res.json({ success: true, token, user: identity });
      }
      await logAudit(null, 'LOGIN', 'admin', null, 'failed', 'Invalid admin credentials (demo)');
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    await ensureSeededAccounts();

    const user = await User.verifyPassword(email, password);
    if (!user || user.user_type !== 'admin') {
      // generic error to avoid account enumeration
      await logAudit(null, 'LOGIN', 'admin', null, 'failed', 'Invalid admin credentials');
      return res.status(401).json({ error: 'Incorrect email or password' });
    }

    if (!user.is_active) {
      await logAudit(user.id, 'LOGIN', 'admin', user.id, 'failed', 'Admin account inactive');
      return res.status(403).json({ error: 'Account inactive' });
    }

    const adminProfile = await Admin.ensureFromUser(user);
    const identity = buildAuthIdentity(user, adminProfile);
    const token = createAdminToken(identity);
    setAuthCookie(res, token);

    await logAudit(user.id, 'LOGIN', 'admin', user.id, 'success', null, {
      adminId: user.id,
      adminName: adminProfile?.name || identity.name
    });

    res.json({ success: true, token, user: identity });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/admin/:adminId/profile-picture', async (req, res) => {
  try {
    const adminId = Number(req.params.adminId);
    if (!Number.isSafeInteger(adminId) || adminId < 1) {
      return res.status(400).json({ error: 'Invalid admin ID' });
    }
    const admin = process.env.DEMO_MODE === 'true'
      ? await demoAdminStore.findById(adminId, DEFAULT_ADMIN_ACCOUNTS)
      : await Admin.findById(adminId);
    const match = admin?.profile_picture_url?.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/);
    if (!match) return res.status(404).json({ error: 'Profile picture not found' });

    res
      .set('X-Content-Type-Options', 'nosniff')
      .type(`image/${match[1]}`)
      .send(Buffer.from(match[2], 'base64'));
  } catch (err) {
    console.error('Admin profile picture fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch admin profile picture' });
  }
});

// ── ADMIN PROFILE ──────────────────────────────────────────────────────────
router.get('/admin/profile', verifyAdminToken, async (req, res) => {
  try {
    if (process.env.DEMO_MODE === 'true') {
      const admin = await demoAdminStore.findById(req.user.id, DEFAULT_ADMIN_ACCOUNTS);
      if (!admin) return res.status(404).json({ error: 'Admin account not found' });
      return res.json({ success: true, user: {
        id: admin.id, adminId: admin.id, name: admin.name, email: admin.email,
        profilePicture: getStoredProfilePictureUrl(admin),
        profile_picture_url: getStoredProfilePictureUrl(admin),
        role: admin.role, userType: 'admin'
      } });
    }

    const user = await User.findById(req.user.id);
    if (!user || user.user_type !== 'admin') {
      return res.status(404).json({ error: 'Admin account not found' });
    }
    const admin = await Admin.ensureFromUser(user);
    if (!admin) return res.status(404).json({ error: 'Admin profile not found' });

    res.json({
      success: true,
      user: {
        id: admin.id,
        adminId: admin.id,
        name: admin.name,
        email: admin.email,
        profilePicture: getStoredProfilePictureUrl(admin),
        profile_picture_url: getStoredProfilePictureUrl(admin),
        role: admin.role,
        userType: 'admin'
      }
    });
  } catch (err) {
    console.error('Admin profile fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch admin profile' });
  }
});

router.put('/admin/profile', verifyAdminToken, async (req, res) => {
  try {
    const hasName = Object.prototype.hasOwnProperty.call(req.body, 'name');
    const hasPicture = Object.prototype.hasOwnProperty.call(req.body, 'profilePicture');
    const name = hasName ? String(req.body.name || '').trim() : null;
    const profilePicture = hasPicture ? req.body.profilePicture : null;
    if (hasName && (!name || name.length > 255)) {
      return res.status(400).json({ error: 'Name must be between 1 and 255 characters' });
    }
    if (hasPicture && !isValidProfilePicture(profilePicture)) {
      return res.status(400).json({ error: 'Profile picture must be a PNG, JPEG, or WebP image under 2 MB' });
    }

    if (process.env.DEMO_MODE === 'true') {
      const admin = await demoAdminStore.updateProfile(req.user.id, {
        name, profilePicture, updatePicture: hasPicture
      }, DEFAULT_ADMIN_ACCOUNTS);
      if (!admin) return res.status(404).json({ error: 'Admin account not found' });
      const identity = buildAuthIdentity({
        id: admin.id, email: admin.email, first_name: admin.name, last_name: '', user_type: 'admin'
      }, admin);
      const token = createAdminToken(identity);
      setAuthCookie(res, token);
      await logAudit(admin.id, 'PROFILE_UPDATE', 'admin', admin.id, 'success', null, {
        adminId: admin.id,
        adminName: admin.name,
        nameUpdated: hasName,
        profilePictureUpdated: hasPicture
      });
      return res.json({ success: true, token, user: {
        ...identity,
        profile_picture_url: getStoredProfilePictureUrl(admin),
        role: admin.role
      } });
    }

    const user = await User.findById(req.user.id);
    if (!user || user.user_type !== 'admin') {
      return res.status(404).json({ error: 'Admin account not found' });
    }

    await Admin.ensureFromUser(user);
    const admin = await Admin.updateProfile(req.user.id, {
      name,
      profilePicture,
      updatePicture: hasPicture
    });
    if (!admin) return res.status(404).json({ error: 'Admin profile not found' });
    const updatedUser = await User.findById(req.user.id);
    const identity = buildAuthIdentity(updatedUser, admin);
    const token = createAdminToken(identity);
    setAuthCookie(res, token);

    await logAudit(req.user.id, 'PROFILE_UPDATE', 'admin', req.user.id, 'success', null, {
      adminId: admin.id,
      adminName: admin.name,
      nameUpdated: hasName,
      profilePictureUpdated: hasPicture
    });
    res.json({
      success: true,
      token,
      user: {
        ...identity,
        profile_picture_url: getStoredProfilePictureUrl(admin),
        role: admin.role
      }
    });
  } catch (err) {
    console.error('Admin profile update error:', err);
    res.status(500).json({ error: 'Failed to update admin profile' });
  }
});

router.get('/admin/users/pending', verifyAdminToken, verifyAdmin, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const users = await User.getPendingAccounts(limit, offset);
    res.json({
      success: true,
      users: users.map(user => ({
        ...user,
        is_approved: false,
        isApproved: false,
        mustChangePassword: Boolean(user.must_change_password)
      })),
      limit,
      offset
    });
  } catch (err) {
    console.error('Fetch pending user accounts error:', err);
    res.status(500).json({ error: 'Failed to fetch pending user accounts' });
  }
});

router.put('/admin/users/:userId/approve', verifyAdminToken, verifyAdmin, async (req, res) => {
  try {
    const userId = Number(req.params.userId);
    if (!Number.isSafeInteger(userId) || userId < 1) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    const user = await User.approveAccount(userId);
    if (!user) return res.status(404).json({ error: 'Pending user account not found' });

    await logAudit(req.user.id, 'ADMIN_ACTION', 'user', user.id, 'success', null, {
      action: 'USER_ACCOUNT_APPROVE',
      approvedUserEmail: user.email
    });
    res.json({
      success: true,
      message: 'User account approved. The user can sign in with the default password and will be required to change it.',
      user: {
        ...user,
        is_approved: true,
        isApproved: true,
        mustChangePassword: true
      }
    });
  } catch (err) {
    console.error('Approve user account error:', err);
    res.status(500).json({ error: 'Failed to approve user account' });
  }
});

router.post('/admin/change-password', verifyAdminToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (typeof currentPassword !== 'string' || !currentPassword) {
      return res.status(400).json({ error: 'Current password is required' });
    }
    if (!validateNewPassword(newPassword)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters and cannot be "password"' });
    }
    if (process.env.DEMO_MODE === 'true') {
      const admin = await demoAdminStore.verifyPassword(req.user.email, currentPassword, DEFAULT_ADMIN_ACCOUNTS);
      if (!admin || Number(admin.id) !== Number(req.user.id)) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }
      await demoAdminStore.updatePassword(admin.id, newPassword, DEFAULT_ADMIN_ACCOUNTS);
      await logAudit(admin.id, 'PASSWORD_CHANGE', 'admin', admin.id, 'success', null, {
        adminId: admin.id,
        adminName: admin.name
      });
      return res.json({ success: true, message: 'Password changed successfully' });
    }

    const user = await User.findById(req.user.id);
    if (!user || user.user_type !== 'admin') {
      return res.status(404).json({ error: 'Admin account not found' });
    }
    const verifiedUser = await User.verifyPassword(user.email, currentPassword);
    if (!verifiedUser) return res.status(401).json({ error: 'Current password is incorrect' });

    await User.updatePassword(user.email, newPassword, false);
    await Admin.syncPasswordHash(user.id);
    await logAudit(user.id, 'PASSWORD_CHANGE', 'admin', user.id, 'success', null, {
      adminId: user.id,
      adminName: [user.first_name, user.last_name].filter(Boolean).join(' ')
    });
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('Admin password change error:', err);
    res.status(500).json({ error: 'Failed to change admin password' });
  }
});

// ── GET PROFILE ─────────────────────────────────────────────────────────────
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const isDemoUser = req.user.isDemo === true && process.env.DEMO_MODE === 'true';
    const user = isDemoUser
      ? { id: req.user.id, email: req.user.email, user_type: req.user.user_type, is_active: true }
      : await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const profileResult = isDemoUser
      ? { rows: [{ organization_name: 'Certicheck Demo Issuer', status: 'approved', wallet_address: '' }] }
      : await pool.query(
        'SELECT organization_name, status, wallet_address FROM issuer_profiles WHERE user_id = $1 LIMIT 1',
        [req.user.id]
      );
    const profile = profileResult.rows[0] || {};
    res.json({
      success: true,
      user: {
        ...user,
        userType: user.user_type,
        issuer_status: profile.status || '',
        organization_name: profile.organization_name || '',
        wallet: profile.wallet_address || ''
      }
    });
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
