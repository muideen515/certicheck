const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../db/connection');

class User {
  static normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  static async create(email, password = 'password', firstName, lastName, userType = 'user') {
    const normalizedEmail = this.normalizeEmail(email);
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, user_type, is_active, must_change_password)
       VALUES ($1, $2, $3, $4, $5, FALSE, TRUE)
       RETURNING id, email, first_name, last_name, user_type, is_active, must_change_password, created_at`,
      [normalizedEmail, hashedPassword, firstName, lastName, userType]
    );

    return result.rows[0];
  }

  static async findByEmail(email) {
    const normalizedEmail = this.normalizeEmail(email);
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [normalizedEmail]
    );
    return result.rows[0];
  }

  static async findById(id) {
    if (!id) return null;

    const result = await pool.query(
      'SELECT id, email, first_name, last_name, user_type, is_active, must_change_password, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async findSafeByEmail(email) {
    const normalizedEmail = this.normalizeEmail(email);
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, user_type, is_active, created_at FROM users WHERE email = $1',
      [normalizedEmail]
    );
    return result.rows[0];
  }

  static async getPendingAccounts(limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT id, email, first_name, last_name, user_type, is_active, must_change_password, created_at
       FROM users
       WHERE is_active = FALSE AND COALESCE(user_type, 'user') != 'admin'
       ORDER BY created_at ASC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  static async approveAccount(userId) {
    const hashedPassword = await bcrypt.hash('password', 10);
    const result = await pool.query(
      `UPDATE users
       SET password_hash = $1, is_active = TRUE, must_change_password = TRUE, updated_at = NOW()
       WHERE id = $2 AND is_active = FALSE AND COALESCE(user_type, 'user') != 'admin'
       RETURNING id, email, first_name, last_name, user_type, is_active, must_change_password, created_at`,
      [hashedPassword, userId]
    );
    return result.rows[0] || null;
  }

  static async createPasswordResetOtp(email) {
    const normalizedEmail = this.normalizeEmail(email);
    const otpCode = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const result = await pool.query(
      `UPDATE users
       SET reset_otp_code = $1, reset_otp_expires_at = $2, reset_otp_attempts = 0, updated_at = NOW()
       WHERE email = $3
       RETURNING id, email, reset_otp_expires_at`,
      [otpCode, expiresAt, normalizedEmail]
    );
    if (!result.rows[0]) return null;
    return { ...result.rows[0], otp_code: otpCode, expires_at: result.rows[0].reset_otp_expires_at };
  }

  static async verifyPasswordResetOtp(email, otpCode) {
    const normalizedEmail = this.normalizeEmail(email);
    const cleanCode = String(otpCode || '').trim();
    const result = await pool.query(
      `SELECT id FROM users
       WHERE email = $1 AND reset_otp_code = $2 AND reset_otp_expires_at > NOW()
         AND reset_otp_attempts < 5`,
      [normalizedEmail, cleanCode]
    );
    if (result.rows[0]) return true;

    await pool.query(
      `UPDATE users SET reset_otp_attempts = reset_otp_attempts + 1, updated_at = NOW()
       WHERE email = $1 AND reset_otp_code IS NOT NULL
         AND reset_otp_expires_at > NOW() AND reset_otp_attempts < 5`,
      [normalizedEmail]
    );
    return false;
  }

  static async resetPasswordWithOtp(email, otpCode, newPassword) {
    const normalizedEmail = this.normalizeEmail(email);
    const cleanCode = String(otpCode || '').trim();
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const result = await pool.query(
      `UPDATE users
       SET password_hash = $1, must_change_password = FALSE,
           reset_otp_code = NULL, reset_otp_expires_at = NULL,
           reset_otp_attempts = 0, updated_at = NOW()
       WHERE email = $2 AND reset_otp_code = $3
         AND reset_otp_expires_at > NOW() AND reset_otp_attempts < 5
       RETURNING id, email, first_name, last_name, user_type`,
      [hashedPassword, normalizedEmail, cleanCode]
    );
    return result.rows[0] || null;
  }

  static async verifyPassword(email, password) {
    const user = await this.findByEmail(email);
    if (!user) return null;

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return null;

    return user;
  }

  static async getAllUsers(limit = 50, offset = 0) {
    const result = await pool.query(
      'SELECT id, email, first_name, last_name, user_type, is_active, created_at FROM users LIMIT $1 OFFSET $2',
      [limit, offset]
    );
    return result.rows;
  }

  static async updateProfile(userId, firstName, lastName) {
    const result = await pool.query(
      `UPDATE users SET first_name = $1, last_name = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, email, first_name, last_name, user_type, is_active, created_at`,
      [firstName, lastName, userId]
    );
    return result.rows[0];
  }

  static async updatePassword(email, newPassword, mustChangePassword = false) {
    const normalizedEmail = this.normalizeEmail(email);
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const result = await pool.query(
      `UPDATE users SET password_hash = $1, must_change_password = $3, updated_at = NOW()
       WHERE email = $2
       RETURNING id, email, first_name, last_name, user_type, is_active, must_change_password, created_at`,
      [hashedPassword, normalizedEmail, mustChangePassword]
    );
    return result.rows[0];
  }
}

module.exports = User;
