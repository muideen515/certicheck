-- ═══════════════════════════════════════════════════════════════════════════════
-- CERTICHECK DATABASE SCHEMA
-- PostgreSQL initialization script
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── USERS TABLE ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(128),
  last_name VARCHAR(128),
  user_type VARCHAR(20) DEFAULT 'user' CHECK (user_type IN ('user', 'issuer', 'admin')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_email ON users(email);

-- ── ISSUER PROFILES TABLE ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS issuer_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  organization_name VARCHAR(255) NOT NULL,
  organization_type VARCHAR(100),
  website VARCHAR(255),
  contact_name VARCHAR(128),
  contact_role VARCHAR(128),
  certificate_volume VARCHAR(50),
  use_case TEXT,
  wallet_address VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'suspended')),
  approval_timestamp TIMESTAMP,
  rejection_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── PENDING APPLICATIONS TABLE ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pending_applications (
  id SERIAL PRIMARY KEY,
  issuer_id INTEGER NOT NULL REFERENCES issuer_profiles(id) ON DELETE CASCADE,
  organization_name VARCHAR(255) NOT NULL,
  organization_type VARCHAR(100),
  organization_website VARCHAR(255),
  contact_name VARCHAR(128),
  contact_email VARCHAR(255),
  contact_role VARCHAR(128),
  certificate_volume VARCHAR(50),
  use_case TEXT,
  wallet_address VARCHAR(255),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP,
  reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- ── CERTIFICATE VERIFICATION HISTORY TABLE ────────────────────────────────────
CREATE TABLE IF NOT EXISTS verify_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  certificate_id VARCHAR(255) NOT NULL,
  certificate_type VARCHAR(100),
  verification_status VARCHAR(20) CHECK (verification_status IN ('valid', 'invalid', 'revoked', 'expired')),
  verification_message TEXT,
  blockchain_hash VARCHAR(255),
  blockchain_transaction_id VARCHAR(255),
  checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP,
  revoked_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- ── CERTIFICATES TABLE ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificates (
  id SERIAL PRIMARY KEY,
  certificate_id VARCHAR(255) UNIQUE NOT NULL,
  issuer_name VARCHAR(255),
  issuer_wallet VARCHAR(255),
  holder_name VARCHAR(255),
  holder_email VARCHAR(255),
  certificate_type VARCHAR(100),
  status VARCHAR(20) DEFAULT 'valid' CHECK (status IN ('valid', 'invalid', 'revoked', 'expired')),
  ipfs_cid VARCHAR(255),
  ipfs_uri TEXT,
  blockchain_transaction_id VARCHAR(255),
  metadata JSONB,
  issued_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  revoked_at TIMESTAMP,
  revocation_reason TEXT,  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_certificates_certificate_id ON certificates(certificate_id);

-- ── REVOKED CERTIFICATES TABLE ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS revoked_certificates (
  id SERIAL PRIMARY KEY,
  certificate_id VARCHAR(255) UNIQUE NOT NULL,
  issuer_id INTEGER REFERENCES issuer_profiles(id) ON DELETE SET NULL,
  revocation_reason TEXT,
  revoked_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  revoked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  blockchain_transaction_id VARCHAR(255)
);

-- ── OTP TABLE ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otp_verification (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  otp_code VARCHAR(6) NOT NULL,
  otp_type VARCHAR(20) CHECK (otp_type IN ('signup', 'forgot_password')) NOT NULL,
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP + INTERVAL '10 minutes',
  verified_at TIMESTAMP,
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5
);
CREATE INDEX IF NOT EXISTS idx_email_otp ON otp_verification(email, otp_type);

-- ── AUDIT LOG TABLE ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  action_type VARCHAR(50) CHECK (action_type IN ('LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'REGISTER', 'APPLICATION_SUBMIT', 'APPLICATION_APPROVE', 'APPLICATION_REJECT', 'CERTIFICATE_VERIFY', 'CERTIFICATE_REVOKE', 'ADMIN_ACCESS', 'PASSWORD_CHANGE', 'PROFILE_UPDATE')),
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  status VARCHAR(20) DEFAULT 'success' CHECK (status IN ('success', 'failed')),
  error_message TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  metadata JSONB,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_action ON audit_log(user_id, action_type);
CREATE INDEX IF NOT EXISTS idx_timestamp ON audit_log(timestamp);

-- ── ADMIN ACCESS LOG TABLE ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_access_log (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  access_type VARCHAR(50),
  dashboard_section VARCHAR(100),
  login_method VARCHAR(50),
  ip_address VARCHAR(45),
  user_agent TEXT,
  session_duration_seconds INTEGER,
  accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  logged_out_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_admin_access ON admin_access_log(admin_id, accessed_at);

-- ── WRONG PASSWORD ATTEMPTS TABLE ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wrong_password_attempts (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255),
  ip_address VARCHAR(45),
  attempt_count INTEGER DEFAULT 1,
  first_attempt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_attempt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_locked BOOLEAN DEFAULT FALSE,
  locked_until TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_email_ip ON wrong_password_attempts(email, ip_address);

-- ── SESSIONS TABLE (optional, for session management) ─────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) UNIQUE NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT TRUE
);

-- ── INDEXES ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_issuer_status ON issuer_profiles(status);
CREATE INDEX IF NOT EXISTS idx_pending_apps_status ON pending_applications(status);
CREATE INDEX IF NOT EXISTS idx_verify_history_cert ON verify_history(certificate_id);
CREATE INDEX IF NOT EXISTS idx_verify_history_user ON verify_history(user_id);
CREATE INDEX IF NOT EXISTS idx_revoked_certs_issuer ON revoked_certificates(issuer_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(is_active, expires_at);

-- ── DEMO SEED ───────────────────────────────────────────────────────────────
-- Insert a demo admin user so demo-mode requests (id=1) satisfy foreign keys
INSERT INTO users (id, email, password_hash, first_name, last_name, user_type, is_active, created_at, updated_at)
VALUES (1, 'demo@certicheck.io', 'demo', 'Demo', 'User', 'admin', TRUE, NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Ensure users id sequence is advanced
SELECT setval(pg_get_serial_sequence('users','id'), COALESCE(MAX(id), 1)) FROM users;

-- Convert audit_log.resource_id to text to accept certificate IDs
ALTER TABLE IF EXISTS audit_log ALTER COLUMN resource_id TYPE VARCHAR(255) USING resource_id::text;
