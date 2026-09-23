const test = require('node:test');
const assert = require('node:assert/strict');
const fetch = require('cross-fetch');

test('on-chain issuance skeleton (run only when SOLANA_ENABLE=true)', async () => {
  if (process.env.SOLANA_ENABLE !== 'true') {
    test.skip('Solana not enabled in env; skipping on-chain integration test');
    return;
  }

  // If Solana is enabled, try issuing a certificate on-chain. This test is conservative
  // and will only run full assertions when SOLANA_ENABLE=true and SOLANA_KEYPAIR_PATH is present.
  const base = process.env.TEST_BASE_URL || `http://localhost:${process.env.TEST_SERVER_PORT || 5000}`;

  if (process.env.SOLANA_ENABLE === 'true' && (process.env.SOLANA_KEYPAIR_PATH || process.env.SOLANA_PAYER_SECRET)) {
    const issueResp = await fetch(`${base}/api/certificates/issue`, {
      method: 'POST',
      headers: { Authorization: 'Bearer demo-token', 'x-demo-user-type': 'issuer', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        certificateId: `ONCHAIN-TEST-${Date.now()}`,
        holderName: 'Onchain Tester',
        holderEmail: 'onchain@example.com',
        certificateType: 'OnChain Test',
        issuerName: 'Certicheck Test',
        issuerWallet: 'test-wallet',
        metadata: { test: true },
        onChain: true
      })
    });

    const json = await issueResp.json();
    if (!issueResp.ok) throw new Error(`On-chain issue failed: ${JSON.stringify(json)}`);
    // Basic assertions about returned on-chain fields
    if (!json.certificate || !json.certificate.blockchain_transaction_id) throw new Error('Missing blockchain tx id in response');
  } else {
    // fallback: check health endpoint
    const resp = await fetch(`${base}/health`);
    assert.equal(resp.status, 200);
  }
});
