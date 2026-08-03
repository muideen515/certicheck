const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fetch = require('cross-fetch');
const { CertificateStore } = require('../src/services/certificateStore');
const app = require('../src/server');

let server;
let tempDir;
let storeFile;

const demoHeaders = {
  Authorization: 'Bearer demo-token',
  'x-demo-user-type': 'issuer',
  'Content-Type': 'application/json'
};

async function startServer() {
  return new Promise((resolve, reject) => {
    server = app.listen(0, () => {
      resolve(server.address().port);
    });
    server.on('error', reject);
  });
}

test.before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'certicheck-api-'));
  storeFile = path.join(tempDir, 'certificates.json');
  process.env.CERTIFICATE_STORE_FILE = storeFile;
  process.env.DEMO_MODE = 'true';
  fs.writeFileSync(storeFile, JSON.stringify([]));
  const port = await startServer();
  process.env.TEST_SERVER_PORT = port;
});

test.after(async () => {
  if (server) {
    server.close();
  }
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('backend certificate issue, lookup, and revoke API flow', async () => {
  const port = process.env.TEST_SERVER_PORT;
  const baseUrl = `http://localhost:${port}`;

  const issueResponse = await fetch(`${baseUrl}/api/certificates/issue`, {
    method: 'POST',
    headers: demoHeaders,
    body: JSON.stringify({
      certificateId: 'CERT-API-001',
      holderName: 'Alice Example',
      holderEmail: 'alice@example.com',
      certificateType: 'API Integration Test',
      issuerName: 'Certicheck Test Issuer',
      issuerWallet: 'demo-wallet',
      issueOnChain: false
    })
  });

  assert.equal(issueResponse.status, 201);
  const issueResult = await issueResponse.json();
  assert.equal(issueResult.success, true);
  assert.equal(issueResult.certificate.certificate_id, 'CERT-API-001');
  assert.equal(issueResult.certificate.verification_status, 'valid');

  const lookupResponse = await fetch(`${baseUrl}/api/certificates/lookup/CERT-API-001`);
  assert.equal(lookupResponse.status, 200);
  const lookupResult = await lookupResponse.json();
  assert.equal(lookupResult.success, true);
  assert.equal(lookupResult.certificate.certificate_id, 'CERT-API-001');
  assert.equal(lookupResult.status, 'valid');

  const revokeResponse = await fetch(`${baseUrl}/api/certificates/revoke/CERT-API-001`, {
    method: 'PUT',
    headers: {
      ...demoHeaders,
      'x-demo-user-type': 'admin'
    },
    body: JSON.stringify({ reason: 'Integration test revoke' })
  });
  assert.equal(revokeResponse.status, 200);
  const revokeResult = await revokeResponse.json();
  assert.equal(revokeResult.success, true);
  assert.equal(revokeResult.certificate.verification_status, 'revoked');

  const verifyResponse = await fetch(`${baseUrl}/api/certificates/lookup/CERT-API-001`);
  assert.equal(verifyResponse.status, 200);
  const verifyResult = await verifyResponse.json();
  assert.equal(verifyResult.certificate.verification_status, 'revoked');
});
