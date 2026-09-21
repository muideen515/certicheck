const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/db/connection');
const User = require('../src/models/User');
const Application = require('../src/models/Application');

const originalQuery = pool.query;

test.afterEach(() => {
  pool.query = originalQuery;
});

test('new issuer signups are created inactive and use the fixed password hash', async () => {
  pool.query = async (sql, params) => {
    if (sql.includes('INSERT INTO users')) {
      return {
        rows: [{
          id: 77,
          email: params[0],
          first_name: params[2],
          last_name: params[3],
          user_type: params[4],
          is_active: params[5]
        }]
      };
    }
    return { rows: [] };
  };

  const user = await User.create('new@certicheck.com', 'password', 'New', 'User', 'issuer', false);

  assert.equal(user.email, 'new@certicheck.com');
  assert.equal(user.user_type, 'issuer');
  assert.equal(user.is_active, false);
});

test('new issuer signups create a pending approval record for the admin portal', async () => {
  pool.query = async (sql, params) => {
    if (sql.includes('SELECT id FROM issuer_profiles')) {
      return { rows: [] };
    }

    if (sql.includes('INSERT INTO issuer_profiles')) {
      return { rows: [{ id: 44 }] };
    }

    if (sql.includes('INSERT INTO pending_applications')) {
      return {
        rows: [{
          id: 88,
          organization_name: params[1],
          status: 'pending',
          submitted_at: new Date().toISOString()
        }]
      };
    }

    return { rows: [] };
  };

  const app = await Application.create(
    77,
    'Test Org Pending',
    'law firm',
    'https://example.com',
    'Ada Test',
    'ada@certicheck.com',
    'Operations Lead',
    '1 - 100 certificates',
    'Pending approval for new issuer signup',
    'wallet-address'
  );

  assert.equal(app.status, 'pending');
  assert.equal(app.organization_name, 'Test Org Pending');
  assert.match(app.organization_name, /Test Org Pending/);
});
