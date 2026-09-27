const nodemailer = require('nodemailer');

// Email service for sending OTPs and notification emails
class EmailService {
  static transporter = null;
  static memoryStore = new Map(); // For testing and development reference

  /**
   * Validate email address syntax according to RFC standards
   * @param {string} email 
   * @returns {boolean}
   */
  static isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    const clean = email.trim().toLowerCase();
    const re = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    if (!re.test(clean)) return false;
    const parts = clean.split('@');
    if (parts.length !== 2) return false;
    const domain = parts[1];
    if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) return false;
    return true;
  }

  static initTransporter() {
    if (this.transporter) return;

    const emailPassword = String(process.env.EMAIL_PASSWORD || '').replace(/\s+/g, '');

    // 1. Custom SMTP configuration
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      console.log(`✓ EmailService: Using custom SMTP (${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587})`);
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      return;
    }

    // 2. Pre-configured email service (e.g. Gmail)
    if (process.env.EMAIL_USER && emailPassword) {
      console.log(`✓ EmailService: Using ${process.env.EMAIL_SERVICE || 'gmail'} with user ${process.env.EMAIL_USER}`);
      this.transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: emailPassword
        }
      });
      return;
    }

    if (process.env.NODE_ENV === 'production') {
      throw new Error('Email delivery is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS.');
    }

    // Development mode - log prominently to console
    console.log('ℹ EmailService: No live SMTP credentials found; running in development console mode.');
    this.transporter = {
      sendMail: async (options) => {
        console.log('\n┌─────────────────────────────────────────────────────────────┐');
        console.log('│ 📧 EMAIL DISPATCHED (Development / Test Mode)               │');
        console.log(`│ To:      ${options.to.padEnd(50)} │`);
        console.log(`│ Subject: ${options.subject.padEnd(50)} │`);
        if (options.otpCode) {
          console.log(`│ OTP:     ${options.otpCode.padEnd(50)} │`);
        }
        console.log('└─────────────────────────────────────────────────────────────┘\n');
        return { response: 'logged to console', messageId: `dev-${Date.now()}` };
      }
    };
  }

  static getConfigurationStatus() {
    const hasCustomSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    const hasEmailService = Boolean(process.env.EMAIL_USER && process.env.EMAIL_PASSWORD);
    return {
      mode: hasCustomSmtp || hasEmailService ? 'smtp' : 'console',
      provider: hasCustomSmtp ? 'custom-smtp' : hasEmailService ? (process.env.EMAIL_SERVICE || 'gmail') : 'console',
      sender: process.env.EMAIL_FROM || process.env.EMAIL_USER || null
    };
  }

  static getFromAddress() {
    return process.env.EMAIL_FROM || process.env.EMAIL_USER || 'CertiCheck <noreply@certicheck.com>';
  }

  static async sendOTP(email, otp, otpType = 'signup') {
    this.initTransporter();

    const normalizedEmail = String(email || '').trim().toLowerCase();
    this.memoryStore.set(normalizedEmail, { otp, type: otpType, sentAt: new Date() });

    const subject = otpType === 'forgot_password' 
      ? 'Password Reset OTP - CertiCheck' 
      : 'Email Verification OTP - CertiCheck';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f0f4f8; padding: 24px; border-radius: 12px; border: 1px solid #e2e8f0;">
          <h2 style="color: #4f46e5; margin-top: 0; margin-bottom: 16px;">
            ${otpType === 'forgot_password' ? 'Reset Your Password' : 'Verify Your Email'}
          </h2>
          
          <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
            ${otpType === 'forgot_password' 
              ? 'We received a request to reset your password. Use the code below to proceed:' 
              : 'Welcome to CertiCheck! Please verify your email using the one-time password below to complete your registration:'}
          </p>
          
          <div style="background-color: white; padding: 24px; border-radius: 8px; margin: 24px 0; text-align: center; border: 2px solid #6366f1;">
            <p style="margin: 0; font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;">Verification Code (OTP)</p>
            <p style="margin: 12px 0 0 0; font-size: 36px; font-weight: 800; color: #1e1b4b; letter-spacing: 8px; font-family: monospace;">
              ${otp}
            </p>
          </div>
          
          <p style="color: #64748b; font-size: 13px; margin: 16px 0;">
            This code will expire in <strong>10 minutes</strong>. If you did not make this request, you can safely ignore this email.
          </p>
          
          <hr style="border: none; border-top: 1px solid #cbd5e1; margin: 20px 0;">
          
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            CertiCheck — Decentralised Academic & Professional Credentials on Solana
          </p>
        </div>
      </div>
    `;

    try {
      const info = await this.transporter.sendMail({
        from: this.getFromAddress(),
        to: normalizedEmail,
        subject,
        html,
        otpCode: otp
      });

      return { success: true, info };
    } catch (err) {
      console.error('Error sending OTP email:', err);
      throw err;
    }
  }

  static async sendWelcome(email, firstName) {
    this.initTransporter();

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f0f4f8; padding: 24px; border-radius: 12px;">
          <h2 style="color: #4f46e5; margin-top: 0;">
            Welcome to CertiCheck, ${firstName || 'there'}!
          </h2>
          <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
            Your account is now verified and active. You are ready to issue, manage, and verify tamper-proof credentials on the Solana blockchain.
          </p>
        </div>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: this.getFromAddress(),
        to: normalizedEmail,
        subject: 'Welcome to CertiCheck',
        html
      });
    } catch (err) {
      console.error('Error sending welcome email:', err);
    }
  }

  static async sendApplicationReceived(email, applicantName, organizationName) {
    this.initTransporter();

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#f0f4f8;padding:24px;border-radius:12px;border:1px solid #e2e8f0;">
          <h2 style="color:#4f46e5;margin-top:0;">Application received</h2>
          <p style="color:#4b5563;font-size:15px;line-height:1.6;">Hello ${applicantName || 'there'},</p>
          <p style="color:#4b5563;font-size:15px;line-height:1.6;">We received your issuer application for <strong>${organizationName || 'your institution'}</strong>.</p>
          <p style="color:#4b5563;font-size:15px;line-height:1.6;">Our team will review it and email you when a decision has been made.</p>
          <p style="color:#94a3b8;font-size:12px;">CertiCheck — Decentralised Academic &amp; Professional Credentials on Solana</p>
        </div>
      </div>
    `;

    try {
      return await this.transporter.sendMail({
        from: this.getFromAddress(),
        to: normalizedEmail,
        subject: 'We received your CertiCheck issuer application',
        html
      });
    } catch (err) {
      console.error('Error sending application received email:', err);
      return null;
    }
  }

  static async sendApplicationDecision(email, applicantName, organizationName, approved, reason = '') {
    this.initTransporter();

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const decision = approved ? 'approved' : 'not approved';
    const subject = approved
      ? 'Your CertiCheck issuer application was approved'
      : 'Update on your CertiCheck issuer application';
    const reasonMarkup = reason
      ? `<p style="color:#4b5563;font-size:15px;line-height:1.6;"><strong>Reason:</strong> ${String(reason)}</p>`
      : '';
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#f0f4f8;padding:24px;border-radius:12px;border:1px solid #e2e8f0;">
          <h2 style="color:#4f46e5;margin-top:0;">Issuer application ${decision}</h2>
          <p style="color:#4b5563;font-size:15px;line-height:1.6;">Hello ${applicantName || 'there'},</p>
          <p style="color:#4b5563;font-size:15px;line-height:1.6;">Your issuer application for <strong>${organizationName || 'your institution'}</strong> has been <strong>${decision}</strong>.</p>
          ${reasonMarkup}
          ${approved ? '<p style="color:#4b5563;font-size:15px;line-height:1.6;">You can now sign in and access the issuer dashboard.</p>' : '<p style="color:#4b5563;font-size:15px;line-height:1.6;">You may contact the CertiCheck team if you need more information.</p>'}
          <p style="color:#94a3b8;font-size:12px;">CertiCheck — Decentralised Academic &amp; Professional Credentials on Solana</p>
        </div>
      </div>
    `;

    try {
      return await this.transporter.sendMail({
        from: this.getFromAddress(),
        to: normalizedEmail,
        subject,
        html
      });
    } catch (err) {
      console.error('Error sending application decision email:', err);
      return null;
    }
  }

  static async sendCertificateIssued({ holderEmail, holderName, certificateId, certificateType, issuerName, issuerWallet, issuedAt, ipfsCid, blockchainTransactionId, metadata = {} }) {
    const to = String(holderEmail || '').trim().toLowerCase();
    if (!this.isValidEmail(to)) return { success: false, sent: false, error: 'A valid holder email is required' };

    const escapeHtml = value => String(value ?? '—').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
    const metadataRows = Object.entries(metadata && typeof metadata === 'object' ? metadata : {})
      .filter(([key, value]) => !['attachment', 'media', 'dataUrl', 'imageData', 'generatedBy'].includes(key) && (value === null || ['string', 'number', 'boolean'].includes(typeof value)))
      .slice(0, 16)
      .map(([key, value]) => `<tr><th style="padding:7px 10px;text-align:left;color:#475569;border-bottom:1px solid #e2e8f0">${escapeHtml(key.replace(/([A-Z])/g, ' $1'))}</th><td style="padding:7px 10px;color:#0f172a;border-bottom:1px solid #e2e8f0">${escapeHtml(value)}</td></tr>`)
      .join('');
    const supportingFile = metadata?.attachment;
    const attachmentMatch = typeof supportingFile?.dataUrl === 'string'
      ? supportingFile.dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/)
      : null;
    const attachments = attachmentMatch && supportingFile?.name
      ? [{
          filename: String(supportingFile.name).replace(/[^a-zA-Z0-9._ -]/g, '_'),
          content: Buffer.from(attachmentMatch[2], 'base64'),
          contentType: String(supportingFile.type || attachmentMatch[1]).replace(/[^a-zA-Z0-9!#$&^_.+-/]/g, '')
        }]
      : [];
    const subject = `Certificate issued: ${String(certificateType || 'Certificate')}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#0f172a;line-height:1.55">
        <div style="padding:24px;border:1px solid #dbe3ef;border-radius:14px;background:#fff">
          <h2 style="margin:0 0 8px;color:#312e81">Your certificate has been issued</h2>
          <p>Hello ${escapeHtml(holderName)},</p>
          <p>${escapeHtml(issuerName)} has issued you a ${escapeHtml(certificateType)} certificate.</p>
          <table style="width:100%;border-collapse:collapse;margin:18px 0">
            <tr><th style="padding:7px 10px;text-align:left;color:#475569;border-bottom:1px solid #e2e8f0">Certificate ID</th><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">${escapeHtml(certificateId)}</td></tr>
            <tr><th style="padding:7px 10px;text-align:left;color:#475569;border-bottom:1px solid #e2e8f0">Type</th><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">${escapeHtml(certificateType)}</td></tr>
            <tr><th style="padding:7px 10px;text-align:left;color:#475569;border-bottom:1px solid #e2e8f0">Issuer</th><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">${escapeHtml(issuerName)}</td></tr>
            <tr><th style="padding:7px 10px;text-align:left;color:#475569;border-bottom:1px solid #e2e8f0">Issued</th><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">${escapeHtml(issuedAt)}</td></tr>
            ${issuerWallet ? `<tr><th style="padding:7px 10px;text-align:left;color:#475569;border-bottom:1px solid #e2e8f0">Issuer wallet</th><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">${escapeHtml(issuerWallet)}</td></tr>` : ''}
            ${ipfsCid ? `<tr><th style="padding:7px 10px;text-align:left;color:#475569;border-bottom:1px solid #e2e8f0">IPFS record</th><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">${escapeHtml(ipfsCid)}</td></tr>` : ''}
            ${blockchainTransactionId ? `<tr><th style="padding:7px 10px;text-align:left;color:#475569;border-bottom:1px solid #e2e8f0">Transaction</th><td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">${escapeHtml(blockchainTransactionId)}</td></tr>` : ''}
            ${metadataRows}
          </table>
          ${attachments.length ? `<p>The supporting file <strong>${escapeHtml(attachments[0].filename)}</strong> is attached to this email and included with the certificate record.</p>` : ''}
          <div style="padding:14px;background:#f1f5f9;border-radius:10px">
            <strong>Important information</strong>
            <ul style="margin:8px 0 0;padding-left:20px">
              <li>This email confirms issuance; check the certificate status on Certicheck before relying on it.</li>
              <li>The issuer may revoke a certificate. A revoked certificate will no longer show as valid.</li>
              <li>Keep the certificate ID with your records and do not alter the issued certificate or supporting file.</li>
            </ul>
          </div>
          <p style="margin:18px 0 0;color:#64748b;font-size:12px">Certicheck certificate notification</p>
        </div>
      </div>
    `;

    try {
      this.initTransporter();
      await this.transporter.sendMail({ from: this.getFromAddress(), to, subject, html, attachments });
      const mode = this.getConfigurationStatus().mode;
      return { success: true, sent: mode === 'smtp', mode };
    } catch (err) {
      console.error('Error sending certificate notification:', err.message || err);
      return { success: false, sent: false, mode: 'error', error: err.message || 'Email delivery failed' };
    }
  }

  static getLastSentOTP(email) {
    const normalized = String(email || '').trim().toLowerCase();
    return this.memoryStore.get(normalized) || null;
  }
}

module.exports = EmailService;
