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

test('admin dashboard reflects approved applications in demo mode', async () => {
  const port = process.env.TEST_SERVER_PORT;
  const base = `http://localhost:${port}`;

  const createResponse = await fetch(`${base}/api/applications/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orgName: 'Demo Approved Org',
      orgType: 'school',
      website: 'https://demo-approved.example',
      contactName: 'Grace Hopper',
      contactEmail: 'grace@demo-approved.example',
      contactRole: 'Operations Lead',
      volume: '1 – 100 certificates',
      useCase: 'Testing admin dashboard',
      wallet: 'demo-wallet-approved'
    })
  });

  const created = await createResponse.json();
  assert.equal(createResponse.status, 201, `Unexpected create status: ${JSON.stringify(created)}`);
  const appId = created.application.id;

  const approveResponse = await fetch(`${base}/api/applications/${appId}/approve`, {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer demo-token',
      'x-demo-user-type': 'admin',
      'Content-Type': 'application/json'
    }
  });

  const approvedData = await approveResponse.json();
  assert.equal(approveResponse.status, 200, `Unexpected approve status: ${JSON.stringify(approvedData)}`);

  const dashboardResponse = await fetch(`${base}/api/admin/dashboard`, {
    headers: {
      Authorization: 'Bearer demo-token',
      'x-demo-user-type': 'admin',
      'Content-Type': 'application/json'
    }
  });
  const dashboard = await dashboardResponse.json();
  assert.equal(dashboardResponse.status, 200, `Dashboard should work in demo mode: ${JSON.stringify(dashboard)}`);
  assert.ok(dashboard.stats?.approvedApplications >= 1, `Approved count should reflect approved applications: ${JSON.stringify(dashboard)}`);

  const approvedListResponse = await fetch(`${base}/api/applications/approved?limit=50&offset=0`, {
    headers: {
      Authorization: 'Bearer demo-token',
      'x-demo-user-type': 'admin',
      'Content-Type': 'application/json'
    }
  });
  const approvedList = await approvedListResponse.json();
  assert.equal(approvedListResponse.status, 200, `Approved list should return in demo mode: ${JSON.stringify(approvedList)}`);
  assert.ok(approvedList.applications.some(app => app.contact_email === 'grace@demo-approved.example' || app.contactEmail === 'grace@demo-approved.example'), `Approved application should appear in approved queue: ${JSON.stringify(approvedList.applications.slice(0, 10))}`);
});
