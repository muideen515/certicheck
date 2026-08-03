const pool = require('../db/connection');

class VerifyHistory {
  static normalizeCertId(certId) {
    return String(certId || '').trim().toUpperCase();
  }

  static async create(userId, certId, status, message, blockchainHash = null) {
    const normalizedCertId = this.normalizeCertId(certId);
    const result = await pool.query(
      `INSERT INTO verify_history (user_id, certificate_id, verification_status, verification_message, blockchain_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, certificate_id, verification_status, checked_at`,
      [userId, normalizedCertId, status, message, blockchainHash]
    );
    return result.rows[0];
  }

  static async getHistory(limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT id, certificate_id, verification_status, verification_message, checked_at, revoked_at
       FROM verify_history ORDER BY checked_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  static async getUserHistory(userId, limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT id, certificate_id, verification_status, verification_message, checked_at, revoked_at
       FROM verify_history WHERE user_id = $1 ORDER BY checked_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  static async revoke(entryId, revokedByUserId) {
    const result = await pool.query(
      `UPDATE verify_history SET revoked_at = NOW(), verification_status = 'revoked', revoked_by = $1
       WHERE id = $2
       RETURNING id, certificate_id, verification_status, revoked_at`,
      [revokedByUserId, entryId]
    );
    return result.rows[0];
  }

  static async getRevokedCerts(limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT id, certificate_id, verification_status, revoked_at, revoked_by
       FROM verify_history WHERE verification_status = 'revoked' ORDER BY revoked_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  static async count() {
    const result = await pool.query('SELECT COUNT(*) as count FROM verify_history');
    return parseInt(result.rows[0].count);
  }
}

module.exports = VerifyHistory;
