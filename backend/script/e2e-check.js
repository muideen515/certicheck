const fetch = global.fetch || require('node-fetch');

const BACKEND = process.env.BACKEND_URL || 'http://localhost:3000';
const demoHeaders = {
  Authorization: 'Bearer demo-token',
  'x-demo-user-type': 'issuer',
  'Content-Type': 'application/json'
};

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url + '/health');
      if (res.ok) return true;
    } catch (e) {}
    await wait(500);
  }
  throw new Error('Server did not become healthy in time');
}

async function run() {
  try {
    console.log('Waiting for backend to be ready...');
    await waitForServer(BACKEND, 20000);

    const certId = 'E2E-TEST-001';
    console.log('Issuing certificate', certId);
    let res = await fetch(`${BACKEND}/api/certificates/issue`, {
      method: 'POST', headers: demoHeaders,
      body: JSON.stringify({ certificateId: certId, holderName: 'E2E Holder', holderEmail: 'e2e@example.com', certificateType: 'E2E Test', issuerName: 'E2E Issuer', issuerWallet: 'demo', issueOnChain: false })
    });
    console.log('Issue status', res.status);
    const issueJson = await res.json();
    console.log('Issue response', issueJson);
    if (!issueJson.success) throw new Error('Issue failed');

    console.log('Lookup after issue');
    res = await fetch(`${BACKEND}/api/certificates/lookup/${certId}`);
    console.log('Lookup status', res.status);
    const lookupJson = await res.json();
    console.log('Lookup response', lookupJson);
    if (!lookupJson.success) throw new Error('Lookup failed');

    console.log('Revoking certificate');
    res = await fetch(`${BACKEND}/api/certificates/revoke/${certId}`, { method: 'PUT', headers: { ...demoHeaders, 'x-demo-user-type': 'admin' }, body: JSON.stringify({ reason: 'E2E test revoke' }) });
    console.log('Revoke status', res.status);
    const revokeJson = await res.json();
    console.log('Revoke response', revokeJson);
    if (!revokeJson.success) throw new Error('Revoke failed');
    if (revokeJson.certificate?.verification_status !== 'revoked') throw new Error('Revoke did not set status revoked');

    console.log('Lookup after revoke');
    res = await fetch(`${BACKEND}/api/certificates/lookup/${certId}`);
    const afterLookup = await res.json();
    console.log('Final lookup', afterLookup);
    if (afterLookup.certificate?.verification_status !== 'revoked') throw new Error('Final lookup not revoked');

    console.log('E2E flow succeeded');
    process.exit(0);
  } catch (err) {
    console.error('E2E check failed:', err.message || err);
    process.exit(2);
  }
}

run();
