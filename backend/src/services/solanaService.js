const fs = require('fs');
const path = require('path');
const bs58 = require('bs58');
const anchor = require('@coral-xyz/anchor');
const {
  Connection,
  clusterApiUrl,
  Keypair,
  Transaction,
  TransactionInstruction,
  PublicKey
} = require('@solana/web3.js');

function getClusterUrl() {
  return process.env.SOLANA_RPC_URL || clusterApiUrl(process.env.SOLANA_CLUSTER || 'devnet');
}

function getConnection() {
  return new Connection(getClusterUrl(), 'confirmed');
}

function loadPayerKeypair() {
  const envSecret = process.env.SOLANA_PAYER_SECRET;
  const keypairPath = process.env.SOLANA_KEYPAIR_PATH;
  let secretKeyData = null;

  if (envSecret) {
    try {
      secretKeyData = JSON.parse(envSecret);
    } catch (err) {
      throw new Error('Invalid SOLANA_PAYER_SECRET format. It must be a JSON array.');
    }
  } else if (keypairPath) {
    const resolvedPath = keypairPath.replace(/^~(?=$|\/|\\)/, process.env.HOME || process.env.USERPROFILE || '');
    const absolutePath = path.isAbsolute(resolvedPath) ? resolvedPath : path.resolve(process.cwd(), resolvedPath);
    if (!fs.existsSync(absolutePath)) {
      console.warn(`Solana keypair file not found at ${absolutePath}. Falling back to demo transaction mode.`);
      return null;
    }
    const raw = fs.readFileSync(absolutePath, 'utf8');
    try {
      secretKeyData = JSON.parse(raw);
    } catch (err) {
      console.warn(`Unable to parse Solana keypair file at ${absolutePath}. Falling back to demo transaction mode.`, err.message);
      return null;
    }
  }

  if (!secretKeyData) {
    return null;
  }

  return Keypair.fromSecretKey(Uint8Array.from(secretKeyData));
}

function isValidSolanaAddress(address) {
  try {
    new PublicKey(address);
    return true;
  } catch {
    return false;
  }
}

function writeStringField(value) {
  const buffer = Buffer.from(value, 'utf8');
  const length = Buffer.alloc(4);
  length.writeUInt32LE(buffer.length, 0);
  return Buffer.concat([length, buffer]);
}

function readStringField(buffer, offset) {
  const length = buffer.readUInt32LE(offset);
  const start = offset + 4;
  const end = start + length;
  return {
    value: buffer.slice(start, end).toString('utf8'),
    offset: end
  };
}

async function initializeIssuerOnChain(program, issuerAuthority, issuerPda, issuerName = 'Certicheck Issuer', issuerMetadataUri = '') {
  const connection = getConnection();
  const accountInfo = await connection.getAccountInfo(issuerPda);
  if (accountInfo) {
    return null;
  }

  const tx = await program.methods
    .initializeIssuer(issuerName, issuerMetadataUri)
    .accounts({
      issuer: issuerPda,
      authority: issuerAuthority,
      systemProgram: anchor.web3.SystemProgram.programId
    })
    .rpc();

  await connection.confirmTransaction(tx, 'confirmed');
  return tx;
}

