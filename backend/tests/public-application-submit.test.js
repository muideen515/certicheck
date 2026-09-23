const test = require('node:test');
const assert = require('node:assert/strict');

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
  process.env.TEST_SERVER_PORT = await startServer();
});

test.after(async () => {
  if (server) server.close();
});

test('public application submissions are visible to admin review queue', async () => {
  const port = process.env.TEST_SERVER_PORT;
  const base = `http://localhost:${port}`;

  const submitResponse = await fetch(`${base}/api/applications/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orgName: 'Acme University',
      orgType: 'university',
      website: 'https://acme.edu',
      contactName: 'Ada Lovelace',
      contactEmail: 'ada@acme.edu',
      contactRole: 'Registrar',
      volume: '1 – 100 certificates',
      useCase: 'Academic credential issuance',
      wallet: 'demo-wallet'
    })
  });

  const submitData = await submitResponse.json();
  assert.equal(submitResponse.status, 201, `Unexpected submit status: ${JSON.stringify(submitData)}`);
  assert.ok(submitData.success, `Submission should succeed: ${JSON.stringify(submitData)}`);

  const adminResponse = await fetch(`${base}/api/applications/pending?limit=50&offset=0`, {
    headers: {
      Authorization: 'Bearer demo-token',
      'x-demo-user-type': 'admin',
      'Content-Type': 'application/json'
    }
  });

  const pendingData = await adminResponse.json();
  assert.equal(adminResponse.status, 200, `Unexpected pending status: ${JSON.stringify(pendingData)}`);
  assert.ok(
    pendingData.applications.some(app => app.contact_email === 'ada@acme.edu' || app.contactEmail === 'ada@acme.edu'),
    `Expected submitted app in pending queue: ${JSON.stringify(pendingData.applications.slice(0, 5))}`
  );
});
