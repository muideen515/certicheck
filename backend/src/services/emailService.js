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

    // 1. Custom SMTP configuration
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
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
    if (process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      console.log(`✓ EmailService: Using ${process.env.EMAIL_SERVICE || 'gmail'} with user ${process.env.EMAIL_USER}`);
      this.transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      });
      return;
    }

    // 3. Development mode - log prominently to console
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

  static getLastSentOTP(email) {
    const normalized = String(email || '').trim().toLowerCase();
    return this.memoryStore.get(normalized) || null;
  }
}

module.exports = EmailService;
