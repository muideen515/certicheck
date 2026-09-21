const test = require('node:test');
const assert = require('node:assert/strict');
const fetch = require('cross-fetch');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

let server;
async function startServer() {
  const app = require('../src/server');
  return new Promise((resolve, reject) => {
    server = app.listen(0, () => resolve(server.address().port));
    server.on('error', reject);
  });
}

test.before(async () => {
  process.env.DEMO_MODE = 'true';
  const port = await startServer();
  process.env.TEST_SERVER_PORT = port;
});

test.after(async () => {
  if (server) server.close();
});

test('admin rate limit returns 429 after threshold exceeded', async () => {
  const port = process.env.TEST_SERVER_PORT;
  const base = `http://localhost:${port}`;
  const demoAdminHeaders = {
    Authorization: 'Bearer demo-token',
    'x-demo-user-type': 'admin',
    'Content-Type': 'application/json'
  };

  const concurrency = 35;
  const requests = [];
  for (let i = 0; i < concurrency; i++) {
    requests.push(fetch(`${base}/api/admin/dashboard`, { headers: demoAdminHeaders }));
  }

  const results = await Promise.all(requests.map(p => p.catch(e => ({ status: 0 }))));
  const statuses = results.map(r => r.status);
  // Expect at least one 429 due to the configured limit of 30 requests/min
  const has429 = statuses.includes(429);
  assert.ok(has429, `Expected at least one 429; statuses: ${statuses.join(',')}`);
});
