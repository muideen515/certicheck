import * as anchor from '@coral-xyz/anchor';
import { Program, web3 } from '@coral-xyz/anchor';
import { assert } from 'chai';
import fs from 'fs';

describe('certificate_system', () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(fs.readFileSync('idl/certificate_system.json', 'utf8'));
  const program = new Program(
    idl,
    new web3.PublicKey('4aCWiNjpLPtMa1gQd3Tu5jfSpKEFDR3PbANP5br8Fmob'),
    provider
  ) as Program<any>;

  const issuerKeypair = web3.Keypair.generate();
  const unauthorizedKeypair = web3.Keypair.generate();
  const holderKeypair = web3.Keypair.generate();
  const issuerPdaSeeds = [Buffer.from('issuer'), issuerKeypair.publicKey.toBuffer()];
  let issuerPda: web3.PublicKey;
  let certificatePda: web3.PublicKey;
  const certId = 'CERT-ANCHOR-0001';
  const holderName = 'Alice Anchor';
  const certType = 'Degree';
  const metadataUri = 'ipfs://QmTestMetadataCid';
  const metadataHash = 'QmTestMetadataCidHash';

  before(async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(provider.wallet.publicKey, web3.LAMPORTS_PER_SOL),
      'confirmed'
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(issuerKeypair.publicKey, web3.LAMPORTS_PER_SOL),
      'confirmed'
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(unauthorizedKeypair.publicKey, web3.LAMPORTS_PER_SOL),
      'confirmed'
    );
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(holderKeypair.publicKey, web3.LAMPORTS_PER_SOL),
      'confirmed'
    );

    const [issuerAccount, issuerBump] = await web3.PublicKey.findProgramAddress(
      issuerPdaSeeds,
      program.programId
    );
    issuerPda = issuerAccount;
  });

  it('initializes issuer profile successfully', async () => {
    const tx = await program.methods
      .initializeIssuer('Certicheck Issuer', metadataUri)
      .accounts({
        issuer: issuerPda,
        authority: issuerKeypair.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([issuerKeypair])
      .rpc();

    assert.ok(tx);

    const issuerAccount = await program.account.issuerProfile.fetch(issuerPda) as any;
    assert.equal(issuerAccount.authority.toBase58(), issuerKeypair.publicKey.toBase58());
    assert.equal(issuerAccount.name, 'Certicheck Issuer');
    assert.equal(issuerAccount.metadataUri, metadataUri);
    assert.equal(issuerAccount.isActive, true);
    assert.equal(issuerAccount.certCount.toNumber(), 0);
  });

  it('rejects issuance from unauthorized wallet', async () => {
    const badCertificatePda = await web3.PublicKey.findProgramAddress(
      [Buffer.from('certificate'), issuerPda.toBuffer(), Buffer.from(certId)],
      program.programId
    );

    let rejection: Error | null = null;
    try {
      await program.methods
        .issueCertificate(certId, holderName, certType, metadataUri, metadataHash)
        .accounts({
          issuer: issuerPda,
          holder: holderKeypair.publicKey,
          certificate: badCertificatePda[0],
          authority: unauthorizedKeypair.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([unauthorizedKeypair])
        .rpc();
    } catch (err: any) {
      rejection = err;
    }
    assert.ok(rejection, 'Unauthorized issuance should have thrown');
    assert.equal(await program.account.certificateAccount.fetchNullable(badCertificatePda[0]), null);
  });

  it('issues a certificate successfully and records CID/hash', async () => {
    const [certificateAccount, certificateBump] = await web3.PublicKey.findProgramAddress(
      [Buffer.from('certificate'), issuerPda.toBuffer(), Buffer.from(certId)],
      program.programId
    );
    certificatePda = certificateAccount;

    const tx = await program.methods
      .issueCertificate(certId, holderName, certType, metadataUri, metadataHash)
      .accounts({
        issuer: issuerPda,
        holder: holderKeypair.publicKey,
        certificate: certificatePda,
        authority: issuerKeypair.publicKey,
        systemProgram: web3.SystemProgram.programId,
      })
      .signers([issuerKeypair])
      .rpc();

    assert.ok(tx);

    const certAccount = await program.account.certificateAccount.fetch(certificatePda) as any;
    assert.equal(certAccount.issuer.toBase58(), issuerPda.toBase58());
    assert.equal(certAccount.holder.toBase58(), holderKeypair.publicKey.toBase58());
    assert.equal(certAccount.certId, certId);
    assert.equal(certAccount.holderName, holderName);
    assert.equal(certAccount.certType, certType);
    assert.equal(certAccount.metadataUri, metadataUri);
    assert.equal(certAccount.metadataHash, metadataHash);
    assert.equal(certAccount.status, 0);
    assert.equal(Number(certAccount.revokedAt), 0);
  });

  it('rejects certificate fields that exceed their allocated account bounds', async () => {
    const oversizedCertId = 'CERT-ANCHOR-BOUND';
    const [oversizedCertificatePda] = await web3.PublicKey.findProgramAddress(
      [Buffer.from('certificate'), issuerPda.toBuffer(), Buffer.from(oversizedCertId)],
      program.programId
    );

    let rejection: Error | null = null;
    try {
      await program.methods
        .issueCertificate(oversizedCertId, 'H'.repeat(129), certType, metadataUri, metadataHash)
        .accounts({
          issuer: issuerPda,
          holder: holderKeypair.publicKey,
          certificate: oversizedCertificatePda,
          authority: issuerKeypair.publicKey,
          systemProgram: web3.SystemProgram.programId,
        })
        .signers([issuerKeypair])
        .rpc();
    } catch (err: any) {
      rejection = err;
    }
    assert.ok(rejection, 'Oversized holder names must be rejected');
    assert.include(rejection.message, 'Holder name cannot exceed 128 bytes');
  });

  it('rejects revocation by a wallet other than the issuer authority', async () => {
    let rejection: Error | null = null;
    try {
      await program.methods
        .revokeCertificate('Unauthorized revocation')
        .accounts({
          certificate: certificatePda,
          issuer: issuerPda,
          authority: unauthorizedKeypair.publicKey,
        })
        .signers([unauthorizedKeypair])
        .rpc();
    } catch (err: any) {
      rejection = err;
    }
    assert.ok(rejection, 'An unauthorized wallet must not revoke a certificate');

    const certAccount = await program.account.certificateAccount.fetch(certificatePda) as any;
    assert.equal(certAccount.status, 0);
  });

  it('revokes the certificate and updates status', async () => {
    const tx = await program.methods
      .revokeCertificate("Integration test revocation")
      .accounts({
        certificate: certificatePda,
        issuer: issuerPda,
        authority: issuerKeypair.publicKey,
      })
      .signers([issuerKeypair])
      .rpc();

    assert.ok(tx);

    const certAccount = await program.account.certificateAccount.fetch(certificatePda) as any;
    assert.equal(certAccount.status, 1);
    assert.equal(certAccount.revokeReason, 'Integration test revocation');
    assert.equal(certAccount.isRevoked, true);
    assert.ok(Number(certAccount.revokedAt) > 0);
  });

  it('derives PDA correctly and fetches account for verification', async () => {
    const [derivedPda] = await web3.PublicKey.findProgramAddress(
      [Buffer.from('certificate'), issuerPda.toBuffer(), Buffer.from(certId)],
      program.programId
    );
    assert.equal(derivedPda.toBase58(), certificatePda.toBase58());

    const fetchedAccount = await program.account.certificateAccount.fetch(derivedPda) as any;
    assert.equal(fetchedAccount.certId, certId);
    assert.equal(fetchedAccount.metadataHash, metadataHash);
  });
});
