const express = require('express');
const pool = require('../db/connection');
const { verifyToken, verifyIssuer, logAudit } = require('../middleware/auth');
const { pinJsonToIpfs } = require('../services/ipfsService');
const { issueCertificateOnChain, revokeCertificateOnChain, lookupCertificateOnChain, getTransactionStatus } = require('../services/solanaService');
const { getDemoCertificate } = require('../services/demoCertificateService');
const { CertificateStore } = require('../services/certificateStore');
const EmailService = require('../services/emailService');

const router = express.Router();
const MAX_CERTIFICATE_ATTACHMENT_BYTES = 4 * 1024 * 1024;

function getCertificateAttachmentError(metadata) {
  const attachment = metadata?.attachment;
  if (!attachment) return null;
  if (typeof attachment !== 'object' || typeof attachment.dataUrl !== 'string') {
    return 'The supporting file could not be read. Please choose it again.';
  }
  const match = attachment.dataUrl.match(/^data:[^;,]+;base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) return 'The supporting file has an invalid format.';
  const size = Buffer.from(match[1], 'base64').length;
  if (size > MAX_CERTIFICATE_ATTACHMENT_BYTES || Number(attachment.size) > MAX_CERTIFICATE_ATTACHMENT_BYTES) {
    return 'Supporting files must be 4 MB or smaller.';
  }
  return null;
}

function getPublicCertificateMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const publicMetadata = { ...metadata };
  if (
    publicMetadata.attachment &&
    typeof publicMetadata.attachment === 'object' &&
    'dataUrl' in publicMetadata.attachment
  ) {
    const attachment = { ...publicMetadata.attachment };
    delete attachment.dataUrl;
    publicMetadata.attachment = attachment;
  }
  return publicMetadata;
}

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
      !trimmedHolderEmail || !EmailService.isValidEmail(trimmedHolderEmail) ||
      !trimmedCertificateType ||
      !trimmedIssuerName
    ) {
      return res.status(400).json({ error: 'Missing required certificate fields' });
    }

    const requestedMetadata = typeof metadata === 'object' && metadata !== null ? metadata : {};
    const attachmentError = getCertificateAttachmentError(requestedMetadata);
    if (attachmentError) return res.status(400).json({ error: attachmentError });
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

    const existingCertificate = process.env.DEMO_MODE === 'true'
      ? getCertificateStore().lookup(trimmedCertificateId)
      : null;
    if (existingCertificate) {
      return res.status(409).json({ error: 'Certificate with this ID already exists' });
    }

    try {
      const existing = await safeQuery(
        'SELECT certificate_id FROM certificates WHERE certificate_id = $1 LIMIT 1',
        [trimmedCertificateId]
      );
      if (existing.rows[0]) {
        return res.status(409).json({ error: 'Certificate with this ID already exists' });
      }
    } catch (dbErr) {
      if (process.env.DEMO_MODE !== 'true') {
        return res.status(503).json({ error: 'Certificate database is unavailable. Please try again.' });
      }
      console.warn('Certificate duplicate check unavailable in demo mode:', dbErr.message);
    }

    let dbCertificate = null;
    try {
      const certificateResult = await safeQuery(
        `INSERT INTO certificates
          (certificate_id, issuer_user_id, issuer_name, issuer_wallet, holder_name, holder_email, certificate_type, status, ipfs_cid, ipfs_uri, blockchain_transaction_id, metadata, issued_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
         RETURNING *`,
        [
          trimmedCertificateId,
          req.user.id,
          trimmedIssuerName,
          trimmedIssuerWallet,
          trimmedHolderName,
          trimmedHolderEmail,
          trimmedCertificateType,
          'valid',
          null,
          null,
          null,
          JSON.stringify(requestedMetadata),
          issuedAt
        ]
      );
      dbCertificate = certificateResult.rows[0];
    } catch (dbErr) {
      if (/duplicate|unique/i.test(dbErr.message)) {
        return res.status(409).json({ error: 'Certificate with this ID already exists' });
      }
      if (process.env.DEMO_MODE !== 'true') {
        console.error('Certificate database insert failed:', dbErr.message);
        return res.status(503).json({ error: 'Certificate could not be saved to the database. Please try again.' });
      }
      console.warn('Certificate database insert unavailable in demo mode:', dbErr.message);
    }

    let ipfsCid = null;
    let ipfsUri = null;
    let blockchainTransactionId = null;
    let issuancePath = 'database-only';
    const warnings = [];
    try {
      const ipfsResult = await pinJsonToIpfs(certificateMetadata);
      const isUnpinnedFallback = ipfsResult?.source === 'fallback' && process.env.DEMO_MODE !== 'true';
      ipfsCid = isUnpinnedFallback ? null : (ipfsResult?.cid || null);
      ipfsUri = ipfsCid ? `https://gateway.pinata.cloud/ipfs/${ipfsCid}` : null;
      if (isUnpinnedFallback) warnings.push('Certificate saved, but IPFS is not configured; metadata was not pinned.');
      else if (!ipfsCid) warnings.push('Certificate saved, but IPFS did not return a content ID.');
      else issuancePath = 'ipfs-only';
    } catch (ipfsErr) {
      console.warn('Certificate saved, but IPFS pinning failed:', ipfsErr.message);
      warnings.push('Certificate saved, but metadata could not be pinned to IPFS.');
    }

    if (ipfsCid && (onChain === true || process.env.SOLANA_ENABLE === 'true')) {
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
        console.warn('Certificate issuance transaction failed, recording database/IPFS only:', chainErr.message);
        warnings.push('Certificate saved, but on-chain issuance failed.');
      }
    } else if (onChain === true && !ipfsCid) {
      warnings.push('On-chain issuance was skipped because IPFS metadata is unavailable.');
    }

    if (dbCertificate && (ipfsCid || blockchainTransactionId)) {
      try {
        const result = await safeQuery(
          `UPDATE certificates
           SET ipfs_cid = $1, ipfs_uri = $2, blockchain_transaction_id = $3, updated_at = NOW()
           WHERE certificate_id = $4
           RETURNING *`,
          [ipfsCid, ipfsUri, blockchainTransactionId, trimmedCertificateId]
        );
        dbCertificate = result.rows[0] || dbCertificate;
      } catch (dbErr) {
        console.error('Certificate saved but IPFS/chain details could not be updated:', dbErr.message);
        warnings.push('Certificate saved, but IPFS or blockchain details could not be updated in the database.');
      }
    }

    if (dbCertificate) try {
      await safeQuery(
        `INSERT INTO verify_history
          (user_id, certificate_id, certificate_type, verification_status, verification_message, blockchain_hash, blockchain_transaction_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [req.user.id, trimmedCertificateId, trimmedCertificateType, 'valid', 'Issued via Certicheck', ipfsCid, blockchainTransactionId]
      );
    } catch (verifyErr) {
      console.warn('Failed to save verify history record:', verifyErr.message);
    }

    let localCertificate = null;
    if (process.env.DEMO_MODE === 'true') {
      localCertificate = getCertificateStore().issue({
        certificateId: trimmedCertificateId,
        holderName: trimmedHolderName,
        holderEmail: trimmedHolderEmail,
        certificateType: trimmedCertificateType,
        issuerName: trimmedIssuerName,
        issuerWallet: trimmedIssuerWallet,
        ipfsCid,
        ipfsUri,
        blockchainTransactionId,
        metadata: requestedMetadata,
        issuedAt,
        userId: req.user.id
      });
    }

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
      dbStored: Boolean(dbCertificate),
      localId: localCertificate?.id || null
    });

    const holderNotification = await EmailService.sendCertificateIssued({
      holderEmail: trimmedHolderEmail,
      holderName: trimmedHolderName,
      certificateId: trimmedCertificateId,
      certificateType: trimmedCertificateType,
      issuerName: trimmedIssuerName,
      issuerWallet: trimmedIssuerWallet,
      issuedAt,
      ipfsCid,
      blockchainTransactionId,
      metadata: requestedMetadata
    });

    res.status(201).json({
      success: true,
      holder_notification: { sent: holderNotification.sent, mode: holderNotification.mode },
      certificate: {
        certificate_id: trimmedCertificateId,
        ipfs_cid: ipfsCid,
        ipfs_uri: ipfsUri,
        blockchain_transaction_id: blockchainTransactionId,
        certificate_type: trimmedCertificateType,
        status: 'valid',
        issued_at: dbCertificate?.issued_at || issuedAt,
        created_at: dbCertificate?.created_at || issuedAt,
        verification_status: 'valid',
        issuer_name: trimmedIssuerName,
        issuer_wallet: trimmedIssuerWallet,
        holder_name: trimmedHolderName,
        holder_email: trimmedHolderEmail,
        metadata: requestedMetadata
      },
      warnings
    });
  } catch (err) {
    console.error('Issue certificate error:', err);
    res.status(500).json({ error: 'Failed to issue certificate', details: err.message });
  }
});

// Pin raw certificate metadata to IPFS and return the CID (used for client-side signing flows)
router.post('/pin', verifyToken, verifyIssuer, async (req, res) => {
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
    if (!trimmedCertificateId || !holderName || !holderEmail || !EmailService.isValidEmail(holderEmail) || !certificateType || !issuerName || !ipfsCid || !blockchainTransactionId) {
      return res.status(400).json({ error: 'Missing required fields for client-signed issuance' });
    }

    const normalizedMetadata = typeof metadata === 'object' && metadata !== null ? metadata : {};
    const attachmentError = getCertificateAttachmentError(normalizedMetadata);
    if (attachmentError) return res.status(400).json({ error: attachmentError });

    const issuedAt = new Date().toISOString();

    let dbCertificate = null;
    try {
      const result = await safeQuery(
        `INSERT INTO certificates
          (certificate_id, issuer_user_id, issuer_name, issuer_wallet, holder_name, holder_email, certificate_type, status, ipfs_cid, ipfs_uri, blockchain_transaction_id, metadata, issued_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW(),NOW())
         RETURNING *`,
        [
          trimmedCertificateId,
          req.user.id,
          issuerName,
          issuerWallet || null,
          holderName,
          holderEmail,
          certificateType,
          'valid',
          ipfsCid,
          `https://gateway.pinata.cloud/ipfs/${ipfsCid}`,
          blockchainTransactionId,
          JSON.stringify(normalizedMetadata),
          issuedAt
        ]
      );
      dbCertificate = result.rows[0];
    } catch (dbErr) {
      if (/duplicate|unique/i.test(dbErr.message)) {
        return res.status(409).json({ error: 'Certificate with this ID already exists' });
      }
      if (process.env.DEMO_MODE !== 'true') {
        console.error('Client-signed certificate database insert failed:', dbErr.message);
        return res.status(503).json({ error: 'Certificate could not be saved to the database. Please try again.' });
      }
      console.warn('Client-signed certificate database insert unavailable in demo mode:', dbErr.message);
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

    if (process.env.DEMO_MODE === 'true') {
      try {
        getCertificateStore().issue({
        certificateId: trimmedCertificateId,
        holderName,
        holderEmail,
        certificateType,
        issuerName,
        issuerWallet: issuerWallet || null,
        ipfsCid,
        ipfsUri: `https://gateway.pinata.cloud/ipfs/${ipfsCid}`,
        blockchainTransactionId,
        metadata: normalizedMetadata,
        issuedAt,
        userId: req.user.id
        });
      } catch (storeErr) {
        if (/already exists/i.test(storeErr.message)) {
          return res.status(409).json({ error: 'Certificate with this ID already exists' });
        }
        console.error('Failed to store client-signed certificate locally:', storeErr.message);
        return res.status(500).json({ error: 'Certificate could not be stored locally' });
      }
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

    const holderNotification = await EmailService.sendCertificateIssued({
      holderEmail,
      holderName,
      certificateId: trimmedCertificateId,
      certificateType,
      issuerName,
      issuerWallet,
      issuedAt,
      ipfsCid,
      blockchainTransactionId,
      metadata: normalizedMetadata
    });

    return res.status(201).json({ success: true, holder_notification: { sent: holderNotification.sent, mode: holderNotification.mode }, certificate: { certificate_id: trimmedCertificateId, ipfs_cid: ipfsCid, ipfs_uri: `https://gateway.pinata.cloud/ipfs/${ipfsCid}`, blockchain_transaction_id: blockchainTransactionId, status: 'valid', verification_status: 'valid', issuer_name: issuerName, issuer_wallet: issuerWallet, holder_name: holderName, holder_email: holderEmail, certificate_type: certificateType, metadata: normalizedMetadata, issued_at: dbCertificate?.issued_at || issuedAt, created_at: dbCertificate?.created_at || issuedAt } });
  } catch (err) {
    console.error('Issue client-signed error:', err);
    return res.status(500).json({ error: 'Failed to record client-signed issuance', details: err.message });
  }
});

