const pool = require('../db/connection');
const User = require('./User');

class Application {
  static async create(issuerId, orgName, orgType, website, contactName, contactEmail, contactRole, volume, useCase, wallet) {
    const existingProfile = await pool.query(
      'SELECT id FROM issuer_profiles WHERE user_id = $1 LIMIT 1',
      [issuerId]
    );

    let issuerProfileId;
    if (existingProfile.rows[0]) {
      issuerProfileId = existingProfile.rows[0].id;
      await pool.query(
        `UPDATE issuer_profiles
         SET organization_name = COALESCE($2, organization_name), organization_type = COALESCE($3, organization_type), website = COALESCE($4, website), contact_name = COALESCE($5, contact_name), contact_role = COALESCE($6, contact_role), certificate_volume = COALESCE($7, certificate_volume), use_case = COALESCE($8, use_case), wallet_address = COALESCE($9, wallet_address), status = 'pending', updated_at = NOW()
         WHERE id = $1`,
        [issuerProfileId, orgName, orgType, website, contactName, contactRole, volume, useCase, wallet]
      );
    } else {
      const createdProfile = await pool.query(
        `INSERT INTO issuer_profiles (user_id, organization_name, organization_type, website, contact_name, contact_role, certificate_volume, use_case, wallet_address, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
         RETURNING id`,
        [issuerId, orgName, orgType, website, contactName, contactRole, volume, useCase, wallet]
      );
      issuerProfileId = createdProfile.rows[0].id;
    }

    const result = await pool.query(
      `INSERT INTO pending_applications 
       (issuer_id, organization_name, organization_type, organization_website, contact_name, contact_email, contact_role, certificate_volume, use_case, wallet_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, organization_name, status, submitted_at`,
      [issuerProfileId, orgName, orgType, website, contactName, contactEmail, contactRole, volume, useCase, wallet]
    );
    return result.rows[0];
  }

  static async getPending(limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT * FROM pending_applications WHERE status = 'pending' LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  static async getByStatus(status, limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT * FROM pending_applications WHERE status = $1 LIMIT $2 OFFSET $3`,
      [status, limit, offset]
    );
    return result.rows;
  }

  static async approve(appId, reviewerId) {
    const result = await pool.query(
      `UPDATE pending_applications SET status = 'approved', reviewed_at = NOW(), reviewer_id = $1
       WHERE id = $2
       RETURNING id, issuer_id, organization_name, status, reviewed_at`,
      [reviewerId, appId]
    );

    if (result.rows[0]) {
      await pool.query(
        `UPDATE issuer_profiles
         SET status = 'approved', approval_timestamp = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [result.rows[0].issuer_id]
      );

      const profile = await pool.query(
        'SELECT user_id FROM issuer_profiles WHERE id = $1 LIMIT 1',
        [result.rows[0].issuer_id]
      );

      if (profile.rows[0]?.user_id) {
        await pool.query(
          `UPDATE users SET user_type = 'issuer', updated_at = NOW() WHERE id = $1`,
          [profile.rows[0].user_id]
        );
      }
    }

    return result.rows[0];
  }

  static async reject(appId, reviewerId) {
    const result = await pool.query(
      `UPDATE pending_applications SET status = 'rejected', reviewed_at = NOW(), reviewer_id = $1
       WHERE id = $2
       RETURNING id, issuer_id, status, reviewed_at`,
      [reviewerId, appId]
    );

    if (result.rows[0]?.issuer_id) {
      await pool.query(
        `UPDATE issuer_profiles SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
        [result.rows[0].issuer_id]
      );
    }

    return result.rows[0];
  }

  static async getAll(limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT * FROM pending_applications LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }

  static async countByStatus(status) {
    const result = await pool.query(
      `SELECT COUNT(*) as count FROM pending_applications WHERE status = $1`,
      [status]
    );
    return parseInt(result.rows[0].count);
  }
}

module.exports = Application;
