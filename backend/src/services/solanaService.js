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

async function lookupCertificateOnChain(certificateId, issuerWallet) {
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

    const cert = await program.account.certificateAccount.fetchNullable(certificatePda);
    return normalizeOnChainCertificate(cert);
  }

  const certificateAccounts = await program.account.certificateAccount.all();
  const matches = certificateAccounts.filter(({ account }) => account && account.certId === certificateId);
  if (matches.length > 1) {
    throw new Error(`Certificate ID ${certificateId} exists under multiple issuer accounts; provide its issuer wallet.`);
  }
  return normalizeOnChainCertificate(matches[0]?.account);
}

async function verifyIssuedCertificateOnChain({ certificateId, issuerWallet, holderWallet, holderName, certificateType, ipfsCid }) {
  const { PublicKey } = getWeb3();
  const cert = await lookupCertificateOnChain(certificateId, issuerWallet);
  if (!cert) return null;

  const [issuerPda] = await PublicKey.findProgramAddress(
    [Buffer.from('issuer'), new PublicKey(issuerWallet).toBuffer()],
    new PublicKey(getCertificateProgramId())
  );
  const expectedHolder = holderWallet || issuerWallet;
  if (
    cert.issuer !== issuerPda.toBase58() ||
    cert.holder !== new PublicKey(expectedHolder).toBase58() ||
    cert.holder_name !== holderName ||
    cert.cert_type !== certificateType ||
    cert.metadata_uri !== `ipfs://${ipfsCid}` ||
    cert.metadata_hash !== ipfsCid
  ) {
    throw new Error('On-chain certificate data does not match the submitted issuance details.');
  }
  return cert;
}

async function verifyProgramTransaction({ signature, instructionName, expectedArgs, issuerWallet }) {
  const connection = getConnection();
  const { programId, idl } = getProgramClient();
  const { Keypair, PublicKey } = getWeb3();
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(Keypair.generate()), { commitment: 'confirmed' });
  const program = new anchor.Program(idl, programId, provider);
  const transaction = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });

  if (!transaction || transaction.meta?.err) {
    throw new Error('The supplied Solana transaction was not confirmed successfully.');
  }

  const message = transaction.transaction.message;
  const accountKeys = message.accountKeys || message.staticAccountKeys;
  const instructions = message.compiledInstructions || message.instructions || [];
  const authorityPosition = instructionName === 'issueCertificate' ? 3 : 2;
  const expectedAuthority = new PublicKey(issuerWallet);

  for (const instruction of instructions) {
    const instructionProgramId = instruction.programId ||
      accountKeys[instruction.programIdIndex];
    if (!instructionProgramId || !new PublicKey(instructionProgramId).equals(programId)) continue;

    const decoded = program.coder.instruction.decode(instruction.data, 'base58');
    if (!decoded || decoded.name !== instructionName) continue;
    if (!expectedArgs.every(([name, value]) => decoded.data[name] === value)) continue;

    const accountIndexes = instruction.accountKeyIndexes || instruction.accounts || [];
    const authorityIndex = accountIndexes[authorityPosition];
    const authority = accountKeys[authorityIndex];
    const numRequiredSignatures = message.header?.numRequiredSignatures || 0;
    if (
      authority &&
      authorityIndex < numRequiredSignatures &&
      new PublicKey(authority).equals(expectedAuthority)
    ) {
      return true;
    }
  }

  throw new Error(`The supplied transaction does not contain the expected ${instructionName} instruction signed by the issuer.`);
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
    metadata_hash: cert.metadataHash,
    is_revoked: cert.isRevoked === true || Number(cert.status || 0) === 1,
    status: Number(cert.status || 0),
    revoke_reason: cert.revokeReason,
    issued_at: Number(cert.issuedAt),
    revoked_at: Number(cert.revokedAt || 0),
    on_chain: true,
    verification_status: Number(cert.status || 0) === 1 ? 'revoked' : 'valid'
  };
}

async function getTransactionStatus(signature) {
  if (!signature) {
    return null;
  }

  const connection = getConnection();
  const result = await connection.getSignatureStatuses([signature], { searchTransactionHistory: true });
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
  verifyIssuedCertificateOnChain,
  verifyProgramTransaction,
  getProgramStats,
  getTransactionStatus
};
