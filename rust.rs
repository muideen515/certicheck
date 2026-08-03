/*
 * Certichain— lib.rs
 * ═══════════════════════════════════════════════════════════════════
 * Solana on-chain program (Anchor framework) for:
 *   ✦ Issuing verifiable certificates
 *   ✦ Revoking certificates
 *   ✦ Transferring certificates to a holder's wallet
 *   ✦ Emitting events for off-chain indexing
 *
 * Deploy:
 *   anchor build
 *   anchor deploy --provider.cluster mainnet-beta
 *
 * Program ID: replace CERTI_CHAIN_PROGRAM_ID below before deploying.
 * ═══════════════════════════════════════════════════════════════════
 */

use anchor_lang::prelude::*;

// ── Program ID ──────────────────────────────────────────────────────
// Replace with your deployed program address.
declare_id!("CertichainXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");

// ── Constants ────────────────────────────────────────────────────────
/// Maximum byte length for a metadata URI (IPFS / Arweave link).
const MAX_URI_LEN: usize = 200;
/// Maximum byte length for the certificate type string.
const MAX_TYPE_LEN: usize = 64;
/// Maximum byte length for the holder's display name.
const MAX_NAME_LEN: usize = 128;
/// Seed prefix for every Certificate PDA.
const CERT_SEED: &[u8] = b"cert";

// ════════════════════════════════════════════════════════════════════
//  PROGRAM
// ════════════════════════════════════════════════════════════════════
#[program]
pub mod certi_check {
    use super::*;

    // ── Instruction: initialise_issuer ──────────────────────────────
    /// Creates an IssuerProfile PDA for a new verified issuer.
    /// Must be signed by the platform authority (multisig in production).
    pub fn initialise_issuer(
        ctx:  Context<InitialiseIssuer>,
        name: String,
        uri:  String,
    ) -> Result<()> {
        require!(name.len() <= MAX_NAME_LEN, CertError::NameTooLong);
        require!(uri.len()  <= MAX_URI_LEN,  CertError::UriTooLong);

        let profile        = &mut ctx.accounts.issuer_profile;
        profile.authority  = ctx.accounts.authority.key();
        profile.issuer     = ctx.accounts.issuer.key();
        profile.name       = name.clone();
        profile.metadata_uri = uri;
        profile.cert_count = 0;
        profile.is_active  = true;
        profile.created_at = Clock::get()?.unix_timestamp;
        profile.bump       = ctx.bumps.issuer_profile;

        emit!(IssuerRegistered {
            issuer:     profile.issuer,
            name:       name,
            created_at: profile.created_at,
        });

        msg!("Issuer registered: {}", profile.issuer);
        Ok(())
    }

    // ── Instruction: issue_certificate ─────────────────────────────
    /// Mints a new certificate on-chain.
    /// The certificate is stored as a PDA derived from (issuer, cert_id).
    pub fn issue_certificate(
        ctx:    Context<IssueCertificate>,
        params: IssueCertParams,
    ) -> Result<()> {
        // Validate inputs
        require!(params.cert_id.len() > 0,          CertError::InvalidCertId);
        require!(params.metadata_uri.len() <= MAX_URI_LEN,  CertError::UriTooLong);
        require!(params.cert_type.len()    <= MAX_TYPE_LEN, CertError::TypeTooLong);
        require!(params.holder_name.len()  <= MAX_NAME_LEN, CertError::NameTooLong);

        let issuer_profile = &mut ctx.accounts.issuer_profile;
        require!(issuer_profile.is_active, CertError::IssuerSuspended);

        let cert                = &mut ctx.accounts.certificate;
        cert.issuer             = ctx.accounts.issuer.key();
        cert.holder             = ctx.accounts.holder.key();
        cert.holder_name        = params.holder_name.clone();
        cert.cert_id            = params.cert_id.clone();
        cert.cert_type          = params.cert_type.clone();
        cert.metadata_uri       = params.metadata_uri.clone();
        cert.issued_at          = Clock::get()?.unix_timestamp;
        cert.expiry_at          = params.expiry_at;
        cert.is_revoked         = false;
        cert.revocation_reason  = String::new();
        cert.bump               = ctx.bumps.certificate;

        // Increment issuer's certificate counter
        issuer_profile.cert_count = issuer_profile
            .cert_count
            .checked_add(1)
            .ok_or(CertError::Overflow)?;

        emit!(CertificateIssued {
            cert_id:     params.cert_id,
            issuer:      cert.issuer,
            holder:      cert.holder,
            holder_name: params.holder_name,
            cert_type:   params.cert_type,
            issued_at:   cert.issued_at,
        });

        msg!("Certificate issued: {} → {}", cert.cert_id, cert.holder);
        Ok(())
    }