router.get('/my-issued', verifyToken, verifyIssuer, async (req, res) => {
  try {
    let certificates;
    try {
      const result = await safeQuery(
        `SELECT certificate_id, certificate_type, status, ipfs_cid, ipfs_uri,
                blockchain_transaction_id, holder_name, holder_email, issuer_name,
                issuer_wallet, metadata, issued_at, created_at, revoked_at
         FROM certificates
         WHERE issuer_user_id = $1
         ORDER BY issued_at DESC`,
        [req.user.id]
      );
      certificates = result.rows;
      if (process.env.DEMO_MODE === 'true') {
        const stored = getCertificateStore().listByIssuer(req.user.id).map((record) => ({
          certificate_id: record.certificate_id,
          certificate_type: record.certificate_type,
          status: record.verification_status,
          verification_status: record.verification_status,
          ipfs_cid: record.ipfs_cid || record.blockchain_hash,
          ipfs_uri: record.ipfs_uri,
          blockchain_transaction_id: record.blockchain_transaction_id,
          holder_name: record.holder_name,
          holder_email: record.holder_email,
          issuer_name: record.issuer_name,
          issuer_wallet: record.issuer_wallet,
          metadata: record.metadata || {},
          issued_at: record.issued_at || record.checked_at,
          created_at: record.issued_at || record.checked_at,
          revoked_at: record.revoked_at
        }));
        const seen = new Set(certificates.map((record) => record.certificate_id));
        certificates.push(...stored.filter((record) => !seen.has(record.certificate_id)));
      }
    } catch (dbErr) {
      if (process.env.DEMO_MODE !== 'true') {
        console.error('Issuer certificate list query failed:', dbErr.message);
        return res.status(503).json({ error: 'Unable to load issued certificates right now' });
      }
      console.warn('Issuer certificate list unavailable in database; using demo store:', dbErr.message);
      certificates = getCertificateStore().listByIssuer(req.user.id).map((record) => ({
        certificate_id: record.certificate_id,
        certificate_type: record.certificate_type,
        status: record.verification_status,
        verification_status: record.verification_status,
        ipfs_cid: record.ipfs_cid || record.blockchain_hash,
        ipfs_uri: record.ipfs_uri,
        blockchain_transaction_id: record.blockchain_transaction_id,
        holder_name: record.holder_name,
        holder_email: record.holder_email,
        issuer_name: record.issuer_name,
        issuer_wallet: record.issuer_wallet,
        metadata: record.metadata || {},
        issued_at: record.issued_at || record.checked_at,
        created_at: record.issued_at || record.checked_at,
        revoked_at: record.revoked_at
      }));
    }
    return res.json({ success: true, certificates });
  } catch (err) {
    console.error('Issuer certificate list error:', err);
    return res.status(500).json({ error: 'Failed to load issued certificates' });
  }
});

