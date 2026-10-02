const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fetch = require('cross-fetch');

const pool = require('../src/db/connection');
const User = require('../src/models/User');
const OTP = require('../src/models/OTP');
const EmailService = require('../src/services/emailService');
const authRoutes = require('../src/routes/auth');

const originalPoolQuery = pool.query;
const originalMethods = {
  findByEmail: User.findByEmail,
  verifyPassword: User.verifyPassword,
  createUser: User.create,
  updatePassword: User.updatePassword,
  createPasswordResetOtp: User.createPasswordResetOtp,
  verifyPasswordResetOtp: User.verifyPasswordResetOtp,
  resetPasswordWithOtp: User.resetPasswordWithOtp,
  createOtp: OTP.create,
  verifyOtp: OTP.verify,
  isOtpVerified: OTP.isVerified,
  incrementOtpAttempts: OTP.incrementAttempts,
  consumeOtp: OTP.consume,
  sendOtp: EmailService.sendOTP,
  sendWelcome: EmailService.sendWelcome
};

let server;

test('OTP memory fallback enforces the maximum verification attempts', async () => {
  const email = 'limited@gmail.com';
  const key = `${email}:forgot_password`;
  const originalQuery = pool.query;
  pool.query = async () => { throw new Error('database unavailable'); };
  OTP.memStore.set(key, {
    otp_code: '123456',
    expires_at: new Date(Date.now() + 60_000),
    is_verified: false,
    attempts: 5,
    max_attempts: 5
  });

  try {
    assert.equal(await OTP.verify(email, '123456', 'forgot_password'), null);
  } finally {
    OTP.memStore.delete(key);
    pool.query = originalQuery;
  }
});

test('verified OTP check rejects an expired code', async () => {
  const originalQuery = pool.query;
  let queryText = '';
  pool.query = async sql => {
    queryText = sql;
    return { rows: [{ verified_at: new Date(), expires_at: new Date(Date.now() - 1000) }] };
  };

  try {
    assert.equal(await OTP.isVerified('person@certicheck.com', 'forgot_password'), false);
    assert.match(queryText, /expires_at > NOW\(\)/);
  } finally {
    pool.query = originalQuery;
  }
});

test.after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  pool.query = originalPoolQuery;
  User.findByEmail = originalMethods.findByEmail;
  User.verifyPassword = originalMethods.verifyPassword;
  User.create = originalMethods.createUser;
  User.updatePassword = originalMethods.updatePassword;
  User.createPasswordResetOtp = originalMethods.createPasswordResetOtp;
  User.verifyPasswordResetOtp = originalMethods.verifyPasswordResetOtp;
  User.resetPasswordWithOtp = originalMethods.resetPasswordWithOtp;
  OTP.create = originalMethods.createOtp;
  OTP.verify = originalMethods.verifyOtp;
  OTP.isVerified = originalMethods.isOtpVerified;
  OTP.incrementAttempts = originalMethods.incrementOtpAttempts;
  OTP.consume = originalMethods.consumeOtp;
  EmailService.sendOTP = originalMethods.sendOtp;
  EmailService.sendWelcome = originalMethods.sendWelcome;
});