    // ── Instruction: revoke_certificate ────────────────────────────
    /// Marks a certificate as revoked.  Only the original issuer may revoke.
    pub fn revoke_certificate(
        ctx:    Context<RevokeCertificate>,
        reason: String,
    ) -> Result<()> {
        let cert = &mut ctx.accounts.certificate;

        require!(!cert.is_revoked,                          CertError::AlreadyRevoked);
        require!(cert.issuer == ctx.accounts.issuer.key(), CertError::Unauthorized);
        require!(reason.len() <= 256,                       CertError::ReasonTooLong);

        cert.is_revoked        = true;
        cert.revocation_reason = reason.clone();

        emit!(CertificateRevoked {
            cert_id:    cert.cert_id.clone(),
            issuer:     cert.issuer,
            holder:     cert.holder,
            reason:     reason,
            revoked_at: Clock::get()?.unix_timestamp,
        });

        msg!("Certificate revoked: {}", cert.cert_id);
        Ok(())
    }

    // ── Instruction: transfer_certificate ──────────────────────────
    /// Transfers custodianship of a certificate to a new wallet.
    /// The holder must sign; the on-chain record is updated.
    pub fn transfer_certificate(
        ctx: Context<TransferCertificate>,
    ) -> Result<()> {
        let cert = &mut ctx.accounts.certificate;

        require!(!cert.is_revoked,                          CertError::CertRevoked);
        require!(cert.holder == ctx.accounts.holder.key(), CertError::Unauthorized);

        let old_holder   = cert.holder;
        cert.holder      = ctx.accounts.new_holder.key();

        emit!(CertificateTransferred {
            cert_id:    cert.cert_id.clone(),
            from:       old_holder,
            to:         cert.holder,
            at:         Clock::get()?.unix_timestamp,
        });

        msg!("Certificate {} transferred: {} → {}", cert.cert_id, old_holder, cert.holder);
        Ok(())
    }

    // ── Instruction: suspend_issuer ─────────────────────────────────
    /// Platform authority can suspend a misbehaving issuer.
    pub fn suspend_issuer(ctx: Context<SuspendIssuer>) -> Result<()> {
        let profile       = &mut ctx.accounts.issuer_profile;
        profile.is_active = false;

        emit!(IssuerSuspended {
            issuer:       profile.issuer,
            suspended_at: Clock::get()?.unix_timestamp,
        });

        msg!("Issuer suspended: {}", profile.issuer);
        Ok(())
    }
}

// ════════════════════════════════════════════════════════════════════
//  ACCOUNT STRUCTS
// ════════════════════════════════════════════════════════════════════

/// Persisted profile for each registered issuer.
#[account]
pub struct IssuerProfile {
    pub authority:    Pubkey,   // Platform authority that approved this issuer
    pub issuer:       Pubkey,   // Issuer's wallet / signing key
    pub name:         String,   // Human-readable institution name
    pub metadata_uri: String,   // URI to off-chain metadata (logo, description)
    pub cert_count:   u64,      // Running total of certificates issued
    pub is_active:    bool,     // false = suspended
    pub created_at:   i64,      // Unix timestamp of registration
    pub bump:         u8,       // PDA bump seed
}

impl IssuerProfile {
    pub const LEN: usize = 8          // discriminator
        + 32 + 32                      // authority + issuer
        + 4 + MAX_NAME_LEN            // name
        + 4 + MAX_URI_LEN             // metadata_uri
        + 8                            // cert_count
        + 1                            // is_active
        + 8                            // created_at
        + 1;                           // bump
}

/// On-chain certificate record.
#[account]
pub struct Certificate {
    pub issuer:            Pubkey,  // Issuing institution's wallet
    pub holder:            Pubkey,  // Current certificate holder's wallet
    pub holder_name:       String,  // Display name at time of issuance
    pub cert_id:           String,  // Human-readable unique ID (e.g. CERT-SOL-2024-00418)
    pub cert_type:         String,  // e.g. "Bachelor of Science", "Professional Certificate"
    pub metadata_uri:      String,  // IPFS / Arweave link to full credential JSON
    pub issued_at:         i64,     // Unix timestamp
    pub expiry_at:         Option<i64>, // Optional expiry timestamp
    pub is_revoked:        bool,
    pub revocation_reason: String,
    pub bump:              u8,
}

impl Certificate {
    pub const LEN: usize = 8
        + 32 + 32                      // issuer + holder
        + 4 + MAX_NAME_LEN            // holder_name
        + 4 + 64                       // cert_id (max 64 chars)
        + 4 + MAX_TYPE_LEN            // cert_type
        + 4 + MAX_URI_LEN             // metadata_uri
        + 8                            // issued_at
        + 1 + 8                        // expiry_at (Option<i64>)
        + 1                            // is_revoked
        + 4 + 256                      // revocation_reason
        + 1;                           // bump
}

// ════════════════════════════════════════════════════════════════════
//  INSTRUCTION PARAMS
// ════════════════════════════════════════════════════════════════════
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct IssueCertParams {
    pub cert_id:      String,
    pub holder_name:  String,
    pub cert_type:    String,
    pub metadata_uri: String,
    pub expiry_at:    Option<i64>,
}

