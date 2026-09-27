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
  updatePassword: User.updatePassword,
  createOtp: OTP.create,
  verifyOtp: OTP.verify,
  isOtpVerified: OTP.isVerified,
  incrementOtpAttempts: OTP.incrementAttempts,
  consumeOtp: OTP.consume,
  sendOtp: EmailService.sendOTP
};

let server;

test('OTP memory fallback enforces the maximum verification attempts', async () => {
  const email = 'limited@certicheck.com';
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
  User.updatePassword = originalMethods.updatePassword;
  OTP.create = originalMethods.createOtp;
  OTP.verify = originalMethods.verifyOtp;
  OTP.isVerified = originalMethods.isOtpVerified;
  OTP.incrementAttempts = originalMethods.incrementOtpAttempts;
  OTP.consume = originalMethods.consumeOtp;
  EmailService.sendOTP = originalMethods.sendOtp;
});

test('forgot password delivers a Certicheck OTP and consumes it after reset', async () => {
  const user = {
    id: 42,
    email: 'person@certicheck.com',
    password_hash: 'existing-hash',
    must_change_password: false
  };
  const deliveries = [];
  const passwordUpdates = [];
  let verified = false;
  let consumed = false;
  let failedAttempts = 0;

  User.findByEmail = async email => email.toLowerCase() === user.email ? user : null;
  User.updatePassword = async (email, password) => {
    passwordUpdates.push({ email, password });
    return user;
  };
  OTP.create = async (email, type) => ({ otp_code: '123456', expires_at: new Date(Date.now() + 10 * 60 * 1000), email, type });
  OTP.verify = async (email, code, type) => {
    if (email === user.email && code === '123456' && type === 'forgot_password') {
      verified = true;
      return { id: 1 };
    }
    return null;
  };
  OTP.isVerified = async () => verified && !consumed;
  OTP.incrementAttempts = async () => { failedAttempts += 1; };
  OTP.consume = async () => { consumed = true; };
  EmailService.sendOTP = async (email, code, type) => {
    deliveries.push({ email, code, type });
    return { success: true };
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

  const outsideDomain = await post('forgot-password', { email: 'person@example.com' });
  assert.equal(outsideDomain.status, 400);
  assert.equal(deliveries.length, 0);

  const forgotResponse = await post('forgot-password', { email: 'PERSON@CERTICHECK.COM' });
  assert.equal(forgotResponse.status, 200);
  assert.deepEqual(deliveries, [{ email: user.email, code: '123456', type: 'forgot_password' }]);

  const wrongOtp = await post('verify-forgot-password', { email: user.email, otp: '000000' });
  assert.equal(wrongOtp.status, 401);
  assert.equal(failedAttempts, 1);

  const verifyResponse = await post('verify-forgot-password', { email: user.email, otp: '123456' });
  assert.equal(verifyResponse.status, 200);

  const resetResponse = await post('reset-password', { email: user.email, otp: '123456', newPassword: 'new-secure-password' });
  assert.equal(resetResponse.status, 200);
  assert.deepEqual(passwordUpdates, [{ email: user.email, password: 'new-secure-password' }]);
  assert.equal(consumed, true);

  const reusedOtp = await post('reset-password', { email: user.email, otp: '123456', newPassword: 'another-password' });
  assert.equal(reusedOtp.status, 401);

  const outsideDomainVerify = await post('verify-forgot-password', { email: 'person@example.com', otp: '123456' });
  const outsideDomainReset = await post('reset-password', { email: 'person@example.com', otp: '123456', newPassword: 'another-password' });
  assert.equal(outsideDomainVerify.status, 400);
  assert.equal(outsideDomainReset.status, 400);
});