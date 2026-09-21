const bcrypt = require('bcryptjs');
const pool = require('../db/connection');

class User {
  static normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
  }

  static async create(email, password, firstName, lastName, userType = 'user', isActive = true) {
    const normalizedEmail = this.normalizeEmail(email);
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, user_type, is_active)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, first_name, last_name, user_type, is_active, created_at`,
      [normalizedEmail, hashedPassword, firstName, lastName, userType, isActive]
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
      'SELECT id, email, first_name, last_name, user_type, is_active, created_at FROM users WHERE id = $1',
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

  static async updatePassword(email, newPassword) {
    const normalizedEmail = this.normalizeEmail(email);
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    const result = await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW()
       WHERE email = $2
       RETURNING id, email, first_name, last_name, user_type, is_active, created_at`,
      [hashedPassword, normalizedEmail]
    );
    return result.rows[0];
  }
}

module.exports = User;