async function revokeIssuerCertificate(req, res) {
  try {
    const certificateId = String(req.params.certificateId || '').trim();
    const reason = typeof req.body?.reason === 'string' && req.body.reason.trim()
      ? req.body.reason.trim()
      : 'Revoked by issuer';
    const suppliedTransactionId = typeof req.body?.blockchainTransactionId === 'string'
      ? req.body.blockchainTransactionId.trim()
      : '';
    let certificate = null;
    let dbAvailable = true;
    let ownershipMismatch = false;

    try {
      const result = await safeQuery(
        `SELECT c.certificate_id, c.issuer_user_id, c.issuer_wallet,
                ip.wallet_address AS authorized_issuer_wallet
         FROM certificates c
         LEFT JOIN issuer_profiles ip ON ip.user_id = $2 AND ip.status = 'approved'
         WHERE c.certificate_id = $1 LIMIT 1`,
        [certificateId, req.user.id]
      );
      if (result.rows[0]) {
        const certificateWallet = String(result.rows[0].issuer_wallet || '').trim();
        const authorizedWallet = String(result.rows[0].authorized_issuer_wallet || '').trim();
        const isIssuingUser = Number(result.rows[0].issuer_user_id) === Number(req.user.id);
        const isMatchingAuthority = Boolean(certificateWallet && authorizedWallet && certificateWallet === authorizedWallet);
        ownershipMismatch = !isIssuingUser && !isMatchingAuthority;
        if (!ownershipMismatch) certificate = result.rows[0];
      }
      if (!certificate && process.env.DEMO_MODE === 'true') {
        const local = getCertificateStore().lookup(certificateId);
        if (local) {
          ownershipMismatch = Number(local.created_by) !== Number(req.user.id);
          if (!ownershipMismatch) certificate = local;
        }
      }
    } catch (dbErr) {
      dbAvailable = false;
      if (process.env.DEMO_MODE !== 'true') {
        console.error('Issuer certificate ownership check failed:', dbErr.message);
        return res.status(503).json({ error: 'Unable to verify certificate ownership right now' });
      }
      const local = getCertificateStore().lookup(certificateId);
      if (local) {
        ownershipMismatch = Number(local.created_by) !== Number(req.user.id);
        if (!ownershipMismatch) certificate = local;
      }
    }

    if (!certificate) {
      if (ownershipMismatch) return res.status(403).json({ error: 'Not allowed to revoke this certificate' });
      return res.status(404).json({ error: 'Certificate not found' });
    }

    let blockchainTransactionId = suppliedTransactionId || null;
    if (!blockchainTransactionId && process.env.SOLANA_ENABLE === 'true' && process.env.CERTIFICATE_PROGRAM_ID) {
      try {
        blockchainTransactionId = await revokeCertificateOnChain({ certificateId, reason });
      } catch (chainErr) {
        console.warn('On-chain issuer revoke failed; continuing with database revocation:', chainErr.message);
      }
    }

    let updated = null;
    if (dbAvailable) {
      try {
        const result = await safeQuery(
          `UPDATE certificates
           SET status = 'revoked', revoked_at = NOW(), revocation_reason = $1,
               blockchain_transaction_id = COALESCE($2, blockchain_transaction_id), updated_at = NOW()
           WHERE certificate_id = $3
             AND (
               issuer_user_id = $4
               OR (
                 NULLIF(BTRIM(issuer_wallet), '') IS NOT NULL
                 AND BTRIM(issuer_wallet) = (
                 SELECT wallet_address FROM issuer_profiles
                 WHERE user_id = $4 AND status = 'approved'
                   AND NULLIF(BTRIM(wallet_address), '') IS NOT NULL
                 LIMIT 1
                 )
               )
             )
           RETURNING certificate_id, certificate_type, status, ipfs_cid, ipfs_uri,
                     blockchain_transaction_id, holder_name, holder_email, issuer_name,
                     issuer_wallet, metadata, issued_at, created_at, revoked_at`,
          [reason, blockchainTransactionId, certificateId, req.user.id]
        );
        updated = result.rows[0] || null;
      } catch (dbErr) {
        if (process.env.DEMO_MODE !== 'true') {
          console.error('Issuer certificate revoke update failed:', dbErr.message);
          return res.status(503).json({ error: 'Certificate revocation could not be saved. Please try again.' });
        }
      }
    }

    if (process.env.DEMO_MODE === 'true') {
      try {
        const local = getCertificateStore().lookup(certificateId);
        if (local && Number(local.created_by) === Number(req.user.id)) {
          const revoked = getCertificateStore().revoke(certificateId, reason, req.user.id);
          updated ||= {
            certificate_id: revoked.certificate_id,
            certificate_type: revoked.certificate_type,
            status: revoked.verification_status,
            verification_status: revoked.verification_status,
            ipfs_cid: revoked.ipfs_cid || revoked.blockchain_hash,
            ipfs_uri: revoked.ipfs_uri,
            blockchain_transaction_id: revoked.blockchain_transaction_id,
            holder_name: revoked.holder_name,
            holder_email: revoked.holder_email,
            issuer_name: revoked.issuer_name,
            issuer_wallet: revoked.issuer_wallet,
            metadata: revoked.metadata || {},
            issued_at: revoked.issued_at,
            created_at: revoked.issued_at,
            revoked_at: revoked.revoked_at
          };
        }
      } catch (storeErr) {
        console.error('Issuer certificate local revoke failed:', storeErr.message);
        if (!updated) return res.status(500).json({ error: 'Certificate revocation could not be saved' });
      }
    }

    if (!updated) return res.status(503).json({ error: 'Certificate revocation could not be saved. Please try again.' });

    try {
      await safeQuery(
        `UPDATE verify_history
         SET verification_status = 'revoked', verification_message = $1, revoked_at = NOW(),
             revoked_by = $2, blockchain_transaction_id = COALESCE($3, blockchain_transaction_id)
         WHERE certificate_id = $4`,
        [reason, req.user.id, blockchainTransactionId, certificateId]
      );
    } catch (historyErr) {
      console.warn('Issuer certificate verification history update failed:', historyErr.message);
    }

    await logAudit(req.user.id, 'CERTIFICATE_REVOKE', 'certificate', certificateId, 'success', null, {
      certificateId,
      reason,
      blockchainTransactionId
    });
    return res.json({ success: true, certificate: updated });
  } catch (err) {
    console.error('Issuer certificate revoke error:', err);
    return res.status(500).json({ error: 'Failed to revoke certificate' });
  }
}