async function lookupCertificateOnChain(certificateId) {
  const programIdString = getCertificateProgramId();
  if (!programIdString) {
    return null;
  }

  const connection = getConnection();
  const programId = new PublicKey(programIdString);
  const bytes = writeStringField(certificateId);
  const filter = bs58.encode(bytes);

  const accounts = await connection.getProgramAccounts(programId, {
    filters: [{ memcmp: { offset: 72, bytes: filter } }]
  });

  if (!accounts || accounts.length === 0) {
    return null;
  }

  const data = Buffer.from(accounts[0].account.data);
  let offset = 8;
  const issuer = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;
  const holder = new PublicKey(data.slice(offset, offset + 32));
  offset += 32;

  const certIdField = readStringField(data, offset);
  const certId = certIdField.value;
  offset = certIdField.offset;

  const holderNameField = readStringField(data, offset);
  const holderName = holderNameField.value;
  offset = holderNameField.offset;

  const certTypeField = readStringField(data, offset);
  const certType = certTypeField.value;
  offset = certTypeField.offset;

  const metadataUriField = readStringField(data, offset);
  const metadataUri = metadataUriField.value;
  offset = metadataUriField.offset;

  const isRevoked = Boolean(data.readUInt8(offset));
  offset += 1;

  const revokeReasonField = readStringField(data, offset);
  const revokeReason = revokeReasonField.value;
  offset = revokeReasonField.offset;

  const issuedAt = Number(data.readBigInt64LE(offset));
  offset += 8;

  const hasRevokedAt = data.readUInt8(offset);
  offset += 1;
  let revokedAt = null;
  if (hasRevokedAt === 1) {
    revokedAt = Number(data.readBigInt64LE(offset));
    offset += 8;
  }

  const bump = data.readUInt8(offset);

  return {
    certificate_id: certId,
    issuer: issuer.toBase58(),
    holder: holder.toBase58(),
    holder_name: holderName,
    cert_type: certType,
    metadata_uri: metadataUri,
    is_revoked: isRevoked,
    revoke_reason: revokeReason,
    issued_at: issuedAt,
    revoked_at: revokedAt,
    bump,
    on_chain: true,
    verification_status: isRevoked ? 'revoked' : 'valid'
  };
}

function getCertificateProgramId() {
  const programId = process.env.CERTIFICATE_PROGRAM_ID;
  if (!programId) {
    return null;
  }
  if (!isValidSolanaAddress(programId)) {
    throw new Error('Invalid CERTIFICATE_PROGRAM_ID. It must be a valid Solana public key.');
  }
  return programId;
}

function getAnchorIdlPath() {
  const repoRoot = path.resolve(__dirname, '../../../');
  const idlPath = path.join(repoRoot, 'solana-program', 'idl', 'certificate_system.json');
  if (!fs.existsSync(idlPath)) {
    throw new Error(`Anchor IDL not found at ${idlPath}`);
  }
  return idlPath;
}

async function sendMemoTransaction(message, signer) {
  const connection = getConnection();
  const memoProgramId = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
  const instruction = new TransactionInstruction({
    keys: [],
    programId: memoProgramId,
    data: Buffer.from(message, 'utf8')
  });

  const tx = new Transaction().add(instruction);
  tx.feePayer = signer.publicKey;
  tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;

  const signature = await connection.sendTransaction(tx, [signer]);
  await connection.confirmTransaction(signature, 'confirmed');
  return signature;
}

async function issueCertificateOnChain({ certificateId, ipfsCid, certificateType, issuerWallet, holderWallet, holderName, holderEmail, issuerName, metadataHash }) {
  const payer = loadPayerKeypair();
  // fallback demo-id when no payer/keypair available
  if (!payer) {
    return `demo-${certificateId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  }

  const programIdString = getCertificateProgramId();
  const connection = getConnection();

  // If program ID is configured, call the Anchor program instructions directly.
  if (programIdString) {
    const idl = JSON.parse(fs.readFileSync(getAnchorIdlPath(), 'utf8'));
    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), { commitment: 'confirmed' });
    const program = new anchor.Program(idl, new PublicKey(programIdString), provider);

    try {
      const issuerAuthority = payer.publicKey;
      if (issuerWallet && new PublicKey(issuerWallet).toBase58() !== payer.publicKey.toBase58()) {
        console.warn('Provided issuerWallet does not match payer keypair. Using payer keypair as on-chain issuer authority.');
      }

      const [issuerPda] = await PublicKey.findProgramAddress([
        Buffer.from('issuer'), issuerAuthority.toBuffer()
      ], program.programId);

      const issuerAccountInfo = await connection.getAccountInfo(issuerPda);
      if (!issuerAccountInfo) {
        const issuerNameForInit = issuerName || 'Certicheck Issuer';
        const issuerMetadataUri = ipfsCid ? `ipfs://${ipfsCid}` : '';
        await initializeIssuerOnChain(program, issuerAuthority, issuerPda, issuerNameForInit, issuerMetadataUri);
      }

      const holderPub = holderWallet ? new PublicKey(holderWallet) : payer.publicKey;

      const [certificatePda] = await PublicKey.findProgramAddress([
        Buffer.from('certificate'), issuerPda.toBuffer(), Buffer.from(certificateId)
      ], program.programId);

      const sig = await program.methods.issueCertificate(certificateId, holderName || '', certificateType || '', ipfsCid || '', metadataHash || '')
        .accounts({
          issuer: issuerPda,
          holder: holderPub,
          certificate: certificatePda,
          authority: issuerAuthority,
          systemProgram: anchor.web3.SystemProgram.programId
        })
        .rpc();

      await connection.confirmTransaction(sig, 'confirmed');
      return sig;
    } catch (err) {
      const forceAnchor = process.env.SOLANA_FORCE_ANCHOR === 'true';
      console.error('Anchor program issuance error:', err.message);
      if (forceAnchor) {
        throw new Error(`Anchor issuance failed and SOLANA_FORCE_ANCHOR=true: ${err.message}`);
      }
      throw new Error(`Anchor issuance failed: ${err.message}`);
    }
  }

  const payload = JSON.stringify({
    action: 'issue_certificate',
    certificateId,
    ipfsCid,
    certificateType,
    issuerWallet: issuerWallet || null,
    holderName,
    holderEmail,
    issuedAt: new Date().toISOString()
  });

  return sendMemoTransaction(payload, payer);
}

