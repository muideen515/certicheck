import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import assert from "assert";
import fs from "fs";

describe("certificate_system tests", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // Load IDL and program id from the crate
  const idl = JSON.parse(fs.readFileSync("./idl/certificate_system.json", "utf8"));
  const programId = new PublicKey("BRVpnQ21mUX5Upy5krTN28cjMJdt8rQ4yAFssWMMZSQJ");
  const program = new Program(idl, programId, provider) as Program;

  const issuerName = "Test Issuer";
  const issuerUri = "https://example.com/issuer.json";
  const certId = "TEST-CERT-1";
  const holderName = "Alice Holder";

  it("Initializes issuer and issues certificate by authorized issuer", async () => {
    // Derive issuer PDA
    const [issuerPda] = await PublicKey.findProgramAddress(
      [Buffer.from("issuer"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    // Initialize issuer
    await program.methods
      .initializeIssuer(issuerName, issuerUri)
      .accounts({
        issuer: issuerPda,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Derive certificate PDA
    const [certificatePda] = await PublicKey.findProgramAddress(
      [Buffer.from("certificate"), issuerPda.toBuffer(), Buffer.from(certId)],
      program.programId
    );

    // Use a generated holder pubkey
    const holder = Keypair.generate();

    // Issue certificate
    await program.methods
      .issueCertificate(certId, holderName, "TestType", "https://meta.example/c.json", "hash123")
      .accounts({
        issuer: issuerPda,
        holder: holder.publicKey,
        certificate: certificatePda,
        authority: provider.wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // Fetch certificate account and assert fields
    const certAccount: any = await program.account.certificateAccount.fetch(certificatePda);
    assert.strictEqual(certAccount.certId, certId);
    assert.strictEqual(certAccount.holderName, holderName);
    assert.strictEqual(certAccount.isRevoked, false);
  });

  it("Rejects issuance by unauthorized wallet", async () => {
    // Derive issuer PDA again
    const [issuerPda] = await PublicKey.findProgramAddress(
      [Buffer.from("issuer"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    const badSigner = Keypair.generate();
    // Airdrop some SOL for rent/fees
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(badSigner.publicKey, 2 * anchor.web3.LAMPORTS_PER_SOL)
    );

    const badCertId = "BAD-CERT-1";
    const [badCertPda] = await PublicKey.findProgramAddress(
      [Buffer.from("certificate"), issuerPda.toBuffer(), Buffer.from(badCertId)],
      program.programId
    );

    let threw = false;
    try {
      await program.methods
        .issueCertificate(badCertId, "Eve", "TestType", "uri", "h")
        .accounts({
          issuer: issuerPda,
          holder: badSigner.publicKey,
          certificate: badCertPda,
          authority: badSigner.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([badSigner])
        .rpc();
    } catch (err) {
      threw = true;
    }
    assert.strictEqual(threw, true, "Unauthorized issuance should have thrown an error");
  });

  it("Revokes certificate and updates status", async () => {
    // Derive issuer and certificate PDAs
    const [issuerPda] = await PublicKey.findProgramAddress(
      [Buffer.from("issuer"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );
    const [certificatePda] = await PublicKey.findProgramAddress(
      [Buffer.from("certificate"), issuerPda.toBuffer(), Buffer.from(certId)],
      program.programId
    );

    // Revoke
    await program.methods
      .revokeCertificate("Test revoke reason")
      .accounts({
        certificate: certificatePda,
        issuer: issuerPda,
        authority: provider.wallet.publicKey,
      })
      .rpc();

    const certAccount: any = await program.account.certificateAccount.fetch(certificatePda);
    assert.strictEqual(certAccount.isRevoked, true);
    assert.strictEqual(certAccount.revokeReason, "Test revoke reason");
  });

  it("Derives PDAs correctly and can fetch issuer account for verification", async () => {
    const [issuerPda, issuerBump] = await PublicKey.findProgramAddress(
      [Buffer.from("issuer"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    const issuerAcc: any = await program.account.issuerProfile.fetch(issuerPda);
    assert.strictEqual(issuerAcc.name, issuerName);
    assert.strictEqual(issuerAcc.isActive, true);
    assert.strictEqual(issuerAcc.authority.toBase58(), provider.wallet.publicKey.toBase58());
  });
});
import * as anchor from '@coral-xyz/anchor';
import { Program, web3 } from '@coral-xyz/anchor';
import { assert } from 'chai';

describe('certificate_system', () => {
  const provider = anchor.AnchorProvider.local(undefined, {
    commitment: 'confirmed',
  });
  anchor.setProvider(provider);

  const program = anchor.workspace.CertiCheck as Program<any>;

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
    // fund test wallets from local validator airdrop
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
      assert.fail('Unauthorized issuance should have thrown');
    } catch (err: any) {
      assert.include(err.message, 'A raw constraint was violated');
    }
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
    assert.equal(certAccount.isRevoked, false);
    assert.isNull(certAccount.revokedAt);
  });

  it('revokes the certificate and updates status', async () => {
    const reason = 'Credential revoked for testing';
    const tx = await program.methods
      .revokeCertificate(reason)
      .accounts({
        certificate: certificatePda,
        issuer: issuerPda,
        authority: issuerKeypair.publicKey,
      })
      .signers([issuerKeypair])
      .rpc();

    assert.ok(tx);

    const certAccount = await program.account.certificateAccount.fetch(certificatePda) as any;
    assert.equal(certAccount.isRevoked, true);
    assert.equal(certAccount.revokeReason, reason);
    assert.isNotNull(certAccount.revokedAt);
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