router.put('/my-issued/:certificateId/revoke', verifyToken, verifyIssuer, revokeIssuerCertificate);
router.put('/revoke/:certificateId', verifyToken, verifyIssuer, revokeIssuerCertificate);

router.get('/lookup/:certificateId', async (req, res) => {
  try {
    const { certificateId } = req.params;

    try {
      const result = await safeQuery(
        `SELECT certificate_id, certificate_type, status, ipfs_cid, ipfs_uri,
                blockchain_transaction_id, holder_name, holder_email, issuer_name,
                issuer_wallet, metadata, issued_at, created_at, revoked_at
         FROM certificates WHERE certificate_id = $1 LIMIT 1`,
        [certificateId]
      );
      if (result.rows[0]) {
        const certificate = result.rows[0];
        return res.json({
          success: true,
          certificate: {
            ...certificate,
            metadata: getPublicCertificateMetadata(certificate.metadata),
            verification_status: certificate.status
          },
          status: certificate.status,
          onChain: Boolean(certificate.blockchain_transaction_id),
          blockchainTransactionStatus: await safeTransactionStatus(certificate.blockchain_transaction_id),
          verifiedAt: certificate.issued_at
        });
      }
    } catch (dbErr) {
      console.warn('Certificate lookup in certificates table failed:', dbErr.message);
    }

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
        certificate: {
          ...localCertificate,
          metadata: getPublicCertificateMetadata(localCertificate.metadata)
        },
        status: localCertificate.verification_status,
        onChain: Boolean(localCertificate.blockchain_transaction_id),
        blockchainTransactionStatus: transactionStatus,
        verifiedAt: localCertificate.checked_at
      });
    }

    let result;
    try {
      result = await safeQuery(
        `SELECT id, certificate_id, certificate_type, verification_status, verification_message, blockchain_hash, blockchain_transaction_id, checked_at, revoked_at, revoked_by
         FROM verify_history WHERE certificate_id = $1 LIMIT 1`,
        [certificateId]
      );
    } catch (historyErr) {
      if (process.env.DEMO_MODE !== 'true') throw historyErr;
      console.warn('Certificate lookup history unavailable in demo mode:', historyErr.message);
      return res.status(404).json({ success: false, status: 'not_found', error: 'Certificate not found' });
    }

    if (!result.rows[0]) {
      return res.status(404).json({ success: false, status: 'not_found', error: 'Certificate not found' });
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
    res.status(503).json({ success: false, error: 'Certificate verification is temporarily unavailable' });
  }
});

