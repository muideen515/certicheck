const nodemailer = require('nodemailer');

// Email service for sending OTPs
class EmailService {
  static transporter = null;

  static initTransporter() {
    if (this.transporter) return;

    // For development, use a test account
    if (process.env.NODE_ENV === 'production') {
      this.transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      });
    } else {
      // Development mode - log to console
      this.transporter = {
        sendMail: async (options) => {
          console.log('📧 EMAIL (Development Mode):');
          console.log(`   To: ${options.to}`);
          console.log(`   Subject: ${options.subject}`);
          console.log(`   Body:\n${options.html}`);
          return { response: 'logged to console' };
        }
      };
    }
  }

  static async sendOTP(email, otp, otpType = 'signup') {
    this.initTransporter();

    const subject = otpType === 'forgot_password' 
      ? 'Password Reset OTP - CertiCheck' 
      : 'Email Verification OTP - CertiCheck';

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px;">
          <h2 style="color: #1e1b4b; margin-bottom: 20px;">
            ${otpType === 'forgot_password' ? 'Reset Your Password' : 'Verify Your Email'}
          </h2>
          
          <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
            ${otpType === 'forgot_password' 
              ? 'We received a request to reset your password. Use the code below to proceed:' 
              : 'Welcome to CertiCheck! Please verify your email using the code below:'}
          </p>
          
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; border: 2px solid #e0e6ed;">
            <p style="margin: 0; font-size: 12px; color: #8b92a4; text-transform: uppercase; letter-spacing: 2px;">Verification Code</p>
            <p style="margin: 12px 0 0 0; font-size: 32px; font-weight: bold; color: #1e1b4b; letter-spacing: 4px;">
              ${otp}
            </p>
          </div>
          
          <p style="color: #8b92a4; font-size: 14px; margin: 20px 0;">
            This code expires in <strong>10 minutes</strong>. Do not share this code with anyone.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e0e6ed; margin: 20px 0;">
          
          <p style="color: #8b92a4; font-size: 12px;">
            If you didn't request this, you can safely ignore this email.
          </p>
        </div>
      </div>
    `;

    try {
      const info = await this.transporter.sendMail({
        from: process.env.EMAIL_USER || 'noreply@certicheck.com',
        to: email,
        subject: subject,
        html: html
      });

      console.log(`OTP email sent to ${email}`);
      return { success: true, info };
    } catch (err) {
      console.error('Error sending OTP email:', err);
      throw err;
    }
  }

  static async sendWelcome(email, firstName) {
    this.initTransporter();

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: #f0f4f8; padding: 20px; border-radius: 8px;">
          <h2 style="color: #1e1b4b; margin-bottom: 20px;">
            Welcome to CertiCheck, ${firstName}!
          </h2>
          
          <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
            Your account has been successfully created. You're all set to start issuing certificates on the blockchain.
          </p>
          
          <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
            Next step: Apply for issuer access to get started with certificate management.
          </p>
          
          <div style="margin: 20px 0;">
            <a href="${process.env.APP_URL || 'http://localhost'}" 
               style="display: inline-block; padding: 12px 24px; background-color: #1e1b4b; color: white; text-decoration: none; border-radius: 6px;">
              Get Started
            </a>
          </div>
        </div>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: process.env.EMAIL_USER || 'noreply@certicheck.com',
        to: email,
        subject: 'Welcome to CertiCheck',
        html: html
      });

      console.log(`Welcome email sent to ${email}`);
    } catch (err) {
      console.error('Error sending welcome email:', err);
    }
  }
}

module.exports = EmailService;
