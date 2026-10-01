const test = require('node:test');
const assert = require('node:assert/strict');
const EmailService = require('../src/services/emailService');

let server;
const applicationEmails = [];
const originalSendApplicationReceived = EmailService.sendApplicationReceived;
const originalSendApplicationDecision = EmailService.sendApplicationDecision;

async function startServer() {
  const app = require('../src/server');
  return new Promise((resolve, reject) => {
    server = app.listen(0, () => resolve(server.address().port));
    server.on('error', reject);
  });
}

test.before(async () => {
  process.env.DEMO_MODE = 'true';
  EmailService.sendApplicationReceived = async (...args) => {
    applicationEmails.push({ type: 'received', args });
    return { messageId: 'test-received' };
  };
  EmailService.sendApplicationDecision = async (...args) => {
    applicationEmails.push({ type: 'decision', args });
    return { messageId: 'test-decision' };
  };
  process.env.TEST_SERVER_PORT = await startServer();
});

test.after(async () => {
  if (server) server.close();
  EmailService.sendApplicationReceived = originalSendApplicationReceived;
  EmailService.sendApplicationDecision = originalSendApplicationDecision;
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
  assert.ok(applicationEmails.some(email =>
    email.type === 'received' && email.args[0] === 'ada@acme.edu'
  ), 'Successful submission should send a receipt to the applicant contact email');

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

test('public application submissions do not require a use case or wallet address', async () => {
  const port = process.env.TEST_SERVER_PORT;
  const response = await fetch(`http://localhost:${port}/api/applications/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orgName: 'Optional Fields Org',
      orgType: 'university',
      contactName: 'Alex Applicant',
      contactEmail: 'alex@optional-fields.example',
      contactRole: 'Registrar',
      volume: '1 – 100 certificates'
    })
  });

  const data = await response.json();
  assert.equal(response.status, 201, `Unexpected submit status: ${JSON.stringify(data)}`);
  assert.ok(data.success, `Submission should succeed: ${JSON.stringify(data)}`);
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
  assert.ok(applicationEmails.some(email =>
    email.type === 'decision' && email.args[0] === 'grace@demo-approved.example' && email.args[3] === true
  ), 'Approved application should send an approval email to the applicant contact email');

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

test('rejected applications send a decision email to the applicant contact email', async () => {
  const port = process.env.TEST_SERVER_PORT;
  const base = `http://localhost:${port}`;
  const createResponse = await fetch(`${base}/api/applications/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orgName: 'Rejected University',
      orgType: 'university',
      contactName: 'Taylor Applicant',
      contactEmail: 'taylor@example.edu',
      contactRole: 'Registrar'
    })
  });
  const created = await createResponse.json();
  assert.equal(createResponse.status, 201, `Unexpected create status: ${JSON.stringify(created)}`);

  const rejectResponse = await fetch(`${base}/api/applications/${created.application.id}/reject`, {
    method: 'PUT',
    headers: {
      Authorization: 'Bearer demo-token',
      'x-demo-user-type': 'admin',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ reason: 'Application incomplete' })
  });
  const rejected = await rejectResponse.json();
  assert.equal(rejectResponse.status, 200, `Unexpected reject status: ${JSON.stringify(rejected)}`);
  assert.ok(applicationEmails.some(email =>
    email.type === 'decision' &&
    email.args[0] === 'taylor@example.edu' &&
    email.args[3] === false &&
    email.args[4] === 'Application incomplete'
  ), 'Rejected application should send a decision email to the applicant contact email');
});
