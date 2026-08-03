function normalizeCertId(certId) {
  return String(certId || '').trim().toUpperCase();
}

function getDemoCertificate(certificateId) {
  const normalized = normalizeCertId(certificateId);

  const demoCertificates = {
    'CERT-SOL-2024-00418': {
      id: 1,
      certificate_id: 'CERT-SOL-2024-00418',
      certificate_type: 'Degree Certificate',
      verification_status: 'valid',
      verification_message: 'Demo certificate is active and verifiable.',
      blockchain_hash: 'demo-ipfs-cid-valid',
      blockchain_transaction_id: null,
      checked_at: new Date().toISOString(),
      revoked_at: null,
      revoked_by: null
    },
    'REV-001': {
      id: 2,
      certificate_id: 'REV-001',
      certificate_type: 'Revocation Demo',
      verification_status: 'revoked',
      verification_message: 'Demo certificate has been revoked by the issuer.',
      blockchain_hash: 'demo-ipfs-cid-revoked',
      blockchain_transaction_id: 'demo-revoke-rev-001',
      checked_at: new Date().toISOString(),
      revoked_at: new Date().toISOString(),
      revoked_by: 1
    }
  };

  return demoCertificates[normalized] || null;
}

module.exports = {
  normalizeCertId,
  getDemoCertificate
};