test('signup and forgot-password OTP flows accept external email domains and consume reset codes', async () => {
  const user = {
    id: 42,
    email: 'person@gmail.com',
    password_hash: 'existing-hash',
    must_change_password: false,
    is_active: true,
    user_type: 'user'
  };
  const deliveries = [];
  const passwordUpdates = [];
  const registeredUsers = new Map([[user.email, user]]);
  const registrations = [];
  let verified = false;
  let signupVerified = false;
  let signupConsumed = false;
  let forgotConsumed = false;
  let failedAttempts = 0;

  User.findByEmail = async email => registeredUsers.get(email.toLowerCase()) || null;
  User.verifyPassword = async email => email.toLowerCase() === user.email ? user : null;
  User.create = async (email, password, firstName, lastName, userType) => {
    const newUser = {
      id: 43,
      email,
      password_hash: 'new-user-hash',
      first_name: firstName,
      last_name: lastName,
      user_type: userType,
      is_active: false,
      must_change_password: true
    };
    registrations.push({ email, password, firstName, lastName, userType });
    registeredUsers.set(email, newUser);
    return newUser;
  };
  User.updatePassword = async (email, password) => {
    passwordUpdates.push({ email, password });
    return user;
  };
  User.createPasswordResetOtp = async email => ({
    otp_code: '123456',
    expires_at: new Date(Date.now() + 10 * 60 * 1000),
    email
  });
  User.verifyPasswordResetOtp = async (email, code) => {
    if (email === user.email && code === '123456' && !forgotConsumed) return true;
    failedAttempts += 1;
    return false;
  };
  User.resetPasswordWithOtp = async (email, code, password) => {
    if (email !== user.email || code !== '123456' || forgotConsumed) return null;
    forgotConsumed = true;
    user.password = password;
    user.must_change_password = false;
    return user;
  };
  OTP.create = async (email, type) => ({ otp_code: '123456', expires_at: new Date(Date.now() + 10 * 60 * 1000), email, type });
  OTP.verify = async (email, code, type) => {
    if (email === 'student@school.edu' && code === '123456' && type === 'signup') {
      signupVerified = true;
      return { id: 2 };
    }
    if (email === user.email && code === '123456' && type === 'forgot_password') {
      verified = true;
      return { id: 1 };
    }
    return null;
  };
  OTP.isVerified = async (email, type) => type === 'signup'
    ? signupVerified && !signupConsumed
    : verified && !forgotConsumed;
  OTP.incrementAttempts = async () => { failedAttempts += 1; };
  OTP.consume = async (email, type) => {
    if (type === 'signup') signupConsumed = true;
    else forgotConsumed = true;
  };
  EmailService.sendOTP = async (email, code, type) => {
    deliveries.push({ email, code, type });
    return { success: true };
  };
  EmailService.sendWelcome = async () => {
    throw new Error('test SMTP delivery failure');
  };
  pool.query = async () => ({ rows: [] });

  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body) => fetch(`${baseUrl}/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const invalidSignupEmail = await post('send-otp', { email: 'not-an-email' });
  assert.equal(invalidSignupEmail.status, 400);

  const signupOtpResponse = await post('send-otp', { email: 'Student@school.edu' });
  assert.equal(signupOtpResponse.status, 200);
  assert.deepEqual(deliveries[0], { email: 'student@school.edu', code: '123456', type: 'signup' });

  const signupVerifyResponse = await post('verify-otp', { email: 'student@school.edu', otp: '123456' });
  assert.equal(signupVerifyResponse.status, 200);
  const registrationResponse = await post('register', {
    email: 'Student@school.edu',
    password: 'valid-password',
    firstName: 'New',
    lastName: 'Student'
  });
  assert.equal(registrationResponse.status, 201);
  const registrationData = await registrationResponse.json();
  assert.equal(registrationData.notification.emailSent, false);
  assert.equal(registrationData.user.is_approved, false);
  assert.equal(registrationData.user.must_change_password, true);
  assert.equal(registrationData.token, undefined);
  assert.deepEqual(registrations, [{
    email: 'student@school.edu',
    password: 'password',
    firstName: 'New',
    lastName: 'Student',
    userType: 'user'
  }]);

  const externalDomainLogin = await post('login', { email: 'PERSON@GMAIL.COM', password: 'valid-password' });
  assert.equal(externalDomainLogin.status, 200);
  const invalidLoginEmail = await post('login', { email: 'not-an-email', password: 'valid-password' });
  assert.equal(invalidLoginEmail.status, 400);

  const invalidForgotEmail = await post('forgot-password', { email: 'not-an-email' });
  assert.equal(invalidForgotEmail.status, 400);
  assert.equal(deliveries.length, 1);

  const forgotResponse = await post('forgot-password', { email: 'PERSON@GMAIL.COM' });
  assert.equal(forgotResponse.status, 200);
  assert.deepEqual(deliveries[1], { email: user.email, code: '123456', type: 'forgot_password' });

  const wrongOtp = await post('verify-forgot-password', { email: user.email, otp: '000000' });
  assert.equal(wrongOtp.status, 401);
  assert.equal(failedAttempts, 1);

  const verifyResponse = await post('verify-forgot-password', { email: user.email, otp: '123456' });
  assert.equal(verifyResponse.status, 200);

  const resetResponse = await post('reset-password', { email: user.email, otp: '123456', newPassword: 'new-secure-password' });
  assert.equal(resetResponse.status, 200);
  assert.deepEqual(passwordUpdates, []);
  assert.equal(user.password, 'new-secure-password');
  assert.equal(user.must_change_password, false);
  assert.equal(forgotConsumed, true);

  const reusedOtp = await post('reset-password', { email: user.email, otp: '123456', newPassword: 'another-password' });
  assert.equal(reusedOtp.status, 401);

  const invalidVerifyEmail = await post('verify-forgot-password', { email: 'not-an-email', otp: '123456' });
  const invalidResetEmail = await post('reset-password', { email: 'not-an-email', otp: '123456', newPassword: 'another-password' });
  assert.equal(invalidVerifyEmail.status, 400);
  assert.equal(invalidResetEmail.status, 400);

  EmailService.sendOTP = async () => {
    const error = new Error('Email delivery is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.');
    error.code = 'EMAIL_NOT_CONFIGURED';
    throw error;
  };
  const missingSmtpResponse = await post('forgot-password', { email: user.email });
  assert.equal(missingSmtpResponse.status, 503);
  assert.match((await missingSmtpResponse.json()).error, /Email delivery is not configured/);
});