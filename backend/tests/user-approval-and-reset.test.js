const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

const pool = require('../src/db/connection');
const User = require('../src/models/User');

const originalQuery = pool.query;
test.after(() => {
  pool.query = originalQuery;
});

test('account approval stores a hashed default password and forces password change', async () => {
  let queryText;
  let queryParams;
  pool.query = async (sql, params) => {
    queryText = sql;
    queryParams = params;
    return {
      rows: [{
        id: 12,
        email: 'new.user@example.edu',
        is_active: true,
        must_change_password: true
      }]
    };
  };

  const approved = await User.approveAccount(12);

  assert.match(queryText, /is_active = TRUE, must_change_password = TRUE/);
  assert.match(queryText, /WHERE id = \$2 AND is_active = FALSE AND COALESCE\(user_type, 'user'\) != 'admin'/);
  assert.equal(await bcrypt.compare('password', queryParams[0]), true);
  assert.equal(approved.is_active, true);
  assert.equal(approved.must_change_password, true);
});

test('password-reset OTP is six digits and stored with a ten-minute expiry', async () => {
  let queryText;
  let queryParams;
  pool.query = async (sql, params) => {
    queryText = sql;
    queryParams = params;
    return { rows: [{ id: 9, email: 'student@gmail.com', reset_otp_expires_at: params[1] }] };
  };

  const otp = await User.createPasswordResetOtp(' Student@Gmail.com ');

  assert.match(queryText, /reset_otp_code = \$1, reset_otp_expires_at = \$2, reset_otp_attempts = 0/);
  assert.match(queryParams[0], /^\d{6}$/);
  assert.equal(queryParams[2], 'student@gmail.com');
  assert.ok(Math.abs(new Date(queryParams[1]).getTime() - Date.now() - 10 * 60 * 1000) < 1000);
  assert.equal(otp.otp_code, queryParams[0]);
});

test('reset verifies, hashes, and atomically consumes a valid one-time code', async () => {
  const queries = [];
  pool.query = async (sql, params) => {
    queries.push({ sql, params });
    if (sql.includes('SELECT id FROM users')) return { rows: [{ id: 9 }] };
    if (sql.includes('UPDATE users\n       SET password_hash')) {
      return { rows: [{ id: 9, email: 'student@gmail.com', user_type: 'user' }] };
    }
    return { rows: [] };
  };

  assert.equal(await User.verifyPasswordResetOtp('student@gmail.com', '123456'), true);
  const updated = await User.resetPasswordWithOtp('student@gmail.com', '123456', 'a-new-secure-password');

  assert.equal(updated.id, 9);
  assert.match(queries[1].sql, /reset_otp_code = NULL, reset_otp_expires_at = NULL/);
  assert.match(queries[1].sql, /reset_otp_expires_at > NOW\(\) AND reset_otp_attempts < 5/);
  assert.equal(await bcrypt.compare('a-new-secure-password', queries[1].params[0]), true);
});
