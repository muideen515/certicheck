const test = require('node:test');
const assert = require('node:assert/strict');
const pool = require('../src/db/connection');
const { verifyIssuer } = require('../src/middleware/auth');

const originalQuery = pool.query;

test.afterEach(() => {
  pool.query = originalQuery;
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

test('verifyIssuer does not let a later pending application hide an approved application', async () => {
  pool.query = async (sql) => {
    if (sql.includes('FROM users u')) {
      return {
        rows: [{ id: 10, user_type: 'issuer', is_active: true, issuer_status: 'pending' }]
      };
    }

    if (sql.includes('FROM issuer_profiles')) {
      return { rows: [{ status: 'pending' }] };
    }

    if (sql.includes("pa.status = 'approved'")) {
      return { rows: [{ '?column?': 1 }] };
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

  assert.equal(nextCalled, true);
  assert.equal(res.code, undefined);
});
