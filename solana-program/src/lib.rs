use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod certi_check {
    use super::*;

    pub fn initialize_issuer(ctx: Context<InitializeIssuer>, name: String, uri: String) -> Result<()> {
        let issuer = &mut ctx.accounts.issuer;
        issuer.authority = ctx.accounts.authority.key();
        issuer.name = name;
        issuer.metadata_uri = uri;
        issuer.is_active = true;
        issuer.cert_count = 0;
        issuer.bump = *ctx.bumps.get("issuer").unwrap();
        Ok(())
    }

    pub fn issue_certificate(
        ctx: Context<IssueCertificate>,
        cert_id: String,
        holder_name: String,
        cert_type: String,
        metadata_uri: String,
        metadata_hash: String,
    ) -> Result<()> {
        let issuer = &ctx.accounts.issuer;
        require!(issuer.is_active, ErrorCode::InactiveIssuer);

        let cert = &mut ctx.accounts.certificate;
        cert.issuer = issuer.key();
        cert.holder = ctx.accounts.holder.key();
        cert.cert_id = cert_id.clone();
        cert.holder_name = holder_name;
        cert.cert_type = cert_type;
        cert.metadata_uri = metadata_uri;
        cert.metadata_hash = metadata_hash;
        cert.is_revoked = false;
        cert.revoke_reason = String::new();
        cert.issued_at = Clock::get()?.unix_timestamp;
        cert.revoked_at = None;
        cert.bump = *ctx.bumps.get("certificate").unwrap();

        let issuer = &mut ctx.accounts.issuer;
        issuer.cert_count = issuer.cert_count.checked_add(1).unwrap_or(issuer.cert_count);
        Ok(())
    }

    pub fn revoke_certificate(ctx: Context<RevokeCertificate>, reason: String) -> Result<()> {
        let issuer = &ctx.accounts.issuer;
        require!(issuer.is_active, ErrorCode::InactiveIssuer);
        let cert = &mut ctx.accounts.certificate;
        require!(cert.issuer == issuer.key(), ErrorCode::UnauthorizedRevocation);
        require!(!cert.is_revoked, ErrorCode::AlreadyRevoked);

        cert.is_revoked = true;
        cert.revoke_reason = reason;
        cert.revoked_at = Some(Clock::get()?.unix_timestamp);
        Ok(())
    }
}

#[account]
pub struct IssuerProfile {
    pub authority: Pubkey,
    pub name: String,
    pub metadata_uri: String,
    pub cert_count: u64,
    pub is_active: bool,
    pub bump: u8,
}

#[account]
pub struct CertificateAccount {
    pub issuer: Pubkey,
    pub holder: Pubkey,
    pub cert_id: String,
    pub holder_name: String,
    pub cert_type: String,
    pub metadata_uri: String,
    pub metadata_hash: String,
    pub is_revoked: bool,
    pub revoke_reason: String,
    pub issued_at: i64,
    pub revoked_at: Option<i64>,
    pub bump: u8,
}

#[derive(Accounts)]
pub struct InitializeIssuer<'info> {
    #[account(
        init,
        payer = authority,
        seeds = [b"issuer", authority.key().as_ref()],
        bump,
        space = 8 + 32 + 4 + 128 + 4 + 200 + 8 + 1 + 1,
    )]
    pub issuer: Account<'info, IssuerProfile>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(cert_id: String, holder_name: String, cert_type: String, metadata_uri: String, metadata_hash: String)]
pub struct IssueCertificate<'info> {
    #[account(mut, has_one = authority)]
    pub issuer: Account<'info, IssuerProfile>,
    /// CHECK: holder public key is recorded but does not need to sign for issuance
    pub holder: AccountInfo<'info>,
    #[account(
        init,
        payer = authority,
        seeds = [b"certificate", issuer.key().as_ref(), cert_id.as_bytes()],
        bump,
        space = 8 + 32 + 32 + 4 + 256 + 4 + 128 + 4 + 128 + 4 + 200 + 4 + 128 + 1 + 4 + 256 + 1 + 8 + 1,
    )]
    pub certificate: Account<'info, CertificateAccount>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(reason: String)]
pub struct RevokeCertificate<'info> {
    #[account(mut, has_one = issuer)]
    pub certificate: Account<'info, CertificateAccount>,
    #[account(mut, has_one = authority)]
    pub issuer: Account<'info, IssuerProfile>,
    #[account(mut)]
    pub authority: Signer<'info>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Certificate is already revoked")]
    AlreadyRevoked,
    #[msg("Issuer account is not active")]
    InactiveIssuer,
    #[msg("Only the issuing authority can revoke this certificate")]
    UnauthorizedRevocation,
}
