const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { CertificateStore } = require('../src/services/certificateStore');

test('certificate store issue, lookup, revoke', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'certicheck-store-'));
  const storageFile = path.join(tempDir, 'certificates.json');
  process.env.CERTIFICATE_STORE_FILE = storageFile;
  const store = new CertificateStore();

  const issued = store.issue({
    certificateId: 'CERT-STORE-001',
    holderName: 'Ada Lovelace',
    holderEmail: 'ada@example.com',
    certificateType: 'Degree Certificate',
    issuerName: 'Certicheck',
    issuerWallet: 'issuer-wallet',
    ipfsCid: 'ipfs-test-cid',
    blockchainTransactionId: 'tx-test-001',
    userId: 42
  });

  assert.equal(issued.certificate_id, 'CERT-STORE-001');
  assert.equal(issued.verification_status, 'valid');

  const found = store.lookup('CERT-STORE-001');
  assert.ok(found);
  assert.equal(found.certificate_id, 'CERT-STORE-001');

  const revoked = store.revoke('CERT-STORE-001', 'Test revoke', 99);
  assert.equal(revoked.verification_status, 'revoked');

  const afterRevoke = store.lookup('CERT-STORE-001');
  assert.equal(afterRevoke.verification_status, 'revoked');

  fs.rmSync(tempDir, { recursive: true, force: true });
});
