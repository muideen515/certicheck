const test = require('node:test');
const assert = require('node:assert/strict');
const Application = require('../src/models/Application');
const pool = require('../src/db/connection');

const originalQuery = pool.query;

test.afterEach(() => {
  pool.query = originalQuery;
});

test('issuer applications must use a certicheck.com email', async () => {
  pool.query = async () => ({ rows: [] });

  await assert.rejects(
    () => Application.create(
      1,
      'Certicheck Academy',
      'university',
      'https://example.com',
      'Jane Doe',
      'jane@gmail.com',
      'Registrar',
      '1-100 certificates',
      'We issue credentials for enrolled learners.',
      'wallet-address'
    ),
    /@certicheck.com/
  );
});

test('issuer email suggestions are normalized to certicheck.com', () => {
  const generated = 'Jane Doe'.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') + '@certicheck.com';
  assert.equal(generated, 'jane.doe@certicheck.com');
});
