const pool = require('../db/connection');

class OTP {
  static normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  // Generate a random 6-digit OTP
  static generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Create and store OTP for email
  static async create(email, otpType = 'signup') {
    const normalizedEmail = this.normalizeEmail(email);
    try {
      // Invalidate previous OTPs for this email
      await pool.query(
        `UPDATE otp_verification SET is_verified = true 
         WHERE email = $1 AND otp_type = $2 AND is_verified = false AND expires_at > NOW()`,
        [normalizedEmail, otpType]
      );

      const otpCode = this.generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      const result = await pool.query(
        `INSERT INTO otp_verification (email, otp_code, otp_type, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id, otp_code, expires_at`,
        [normalizedEmail, otpCode, otpType, expiresAt]
      );

      return result.rows[0];
    } catch (err) {
      console.error('Error creating OTP:', err);
      throw err;
    }
  }

  // Verify OTP code
  static async verify(email, otpCode, otpType = 'signup') {
    const normalizedEmail = this.normalizeEmail(email);
    try {
      const result = await pool.query(
        `SELECT * FROM otp_verification 
         WHERE email = $1 AND otp_code = $2 AND otp_type = $3 
         AND is_verified = false AND expires_at > NOW()`,
        [normalizedEmail, otpCode, otpType]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const otp = result.rows[0];

      // Check if max attempts exceeded
      if (otp.attempts >= otp.max_attempts) {
        return null;
      }

      // Mark as verified
      await pool.query(
        `UPDATE otp_verification 
         SET is_verified = true, verified_at = NOW()
         WHERE id = $1`,
        [otp.id]
      );

      return otp;
    } catch (err) {
      console.error('Error verifying OTP:', err);
      throw err;
    }
  }

  // Increment attempt count
  static async incrementAttempts(email, otpCode, otpType = 'signup') {
    const normalizedEmail = this.normalizeEmail(email);
    try {
      await pool.query(
        `UPDATE otp_verification 
         SET attempts = attempts + 1
         WHERE email = $1 AND otp_code = $2 AND otp_type = $3 
         AND is_verified = false`,
        [normalizedEmail, otpCode, otpType]
      );
    } catch (err) {
      console.error('Error incrementing OTP attempts:', err);
    }
  }

  // Get valid OTP for email
  static async getValid(email, otpType = 'signup') {
    const normalizedEmail = this.normalizeEmail(email);
    try {
      const result = await pool.query(
        `SELECT * FROM otp_verification 
         WHERE email = $1 AND otp_type = $2 
         AND is_verified = false AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [normalizedEmail, otpType]
      );

      return result.rows[0] || null;
    } catch (err) {
      console.error('Error getting valid OTP:', err);
      throw err;
    }
  }

  // Check if OTP is verified
  static async isVerified(email, otpType = 'signup') {
    const normalizedEmail = this.normalizeEmail(email);
    try {
      const result = await pool.query(
        `SELECT * FROM otp_verification 
         WHERE email = $1 AND otp_type = $2 AND is_verified = true
         ORDER BY verified_at DESC LIMIT 1`,
        [normalizedEmail, otpType]
      );

      if (result.rows.length === 0) return false;

      const otp = result.rows[0];
      // Check if verification is still within 30 minutes
      const verifiedTime = new Date(otp.verified_at).getTime();
      const nowTime = Date.now();
      return (nowTime - verifiedTime) < 30 * 60 * 1000;
    } catch (err) {
      console.error('Error checking OTP verification:', err);
      throw err;
    }
  }
}

module.exports = OTP;
