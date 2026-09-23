const pool = require('../db/connection');

class OTP {
  static memStore = new Map();

  static normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  // Generate a random 6-digit OTP string
  static generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Create and store OTP for email
  static async create(email, otpType = 'signup') {
    const normalizedEmail = this.normalizeEmail(email);
    const otpCode = this.generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    try {
      // Invalidate previous unverified OTPs by expiring them
      await pool.query(
        `UPDATE otp_verification SET expires_at = NOW() 
         WHERE email = $1 AND otp_type = $2 AND is_verified = false AND expires_at > NOW()`,
        [normalizedEmail, otpType]
      );

      const result = await pool.query(
        `INSERT INTO otp_verification (email, otp_code, otp_type, expires_at)
         VALUES ($1, $2, $3, $4)
         RETURNING id, otp_code, expires_at`,
        [normalizedEmail, otpCode, otpType, expiresAt]
      );

      return result.rows[0];
    } catch (err) {
      console.warn('DB OTP create fallback to memory store:', err.message);
      const record = {
        id: `mem-${Date.now()}`,
        otp_code: otpCode,
        expires_at: expiresAt,
        is_verified: false,
        verified_at: null,
        attempts: 0,
        max_attempts: 5
      };
      this.memStore.set(`${normalizedEmail}:${otpType}`, record);
      return record;
    }
  }

  // Verify OTP code
  static async verify(email, otpCode, otpType = 'signup') {
    const normalizedEmail = this.normalizeEmail(email);
    const cleanCode = String(otpCode || '').trim();

    try {
      const result = await pool.query(
        `SELECT * FROM otp_verification 
         WHERE email = $1 AND otp_code = $2 AND otp_type = $3 
         AND is_verified = false AND expires_at > NOW()`,
        [normalizedEmail, cleanCode, otpType]
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
      console.warn('DB OTP verify fallback to memory store:', err.message);
      const key = `${normalizedEmail}:${otpType}`;
      const rec = this.memStore.get(key);
      if (rec && !rec.is_verified && rec.otp_code === cleanCode && new Date(rec.expires_at) > new Date()) {
        rec.is_verified = true;
        rec.verified_at = new Date();
        return rec;
      }
      return null;
    }
  }

  // Increment attempt count
  static async incrementAttempts(email, otpCode, otpType = 'signup') {
    const normalizedEmail = this.normalizeEmail(email);
    try {
      await pool.query(
        `UPDATE otp_verification 
         SET attempts = attempts + 1
         WHERE email = $1 AND otp_type = $2 
         AND is_verified = false AND expires_at > NOW()`,
        [normalizedEmail, otpType]
      );
    } catch (err) {
      const key = `${normalizedEmail}:${otpType}`;
      const rec = this.memStore.get(key);
      if (rec) rec.attempts = (rec.attempts || 0) + 1;
    }
  }

  // Check if OTP is verified for this email within 30 minutes
  static async isVerified(email, otpType = 'signup') {
    const normalizedEmail = this.normalizeEmail(email);
    try {
      const result = await pool.query(
        `SELECT * FROM otp_verification 
         WHERE email = $1 AND otp_type = $2 AND is_verified = true AND verified_at IS NOT NULL
         ORDER BY verified_at DESC LIMIT 1`,
        [normalizedEmail, otpType]
      );

      if (result.rows.length === 0) return false;

      const otp = result.rows[0];
      const verifiedTime = new Date(otp.verified_at).getTime();
      return (Date.now() - verifiedTime) < 30 * 60 * 1000;
    } catch (err) {
      const key = `${normalizedEmail}:${otpType}`;
      const rec = this.memStore.get(key);
      if (rec && rec.is_verified && rec.verified_at) {
        return (Date.now() - new Date(rec.verified_at).getTime()) < 30 * 60 * 1000;
      }
      return false;
    }
  }

  // Consume/invalidate verified OTP after registration/reset is complete
  static async consume(email, otpType = 'signup') {
    const normalizedEmail = this.normalizeEmail(email);
    try {
      await pool.query(
        `UPDATE otp_verification 
         SET expires_at = NOW()
         WHERE email = $1 AND otp_type = $2`,
        [normalizedEmail, otpType]
      );
    } catch (err) {
      this.memStore.delete(`${normalizedEmail}:${otpType}`);
    }
  }
}

module.exports = OTP;
