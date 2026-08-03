const fs = require('fs');
const path = require('path');
const pool = require('./connection');

async function initializeDatabase() {
  try {
    const sqlFile = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf-8');
    const statements = sqlFile
      .split(/;\s*(?=(?:[^'"`]*(?:['"`])[^'"`]*\1)*[^'"`]*$)/m)
      .filter(Boolean)
      .map(stmt => stmt?.trim())
      .filter(Boolean);

    await pool.query('BEGIN');

    for (const statement of statements) {
      if (!statement || statement.length === 0) continue;
      await pool.query(statement);
    }

    await pool.query('COMMIT');
    console.log('✓ Database initialized successfully');
  } catch (err) {
    console.error('✗ Error initializing database:', err);
    try {
      await pool.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('✗ Failed to rollback transaction:', rollbackErr);
    }
    await pool.end();
    process.exit(1);
  } finally {
    if (!pool.ended) {
      await pool.end();
    }
  }
}

initializeDatabase();
