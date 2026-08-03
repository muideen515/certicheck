const express = require('express');
const pool = require('../db/connection');
const { verifyToken, verifyAdmin, verifyIssuer, logAudit } = require('../middleware/auth');
const { pinJsonToIpfs } = require('../services/ipfsService');
const { issueCertificateOnChain, revokeCertificateOnChain, lookupCertificateOnChain, getTransactionStatus } = require('../services/solanaService');
const { getDemoCertificate } = require('../services/demoCertificateService');
const { CertificateStore } = require('../services/certificateStore');

const router = express.Router();
let certificateStore;
function getCertificateStore() {
  if (!certificateStore) {
    certificateStore = new CertificateStore();
  }
  return certificateStore;
}

async function safeTransactionStatus(signature) {
  if (!signature || typeof signature !== 'string' || signature.length < 40) {
    return null;
  }
  try {
    return await getTransactionStatus(signature);
  } catch (err) {
    console.warn('Transaction status fetch failed:', err.message);
    return null;
  }
}

async function safeQuery(text, params = []) {
  const timeoutMs = Number(process.env.DB_QUERY_TIMEOUT_MS || 1500);
  return Promise.race([
    pool.query(text, params),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Database query timed out')), timeoutMs))
  ]);
}

router.post('/issue', verifyToken, verifyIssuer, async (req, res) => {
  try {
    console.log('DEBUG issue body', JSON.stringify(req.body));
    const {
      certificateId,
      holderName,
      holderEmail,
      certificateType,
      issuerName,
      issuerWallet,
      onChain = false,
      metadata = {}
    } = req.body;

    const trimmedCertificateId = typeof certificateId === 'string' ? certificateId.trim() : '';
    const trimmedHolderName = typeof holderName === 'string' ? holderName.trim() : '';
    const trimmedHolderEmail = typeof holderEmail === 'string' ? holderEmail.trim() : '';
    const trimmedCertificateType = typeof certificateType === 'string' ? certificateType.trim() : '';
    const trimmedIssuerName = typeof issuerName === 'string' ? issuerName.trim() : '';
    const trimmedIssuerWallet = typeof issuerWallet === 'string' ? issuerWallet.trim() : '';

    if (
      !trimmedCertificateId ||
      !trimmedHolderName ||
      !trimmedHolderEmail ||
      !trimmedCertificateType ||
      !trimmedIssuerName
    ) {
      return res.status(400).json({ error: 'Missing required certificate fields' });
    }

    const requestedMetadata = typeof metadata === 'object' && metadata !== null ? metadata : {};
    const issuedAt = new Date().toISOString();
    const certificateMetadata = {
      certificateId: trimmedCertificateId,
      holderName: trimmedHolderName,
      holderEmail: trimmedHolderEmail,
      certificateType: trimmedCertificateType,
      issuerName: trimmedIssuerName,
      issuerWallet: trimmedIssuerWallet || null,
      issuedAt,
      status: 'valid',
      metadata: requestedMetadata
    };

    const existingCertificate = getCertificateStore().lookup(trimmedCertificateId);
    if (existingCertificate) {
      return res.status(409).json({ error: 'Certificate with this ID already exists' });
    }

    const ipfsResult = await pinJsonToIpfs(certificateMetadata);
    const ipfsCid = ipfsResult.cid;
    const ipfsUri = `https://gateway.pinata.cloud/ipfs/${ipfsCid}`;

    let blockchainTransactionId = null;
    let issuancePath = 'ipfs-only';
    if (onChain === true || process.env.SOLANA_ENABLE === 'true') {
      try {
        blockchainTransactionId = await issueCertificateOnChain({
          certificateId: trimmedCertificateId,
          ipfsCid,
          certificateType: trimmedCertificateType,
          issuerWallet: trimmedIssuerWallet,
          holderWallet: null,
          holderName: trimmedHolderName,
          holderEmail: trimmedHolderEmail,
          issuerName: trimmedIssuerName,
          metadataHash: ipfsCid
        });
        issuancePath = process.env.CERTIFICATE_PROGRAM_ID ? 'onchain' : 'memo';
      } catch (chainErr) {
        console.warn('Certificate issuance transaction failed, recording local/IPFS only:', chainErr.message);
      }
    }

    let dbCertificate = null;
    try {
      const certificateResult = await safeQuery(
        `INSERT INTO certificates
          (certificate_id, issuer_name, issuer_wallet, holder_name, holder_email, certificate_type, status, ipfs_cid, ipfs_uri, blockchain_transaction_id, metadata, issued_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
         RETURNING *`,
        [
          trimmedCertificateId,
          trimmedIssuerName,
          trimmedIssuerWallet,
          trimmedHolderName,
          trimmedHolderEmail,
          trimmedCertificateType,
          'valid',
          ipfsCid,
          ipfsUri,
          blockchainTransactionId,
          JSON.stringify(requestedMetadata),
          issuedAt
        ]
      );
      dbCertificate = certificateResult.rows[0];
    } catch (dbErr) {
      if (!dbErr.message.toLowerCase().includes('duplicate')) {
        console.warn('Failed to save certificate record to database:', dbErr.message);
      }
    }

    try {
      await safeQuery(
        `INSERT INTO verify_history
          (user_id, certificate_id, certificate_type, verification_status, verification_message, blockchain_hash, blockchain_transaction_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [req.user.id, trimmedCertificateId, trimmedCertificateType, 'valid', 'Issued via Certicheck', ipfsCid, blockchainTransactionId]
      );
    } catch (verifyErr) {
      console.warn('Failed to save verify history record:', verifyErr.message);
    }

    const localCertificate = getCertificateStore().issue({
      certificateId: trimmedCertificateId,
      holderName: trimmedHolderName,
      holderEmail: trimmedHolderEmail,
      certificateType: trimmedCertificateType,
      issuerName: trimmedIssuerName,
      issuerWallet: trimmedIssuerWallet,
      ipfsCid,
      blockchainTransactionId,
      userId: req.user.id
    });

    await logAudit(req.user.id, 'CERTIFICATE_VERIFY', 'certificate', trimmedCertificateId, 'success', null, {
      certificateId: trimmedCertificateId,
      ipfsCid,
      ipfsUri,
      issuerName: trimmedIssuerName,
      issuerWallet: trimmedIssuerWallet,
      holderName: trimmedHolderName,
      holderEmail: trimmedHolderEmail,
      issuancePath,
      blockchainTransactionId,
      dbStored: Boolean(dbCertificate)
    });

    res.status(201).json({
      success: true,
      certificate: {
        certificate_id: trimmedCertificateId,
        ipfs_cid: ipfsCid,
        ipfs_uri: ipfsUri,
        blockchain_transaction_id: blockchainTransactionId,
        status: 'valid',
        issued_at: issuedAt,
        verification_status: 'valid',
        issuer_name: trimmedIssuerName,
        issuer_wallet: trimmedIssuerWallet,
        holder_name: trimmedHolderName,
        holder_email: trimmedHolderEmail
      }
    });
  } catch (err) {
    console.error('Issue certificate error:', err);
    res.status(500).json({ error: 'Failed to issue certificate', details: err.message });
  }
});

// Pin raw certificate metadata to IPFS and return the CID (used for client-side signing flows)
router.post('/pin', async (req, res) => {
  try {
    const metadata = req.body?.metadata || {};
    const pinResult = await pinJsonToIpfs(metadata);
    const ipfsCid = pinResult?.cid;
    if (!ipfsCid) return res.status(500).json({ success: false, error: 'Failed to pin metadata' });
    return res.json({ success: true, cid: ipfsCid, uri: `https://gateway.pinata.cloud/ipfs/${ipfsCid}` });
  } catch (err) {
    console.error('Pin metadata error:', err);
    return res.status(500).json({ success: false, error: 'Pin failed', details: err.message });
  }
});

// Record a certificate that was issued with a client-signed on-chain transaction
router.post('/issue-client-signed', verifyToken, verifyIssuer, async (req, res) => {
  try {
    const {
      certificateId,
      holderName,
      holderEmail,
      certificateType,
      issuerName,
      issuerWallet,
      ipfsCid,
      blockchainTransactionId,
      metadata = {}
    } = req.body;

    const trimmedCertificateId = typeof certificateId === 'string' ? certificateId.trim() : '';
    if (!trimmedCertificateId || !holderName || !holderEmail || !certificateType || !issuerName || !ipfsCid || !blockchainTransactionId) {
      return res.status(400).json({ error: 'Missing required fields for client-signed issuance' });
    }

    const issuedAt = new Date().toISOString();

    // Save to DB / local store (similar to /issue but without performing on-chain transaction)
    try {
      await safeQuery(
        `INSERT INTO certificates
          (certificate_id, issuer_name, issuer_wallet, holder_name, holder_email, certificate_type, status, ipfs_cid, ipfs_uri, blockchain_transaction_id, metadata, issued_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW(),NOW())
         RETURNING *`,
        [
          trimmedCertificateId,
          issuerName,
          issuerWallet || null,
          holderName,
          holderEmail,
          certificateType,
          'valid',
          ipfsCid,
          `https://gateway.pinata.cloud/ipfs/${ipfsCid}`,
          blockchainTransactionId,
          JSON.stringify(metadata),
          issuedAt
        ]
      );
    } catch (dbErr) {
      console.warn('Failed to save client-signed certificate to database:', dbErr.message);
    }

    try {
      await safeQuery(
        `INSERT INTO verify_history
          (user_id, certificate_id, certificate_type, verification_status, verification_message, blockchain_hash, blockchain_transaction_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [req.user.id, trimmedCertificateId, certificateType, 'valid', 'Issued via client-signed tx', ipfsCid, blockchainTransactionId]
      );
    } catch (verifyErr) {
      console.warn('Failed to save verify history record for client-signed issuance:', verifyErr.message);
    }

    try {
      const localCertificate = getCertificateStore().issue({
        certificateId: trimmedCertificateId,
        holderName,
        holderEmail,
        certificateType,
        issuerName,
        issuerWallet: issuerWallet || null,
        ipfsCid,
        blockchainTransactionId,
        userId: req.user.id
      });
    } catch (e) {
      // ignore local store errors
    }

    await logAudit(req.user.id, 'CERTIFICATE_VERIFY', 'certificate', trimmedCertificateId, 'success', null, {
      certificateId: trimmedCertificateId,
      ipfsCid,
      issuerName,
      issuerWallet,
      holderName,
      holderEmail,
      issuancePath: 'client-signed',
      blockchainTransactionId
    });

    return res.status(201).json({ success: true, certificate: { certificate_id: trimmedCertificateId, ipfs_cid: ipfsCid, blockchain_transaction_id: blockchainTransactionId, issuer_name: issuerName, issuer_wallet: issuerWallet, holder_name: holderName, holder_email: holderEmail, issued_at: issuedAt } });
  } catch (err) {
    console.error('Issue client-signed error:', err);
    return res.status(500).json({ error: 'Failed to record client-signed issuance', details: err.message });
  }
});

router.get('/lookup/:certificateId', async (req, res) => {
  try {
    const { certificateId } = req.params;
    if (process.env.SOLANA_ENABLE === 'true' && process.env.CERTIFICATE_PROGRAM_ID) {
      try {
        const onChainCertificate = await lookupCertificateOnChain(certificateId);
        if (onChainCertificate) {
          return res.json({
            success: true,
            certificate: onChainCertificate,
            status: onChainCertificate.verification_status,
            onChain: true,
            blockchainTransactionStatus: null,
            verifiedAt: new Date(onChainCertificate.issued_at * 1000).toISOString()
          });
        }
      } catch (chainErr) {
        console.warn('On-chain lookup failed, falling back to local/DB:', chainErr.message);
      }
    }

    const demoCertificate = getDemoCertificate(certificateId);

    if (demoCertificate) {
      return res.json({
        success: true,
        certificate: demoCertificate,
        status: demoCertificate.verification_status,
        onChain: Boolean(demoCertificate.blockchain_transaction_id),
        blockchainTransactionStatus: null,
        verifiedAt: demoCertificate.checked_at
      });
    }

    const localCertificate = getCertificateStore().lookup(certificateId);
    if (localCertificate) {
      const transactionStatus = await safeTransactionStatus(localCertificate.blockchain_transaction_id);

      return res.json({
        success: true,
        certificate: localCertificate,
        status: localCertificate.verification_status,
        onChain: Boolean(localCertificate.blockchain_transaction_id),
        blockchainTransactionStatus: transactionStatus,
        verifiedAt: localCertificate.checked_at
      });
    }

    try {
      const certificateRecord = await safeQuery(
        `SELECT certificate_id, certificate_type, status, ipfs_cid, ipfs_uri, blockchain_transaction_id, holder_name, holder_email, issuer_name, issuer_wallet, issued_at
         FROM certificates WHERE certificate_id = $1 LIMIT 1`,
        [certificateId]
      );

      if (certificateRecord.rows[0]) {
        const certificate = certificateRecord.rows[0];
        const transactionStatus = await safeTransactionStatus(certificate.blockchain_transaction_id);

        return res.json({
          success: true,
          certificate,
          status: certificate.status,
          onChain: Boolean(certificate.blockchain_transaction_id),
          blockchainTransactionStatus: transactionStatus,
          verifiedAt: certificate.issued_at
        });
      }
    } catch (certErr) {
      console.warn('Certificate lookup in certificates table failed:', certErr.message);
    }

    const result = await safeQuery(
      `SELECT id, certificate_id, certificate_type, verification_status, verification_message, blockchain_hash, blockchain_transaction_id, checked_at, revoked_at, revoked_by
       FROM verify_history WHERE certificate_id = $1 LIMIT 1`,
      [certificateId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, error: 'Certificate not found' });
    }

    const transactionStatus = await safeTransactionStatus(result.rows[0].blockchain_transaction_id);

    res.json({
      success: true,
      certificate: result.rows[0],
      status: result.rows[0].verification_status,
      onChain: Boolean(result.rows[0].blockchain_transaction_id),
      blockchainTransactionStatus: transactionStatus,
      verifiedAt: result.rows[0].checked_at
    });
  } catch (err) {
    console.error('Lookup certificate error:', err);
    res.status(500).json({ error: 'Failed to look up certificate', details: err.message });
  }
});

router.put('/revoke/:certificateId', verifyToken, verifyAdmin, async (req, res) => {
  try {
    const { certificateId } = req.params;
    const { reason = 'Revoked by admin' } = req.body;

    const hasDeployedProgram = process.env.SOLANA_ENABLE === 'true' && Boolean(process.env.CERTIFICATE_PROGRAM_ID);
    let blockchainTransactionId = null;
    if (hasDeployedProgram) {
      try {
        blockchainTransactionId = await revokeCertificateOnChain({ certificateId, reason });
      } catch (chainErr) {
        console.warn('On-chain revoke failed, continuing with local revocation only:', chainErr.message);
      }
    }

    let localCertificate = null;
    try {
      localCertificate = getCertificateStore().revoke(certificateId, reason, req.user.id);
    } catch (storeErr) {
      localCertificate = null;
    }

    let certificateRow = null;
    try {
      const certificatesResult = await safeQuery(
        `UPDATE certificates
         SET status = 'revoked', revoked_at = NOW(), revocation_reason = $1, blockchain_transaction_id = $2, updated_at = NOW()
         WHERE certificate_id = $3
         RETURNING *`,
        [reason, blockchainTransactionId, certificateId]
      );
      certificateRow = certificatesResult.rows[0];
    } catch (certErr) {
      console.warn('Certificates table update unavailable:', certErr.message);
    }

    let verifyHistoryRow = null;
    try {
      const verifyResult = await safeQuery(
        `UPDATE verify_history
         SET verification_status = 'revoked', verification_message = $1, revoked_at = NOW(), revoked_by = $2, blockchain_transaction_id = $3
         WHERE certificate_id = $4
         RETURNING id, certificate_id, verification_status, verification_message, revoked_at, blockchain_transaction_id`,
        [reason, req.user.id, blockchainTransactionId, certificateId]
      );
      verifyHistoryRow = verifyResult.rows[0];
    } catch (dbErr) {
      console.warn('Database revoke update unavailable, using local store only:', dbErr.message);
    }

    try {
      await safeQuery(
        `INSERT INTO revoked_certificates (certificate_id, issuer_id, revocation_reason, revoked_by, blockchain_transaction_id)
         VALUES ($1, NULL, $2, $3, $4)
         ON CONFLICT (certificate_id) DO UPDATE SET revocation_reason = EXCLUDED.revocation_reason, revoked_at = NOW(), revoked_by = EXCLUDED.revoked_by, blockchain_transaction_id = EXCLUDED.blockchain_transaction_id`,
        [certificateId, reason, req.user.id, blockchainTransactionId]
      );
    } catch (dbErr) {
      console.warn('Database revocation log unavailable:', dbErr.message);
    }

    if (!localCertificate && !certificateRow && !verifyHistoryRow) {
      return res.status(404).json({ error: 'Certificate not found' });
    }

    const auditId = certificateRow?.id || verifyHistoryRow?.id || localCertificate?.id || certificateId;
    await logAudit(req.user.id, 'CERTIFICATE_REVOKE', 'certificate', auditId, 'success', null, { certificateId, reason, blockchainTransactionId });

    res.json({
      success: true,
      certificate: certificateRow || verifyHistoryRow || localCertificate
    });
  } catch (err) {
    console.error('Revoke certificate error:', err);
    res.status(500).json({ error: 'Failed to revoke certificate', details: err.message });
  }
});

module.exports = router;