async function revokeCertificateOnChain({ certificateId, reason, issuerWallet }) {
  const payer = loadPayerKeypair();
  if (!payer) {
    return `demo-revoke-${certificateId.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  }

  const programIdString = getCertificateProgramId();
  const connection = getConnection();

  if (programIdString) {
    try {
      const idlPath = path.resolve(process.cwd(), 'solana-program', 'idl', 'certificate_system.json');
      if (!fs.existsSync(idlPath)) throw new Error('Program IDL not found');
      const idl = JSON.parse(fs.readFileSync(idlPath, 'utf8'));

      const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), { commitment: 'confirmed' });
      const program = new anchor.Program(idl, new PublicKey(programIdString), provider);

      const issuerAuthority = payer.publicKey;
      if (issuerWallet && new PublicKey(issuerWallet).toBase58() !== payer.publicKey.toBase58()) {
        console.warn('Provided issuerWallet does not match payer keypair. Using payer keypair as on-chain issuer authority.');
      }
      const [issuerPda] = await PublicKey.findProgramAddress([
        Buffer.from('issuer'), issuerAuthority.toBuffer()
      ], program.programId);

      const [certificatePda] = await PublicKey.findProgramAddress([
        Buffer.from('certificate'), issuerPda.toBuffer(), Buffer.from(certificateId)
      ], program.programId);

      const sig = await program.methods.revokeCertificate(reason || '')
        .accounts({
          certificate: certificatePda,
          issuer: issuerPda,
          authority: issuerAuthority
        })
        .rpc();

      await connection.confirmTransaction(sig, 'confirmed');
      return sig;
    } catch (err) {
      const forceAnchor = process.env.SOLANA_FORCE_ANCHOR === 'true';
      console.error('Anchor program revoke error:', err.message);
      if (forceAnchor) {
        throw new Error(`Anchor revoke failed and SOLANA_FORCE_ANCHOR=true: ${err.message}`);
      }
      throw new Error(`Anchor revoke failed: ${err.message}`);
    }
  }

  const payload = JSON.stringify({
    action: 'revoke_certificate',
    certificateId,
    reason,
    revokedAt: new Date().toISOString()
  });

  return sendMemoTransaction(payload, payer);
}

async function getTransactionStatus(signature) {
  const connection = getConnection();
  const status = await connection.getSignatureStatuses([signature]);
  return status?.value?.[0] || null;
}

async function getProgramStats() {
  return {
    network: process.env.SOLANA_CLUSTER || 'devnet',
    programId: getCertificateProgramId() || 'DemoProgramId',
    rpcUrl: getClusterUrl(),
    status: 'configured',
    lastUpdated: new Date().toISOString()
  };
}

module.exports = {
  isValidSolanaAddress,
  lookupCertificateOnChain,
  getProgramStats,
  issueCertificateOnChain,
  revokeCertificateOnChain,
  getTransactionStatus
};
