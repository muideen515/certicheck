const fs = require('fs');
const path = require('path');

let anchor = null;
let web3 = null;

try {
  anchor = require('@coral-xyz/anchor');
  web3 = require('@solana/web3.js');
} catch (err) {
  console.warn('Solana SDK unavailable; on-chain certificate features will be disabled:', err.message);
}

const DEFAULT_PROGRAM_ID = '4aCWiNjpLPtMa1gQd3Tu5jfSpKEFDR3PbANP5br8Fmob';

function getSolanaSdk() {
  if (!web3 || !anchor) {
    throw new Error('Solana SDK is not available. Install @coral-xyz/anchor and @solana/web3.js to enable on-chain certificate features.');
  }
  return { anchor, web3 };
}

function getWeb3() {
  return getSolanaSdk().web3;
}

function getClusterUrl() {
  const { clusterApiUrl } = getWeb3();
  return process.env.SOLANA_RPC_URL || clusterApiUrl(process.env.SOLANA_CLUSTER || 'devnet');
}

function getConnection() {
  const { Connection } = getWeb3();
  return new Connection(getClusterUrl(), 'confirmed');
}

function getCertificateProgramId() {
  const configured = process.env.CERTIFICATE_PROGRAM_ID || DEFAULT_PROGRAM_ID;
  try {
    new (getWeb3().PublicKey)(configured);
    return configured;
  } catch (err) {
    throw new Error(`Invalid CERTIFICATE_PROGRAM_ID: ${configured}`);
  }
}

function getAnchorIdlPath() {
  const repoRoot = path.resolve(__dirname, '../../../');
  const idlPath = path.join(repoRoot, 'solana-program', 'idl', 'certificate_system.json');
  if (!fs.existsSync(idlPath)) {
    throw new Error(`Anchor IDL not found at ${idlPath}`);
  }
  return idlPath;
}

function loadPayerKeypair() {
  const { Keypair } = getWeb3();
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
      throw new Error(`Solana keypair file not found at ${absolutePath}`);
    }

    const raw = fs.readFileSync(absolutePath, 'utf8');
    try {
      secretKeyData = JSON.parse(raw);
    } catch (err) {
      throw new Error(`Unable to parse Solana keypair file at ${absolutePath}: ${err.message}`);
    }
  }

  if (!secretKeyData) {
    return null;
  }

  return Keypair.fromSecretKey(Uint8Array.from(secretKeyData));
}

function isValidSolanaAddress(address) {
  try {
    new (getWeb3().PublicKey)(address);
    return true;
  } catch {
    return false;
  }
}

function getProgramClient() {
  const { PublicKey } = getWeb3();
  const programId = new PublicKey(getCertificateProgramId());
  const idl = JSON.parse(fs.readFileSync(getAnchorIdlPath(), 'utf8'));
  return { programId, idl };
}

async function initializeIssuerOnChain(program, issuerAuthority, issuerPda, issuerName = 'Certicheck Issuer', issuerMetadataUri = '') {
  const current = await program.provider.connection.getAccountInfo(issuerPda);
  if (current) {
    return null;
  }

  const txSignature = await program.methods
    .initializeIssuer(issuerName, issuerMetadataUri)
    .accounts({
      issuer: issuerPda,
      authority: issuerAuthority,
      systemProgram: anchor.web3.SystemProgram.programId
    })
    .rpc();

  await program.provider.connection.confirmTransaction(txSignature, 'confirmed');
  return txSignature;
}

async function lookupCertificateOnChain(certificateId, issuerWallet) {
  if (!web3 || !anchor) {
    return null;
  }

  try {
    const { Keypair, PublicKey } = getWeb3();
    const connection = getConnection();
    const { programId, idl } = getProgramClient();
    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(Keypair.generate()), { commitment: 'confirmed' });
    const program = new anchor.Program(idl, programId, provider);

    if (issuerWallet) {
      const issuerPubkey = new PublicKey(issuerWallet);
      const [issuerPda] = await PublicKey.findProgramAddress([Buffer.from('issuer'), issuerPubkey.toBuffer()], program.programId);
      const [certificatePda] = await PublicKey.findProgramAddress(
        [Buffer.from('certificate'), issuerPda.toBuffer(), Buffer.from(certificateId)],
        program.programId
      );

      const cert = await program.account.certificateAccount.fetch(certificatePda);
      return normalizeOnChainCertificate(cert);
    }

    const certificateAccounts = await program.account.certificateAccount.all();
    const match = certificateAccounts.find(({ account }) => account && account.certId === certificateId);
    if (!match) {
      return null;
    }

    return normalizeOnChainCertificate(match.account);
  } catch (err) {
    return null;
  }
}