// ════════════════════════════════════════════════════════════════════
//  ACCOUNT VALIDATION CONTEXTS
// ════════════════════════════════════════════════════════════════════

#[derive(Accounts)]
#[instruction(name: String, uri: String)]
pub struct InitialiseIssuer<'info> {
    #[account(
        init,
        payer  = authority,
        space  = IssuerProfile::LEN,
        seeds  = [b"issuer", issuer.key().as_ref()],
        bump
    )]
    pub issuer_profile: Account<'info, IssuerProfile>,

    /// Platform authority (multisig in production)
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The issuer's wallet being registered
    /// CHECK: arbitrary wallet, validated via seeds
    pub issuer: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(params: IssueCertParams)]
pub struct IssueCertificate<'info> {
    #[account(
        init,
        payer  = issuer,
        space  = Certificate::LEN,
        seeds  = [CERT_SEED, issuer.key().as_ref(), params.cert_id.as_bytes()],
        bump
    )]
    pub certificate: Account<'info, Certificate>,

    #[account(
        mut,
        seeds  = [b"issuer", issuer.key().as_ref()],
        bump   = issuer_profile.bump,
        has_one = issuer
    )]
    pub issuer_profile: Account<'info, IssuerProfile>,

    /// Issuer signs and pays for the transaction
    #[account(mut)]
    pub issuer: Signer<'info>,

    /// Holder's wallet — does not need to sign
    /// CHECK: holder can be any public key; stored for indexing only
    pub holder: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevokeCertificate<'info> {
    #[account(
        mut,
        seeds  = [CERT_SEED, issuer.key().as_ref(), certificate.cert_id.as_bytes()],
        bump   = certificate.bump,
        has_one = issuer
    )]
    pub certificate: Account<'info, Certificate>,

    #[account(mut)]
    pub issuer: Signer<'info>,
}

#[derive(Accounts)]
pub struct TransferCertificate<'info> {
    #[account(
        mut,
        seeds  = [CERT_SEED, certificate.issuer.as_ref(), certificate.cert_id.as_bytes()],
        bump   = certificate.bump,
        has_one = holder
    )]
    pub certificate: Account<'info, Certificate>,

    #[account(mut)]
    pub holder: Signer<'info>,

    /// CHECK: new owner's public key — any wallet is valid
    pub new_holder: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct SuspendIssuer<'info> {
    #[account(
        mut,
        seeds  = [b"issuer", issuer_profile.issuer.as_ref()],
        bump   = issuer_profile.bump,
        has_one = authority
    )]
    pub issuer_profile: Account<'info, IssuerProfile>,

    /// Must be the platform authority that registered this issuer
    pub authority: Signer<'info>,
}

// ════════════════════════════════════════════════════════════════════
//  EVENTS  (indexed off-chain by NebulaCert backend)
// ════════════════════════════════════════════════════════════════════

#[event]
pub struct IssuerRegistered {
    pub issuer:     Pubkey,
    pub name:       String,
    pub created_at: i64,
}

#[event]
pub struct CertificateIssued {
    pub cert_id:     String,
    pub issuer:      Pubkey,
    pub holder:      Pubkey,
    pub holder_name: String,
    pub cert_type:   String,
    pub issued_at:   i64,
}

#[event]
pub struct CertificateRevoked {
    pub cert_id:    String,
    pub issuer:     Pubkey,
    pub holder:     Pubkey,
    pub reason:     String,
    pub revoked_at: i64,
}

#[event]
pub struct CertificateTransferred {
    pub cert_id: String,
    pub from:    Pubkey,
    pub to:      Pubkey,
    pub at:      i64,
}

#[event]
pub struct IssuerSuspended {
    pub issuer:       Pubkey,
    pub suspended_at: i64,
}

// ════════════════════════════════════════════════════════════════════
//  ERRORS
// ════════════════════════════════════════════════════════════════════
#[error_code]
pub enum CertError {
    #[msg("Caller is not authorised to perform this action.")]
    Unauthorized,

    #[msg("This certificate has already been revoked.")]
    AlreadyRevoked,

    #[msg("Cannot interact with a revoked certificate.")]
    CertRevoked,

    #[msg("Issuer account has been suspended by the platform authority.")]
    IssuerSuspended,

    #[msg("Certificate ID must not be empty.")]
    InvalidCertId,

    #[msg("Metadata URI exceeds the maximum allowed length.")]
    UriTooLong,

    #[msg("Certificate type string exceeds the maximum allowed length.")]
    TypeTooLong,

    #[msg("Name exceeds the maximum allowed length.")]
    NameTooLong,

    #[msg("Revocation reason exceeds 256 characters.")]
    ReasonTooLong,

    #[msg("Arithmetic overflow.")]
    Overflow,
}