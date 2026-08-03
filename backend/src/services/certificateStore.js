const fs = require('node:fs');
const path = require('node:path');

class CertificateStore {
  constructor({ storageFile } = {}) {
    this.storageFile = storageFile || process.env.CERTIFICATE_STORE_FILE || path.join(__dirname, '..', 'data', 'certificates.json');
    this.ensureStorage();
  }

  ensureStorage() {
    const dir = path.dirname(this.storageFile);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.storageFile)) {
      fs.writeFileSync(this.storageFile, JSON.stringify([]));
    }
  }

  read() {
    const raw = fs.readFileSync(this.storageFile, 'utf8');
    return JSON.parse(raw);
  }

  write(records) {
    fs.writeFileSync(this.storageFile, JSON.stringify(records, null, 2));
  }

  issue(payload) {
    const records = this.read();
    const entry = {
      id: records.length + 1,
      certificate_id: payload.certificateId,
      certificate_type: payload.certificateType,
      verification_status: 'valid',
      verification_message: `Issued via Certicheck`,
      blockchain_hash: payload.ipfsCid || null,
      blockchain_transaction_id: payload.blockchainTransactionId || null,
      holder_name: payload.holderName,
      holder_email: payload.holderEmail,
      issuer_name: payload.issuerName || 'Certicheck Issuer',
      issuer_wallet: payload.issuerWallet || null,
      checked_at: new Date().toISOString(),
      revoked_at: null,
      revoked_by: null,
      created_by: payload.userId || null
    };
    records.push(entry);
    this.write(records);
    return entry;
  }

  lookup(certificateId) {
    const records = this.read();
    return records.find((record) => record.certificate_id === certificateId) || null;
  }

  revoke(certificateId, reason, revokedBy) {
    const records = this.read();
    const entry = records.find((record) => record.certificate_id === certificateId);
    if (!entry) {
      throw new Error('Certificate not found');
    }
    entry.verification_status = 'revoked';
    entry.verification_message = reason;
    entry.revoked_at = new Date().toISOString();
    entry.revoked_by = revokedBy;
    this.write(records);
    return entry;
  }
}

module.exports = { CertificateStore };