function normalizeOnChainCertificate(cert) {
  if (!cert) {
    return null;
  }

  const issuer = cert.issuer && typeof cert.issuer.toBase58 === 'function' ? cert.issuer.toBase58() : cert.issuer;
  const holder = cert.holder && typeof cert.holder.toBase58 === 'function' ? cert.holder.toBase58() : cert.holder;

  return {
    certificate_id: cert.certId,
    issuer,
    holder,
    holder_name: cert.holderName,
    cert_type: cert.certType,
    metadata_uri: cert.metadataUri,
    is_revoked: Boolean(cert.isRevoked),
    revoke_reason: cert.revokeReason,
    issued_at: Number(cert.issuedAt),
    revoked_at: cert.revokedAt ? Number(cert.revokedAt) : null,
    on_chain: true,
    verification_status: cert.isRevoked ? 'revoked' : 'valid'
  };
}

async function issueCertificateOnChain({ certificateId, ipfsCid, certificateType, issuerWallet, holderWallet, holderName, holderEmail, issuerName, metadataHash }) {
  const { PublicKey } = getWeb3();
  const payer = loadPayerKeypair();
  if (!payer) {
    throw new Error('SOLANA_PAYER_SECRET or SOLANA_KEYPAIR_PATH must be configured to issue certificates on-chain.');
  }

  const connection = getConnection();
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), { commitment: 'confirmed' });
  anchor.setProvider(provider);

  const { programId, idl } = getProgramClient();
  const program = new anchor.Program(idl, programId, provider);

  const issuerPubkey = issuerWallet ? new PublicKey(issuerWallet) : payer.publicKey;

  const [issuerPda] = await PublicKey.findProgramAddress([Buffer.from('issuer'), issuerPubkey.toBuffer()], program.programId);
  const [certificatePda] = await PublicKey.findProgramAddress(
    [Buffer.from('certificate'), issuerPda.toBuffer(), Buffer.from(certificateId)],
    program.programId
  );

  const issuerInfo = await connection.getAccountInfo(issuerPda);
  if (!issuerInfo) {
    const issuerMetadataUri = ipfsCid ? `ipfs://${ipfsCid}` : '';
    await initializeIssuerOnChain(program, payer.publicKey, issuerPda, issuerName || 'Certicheck Issuer', issuerMetadataUri);
  }

  const holderPubkey = holderWallet ? new PublicKey(holderWallet) : payer.publicKey;
  const metadataUri = ipfsCid ? `ipfs://${ipfsCid}` : '';
  const sig = await program.methods
    .issueCertificate(
      certificateId,
      holderName || '',
      certificateType || '',
      metadataUri,
      metadataHash || ipfsCid || ''
    )
    .accounts({
      issuer: issuerPda,
      holder: holderPubkey,
      certificate: certificatePda,
      authority: payer.publicKey,
      systemProgram: anchor.web3.SystemProgram.programId
    })
    .rpc();

  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

async function revokeCertificateOnChain({ certificateId, reason, issuerWallet }) {
  const { PublicKey } = getWeb3();
  const payer = loadPayerKeypair();
  if (!payer) {
    throw new Error('SOLANA_PAYER_SECRET or SOLANA_KEYPAIR_PATH must be configured to revoke certificates on-chain.');
  }

  const connection = getConnection();
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), { commitment: 'confirmed' });
  anchor.setProvider(provider);

  const { programId, idl } = getProgramClient();
  const program = new anchor.Program(idl, programId, provider);

  const issuerPubkey = issuerWallet ? new PublicKey(issuerWallet) : payer.publicKey;

  const [issuerPda] = await PublicKey.findProgramAddress([Buffer.from('issuer'), issuerPubkey.toBuffer()], program.programId);
  const [certificatePda] = await PublicKey.findProgramAddress(
    [Buffer.from('certificate'), issuerPda.toBuffer(), Buffer.from(certificateId)],
    program.programId
  );

  const sig = await program.methods
    .revokeCertificate(reason || '')
    .accounts({
      certificate: certificatePda,
      issuer: issuerPda,
      authority: payer.publicKey
    })
    .rpc();

  await connection.confirmTransaction(sig, 'confirmed');
  return sig;
}

async function getTransactionStatus(signature) {
  if (!signature) {
    return null;
  }

  const connection = getConnection();
  const result = await connection.getSignatureStatuses([signature]);
  return result?.value?.[0] || null;
}

async function getProgramStats() {
  try {
    return {
      network: process.env.SOLANA_CLUSTER || 'devnet',
      programId: getCertificateProgramId(),
      rpcUrl: getClusterUrl(),
      status: 'configured',
      lastUpdated: new Date().toISOString()
    };
  } catch (err) {
    return {
      network: process.env.SOLANA_CLUSTER || 'devnet',
      programId: DEFAULT_PROGRAM_ID,
      rpcUrl: process.env.SOLANA_RPC_URL || 'unavailable',
      status: 'demo-mode',
      lastUpdated: new Date().toISOString(),
      warning: err.message
    };
  }
}

module.exports = {
  isValidSolanaAddress,
  lookupCertificateOnChain,
  getProgramStats,
  issueCertificateOnChain,
  revokeCertificateOnChain,
  getTransactionStatus
};