// Lookup certificates for a holder (chain-first, DB/local fallback)
router.get('/lookup-by-holder', async (req, res) => {
  try {
    const { email, wallet } = req.query;
    if (!email && !wallet) return res.status(400).json({ error: 'Provide email or wallet query param' });

    // First try chain-based search if wallet provided
    if (wallet) {
      try {
        // solanaService.lookupCertificateOnChain supports searching by issuer+certId only,
        // so we fall back to local store when looking up by holder wallet
      } catch (e) {
        // ignore
      }
    }

    // Search local certificate store
    const store = getCertificateStore();
    const all = store.read();
    const normalizedEmail = (email || '').toLowerCase();
    const matches = all.filter(c => {
      const holderEmail = String(c.holder_email || c.holderEmail || '').toLowerCase();
      const holderWallet = String(c.holder_wallet || c.holderWallet || '');
      return (normalizedEmail && holderEmail === normalizedEmail) || (wallet && holderWallet === wallet);
    });

    // If none found, try DB verify_history as fallback (demo-mode friendly)
    if (!matches.length) {
      try {
        const result = await safeQuery(
          `SELECT id, certificate_id, certificate_type, verification_status, verification_message, blockchain_hash, blockchain_transaction_id, checked_at
           FROM verify_history WHERE LOWER(holder_email) = LOWER($1) LIMIT 50`,
          [email]
        );
        if (result.rows && result.rows.length) {
          return res.json({ success: true, certificates: result.rows });
        }
      } catch (err) {
        // ignore DB errors in demo mode
      }
    }

    return res.json({ success: true, certificates: matches });
  } catch (err) {
    console.error('Lookup by holder error:', err);
    return res.status(500).json({ error: 'Failed to lookup by holder' });
  }
});

module.exports = router;
