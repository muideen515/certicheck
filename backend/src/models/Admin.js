const pool = require('../db/connection');

class Admin {
  static async ensureFromUser(user) {
    if (!user || user.user_type !== 'admin') return null;

    const result = await pool.query(
      `INSERT INTO admins (id, name, email, password_hash, role)
       SELECT id, TRIM(CONCAT_WS(' ', first_name, last_name)), email, password_hash, 'admin'
       FROM users
       WHERE id = $1 AND user_type = 'admin'
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, password_hash = EXCLUDED.password_hash, updated_at = NOW()
       RETURNING id, name, email, profile_picture_url, role, created_at, updated_at`,
      [user.id]
    );
    return result.rows[0] || null;
  }

  static async findById(id) {
    if (!id) return null;

    const result = await pool.query(
      `SELECT id, name, email, profile_picture_url, role, created_at, updated_at
       FROM admins WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] || null;
  }

  static async syncPasswordHash(id) {
    await pool.query(
      `UPDATE admins
       SET password_hash = users.password_hash, updated_at = NOW()
       FROM users
       WHERE admins.id = $1 AND users.id = admins.id AND users.user_type = 'admin'`,
      [id]
    );
  }

  static async updateProfile(id, { name, profilePicture, updatePicture = false }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE admins
         SET name = COALESCE($1, name),
             profile_picture_url = CASE WHEN $2 THEN $3 ELSE profile_picture_url END,
             updated_at = NOW()
         WHERE id = $4
         RETURNING id, name, email, profile_picture_url, role, created_at, updated_at`,
        [name, updatePicture, profilePicture, id]
      );
      const admin = result.rows[0];
      if (!admin) {
        await client.query('ROLLBACK');
        return null;
      }

      if (name !== null && name !== undefined) {
        const [firstName, ...lastNameParts] = name.trim().split(/\s+/);
        await client.query(
          `UPDATE users SET first_name = $1, last_name = $2, updated_at = NOW()
           WHERE id = $3 AND user_type = 'admin'`,
          [firstName, lastNameParts.join(' '), id]
        );
      }

      await client.query('COMMIT');
      return admin;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Admin profile transaction rollback failed:', rollbackError.message || rollbackError);
      }
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = Admin;
