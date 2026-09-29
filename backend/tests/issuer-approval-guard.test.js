const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/db/connection');
const { verifyIssuer } = require('../src/middleware/auth');

const originalQuery = pool.query;
const originalDemoMode = process.env.DEMO_MODE;

test.afterEach(() => {
  pool.query = originalQuery;
  if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = originalDemoMode;
});

test('verifyIssuer refreshes authorization from the database before approving a stale issuer token', async () => {
  const queryCalls = [];

  pool.query = async (sql, params) => {
    queryCalls.push(sql);

    if (sql.includes('FROM users u') || sql.includes('FROM users WHERE id =')) {
      return {
        rows: [{ id: 42, user_type: 'issuer', is_active: true, issuer_status: 'approved' }]
      };
    }

    if (sql.includes('SELECT status FROM issuer_profiles')) {
      return {
        rows: [{ status: 'approved' }]
      };
    }

    return { rows: [] };
  };

  const req = {
    user: { id: 42, user_type: 'user' },
    headers: {}
  };

  let nextCalled = false;
  const res = {
    status(code) {
      this.code = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };

  await verifyIssuer(req, res, () => {
    nextCalled = true;
  });

  assert.equal(queryCalls.some(sql => sql.includes('FROM users u')), true);
  assert.equal(req.user.user_type, 'issuer');
  assert.equal(nextCalled, true);
  assert.equal(res.code, undefined);
});

test('verifyIssuer rejects an issuer whose current approval status is pending', async () => {
  pool.query = async (sql) => {
    if (sql.includes('FROM users u')) {
      return {
        rows: [{ id: 10, user_type: 'issuer', is_active: true, issuer_status: 'pending' }]
      };
    }
    return { rows: [] };
  };

  const req = {
    user: { id: 10, email: 'issuer@example.com', user_type: 'issuer' },
    headers: {}
  };
  const res = {
    status(code) {
      this.code = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
  let nextCalled = false;

  await verifyIssuer(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.code, 403);
  assert.equal(res.payload.error, 'Issuer approval required');
});

test('verifyIssuer ignores a client-supplied issuer role header', async () => {
  process.env.DEMO_MODE = 'false';
  pool.query = async () => ({
    rows: [{ id: 10, user_type: 'user', is_active: true, issuer_status: 'pending' }]
  });

  const req = {
    user: { id: 10, email: 'user@example.com', user_type: 'user' },
    headers: { 'x-demo-user-type': 'issuer' }
  };
  const res = {
    status(code) {
      this.code = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
  let nextCalled = false;

  await verifyIssuer(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.code, 403);
  assert.equal(res.payload.error, 'Issuer approval required');
});
