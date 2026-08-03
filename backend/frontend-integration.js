// ═══════════════════════════════════════════════════════════════════════════════
// CERTICHECK BACKEND INTEGRATION SCRIPT
// Connect your frontend to the new Node.js + PostgreSQL backend
// ═══════════════════════════════════════════════════════════════════════════════

const API_BASE_URL = 'http://localhost:5000/api';
let AUTH_TOKEN = localStorage.getItem('certicheck_auth_token');

// ── AUTHENTICATION API ─────────────────────────────────────────────────────────
const AuthAPI = {
  // Register new user
  async register(email, password, firstName, lastName, userType = 'user') {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, firstName, lastName, userType })
    });
    const data = await response.json();
    if (data.token) {
      AUTH_TOKEN = data.token;
      localStorage.setItem('certicheck_auth_token', AUTH_TOKEN);
    }
    return data;
  },

  // Login user
  async login(email, password) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (data.token) {
      AUTH_TOKEN = data.token;
      localStorage.setItem('certicheck_auth_token', AUTH_TOKEN);
      localStorage.setItem('certicheck_user', JSON.stringify(data.user));
    }
    return data;
  },

  // Logout user
  logout() {
    AUTH_TOKEN = null;
    localStorage.removeItem('certicheck_auth_token');
    localStorage.removeItem('certicheck_user');
  },

  // Get user profile
  async getProfile() {
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    return await response.json();
  },

  // Update user profile
  async updateProfile(firstName, lastName) {
    const response = await fetch(`${API_BASE_URL}/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({ firstName, lastName })
    });
    return await response.json();
  }
};

// ── APPLICATIONS API ───────────────────────────────────────────────────────────
const ApplicationAPI = {
  // Submit issuer application
  async submit(orgName, orgType, website, contactName, contactEmail, contactRole, volume, useCase, wallet) {
    const response = await fetch(`${API_BASE_URL}/applications/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({
        orgName, orgType, website, contactName, contactEmail, contactRole, volume, useCase, wallet
      })
    });
    return await response.json();
  },

  // Get pending applications (admin)
  async getPending(limit = 50, offset = 0) {
    const response = await fetch(
      `${API_BASE_URL}/applications/pending?limit=${limit}&offset=${offset}`,
      { headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` } }
    );
    return await response.json();
  },

  // Get rejected applications (admin)
  async getRejected(limit = 50, offset = 0) {
    const response = await fetch(
      `${API_BASE_URL}/applications/rejected?limit=${limit}&offset=${offset}`,
      { headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` } }
    );
    return await response.json();
  },

  // Approve application (admin)
  async approve(appId) {
    const response = await fetch(`${API_BASE_URL}/applications/${appId}/approve`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    return await response.json();
  },

  // Reject application (admin)
  async reject(appId) {
    const response = await fetch(`${API_BASE_URL}/applications/${appId}/reject`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    return await response.json();
  }
};

// ── CERTIFICATE VERIFICATION API ──────────────────────────────────────────────
const VerifyAPI = {
  async issueCertificate(certificateData) {
    const response = await fetch(`${API_BASE_URL}/certificates/issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify(certificateData)
    });
    return await response.json();
  },

  async lookupCertificate(certificateId) {
    const response = await fetch(`${API_BASE_URL}/certificates/lookup/${encodeURIComponent(certificateId)}`);
    return await response.json();
  },

  async revokeCertificate(certificateId, reason) {
    const response = await fetch(`${API_BASE_URL}/certificates/revoke/${encodeURIComponent(certificateId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({ reason })
    });
    return await response.json();
  },

  // Log certificate verification
  async logVerification(certId, status, message) {
    const response = await fetch(`${API_BASE_URL}/verify/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ certId, status, message })
    });
    return await response.json();
  },

  // Get verification history (admin)
  async getHistory(limit = 50, offset = 0) {
    const response = await fetch(
      `${API_BASE_URL}/verify/history?limit=${limit}&offset=${offset}`,
      { headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` } }
    );
    return await response.json();
  },

  // Get user's verification history
  async getUserHistory(limit = 50, offset = 0) {
    const response = await fetch(
      `${API_BASE_URL}/verify/my-history?limit=${limit}&offset=${offset}`,
      { headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` } }
    );
    return await response.json();
  },

  // Revoke certificate (admin)
  async revoke(entryId) {
    const response = await fetch(`${API_BASE_URL}/verify/${entryId}/revoke`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    return await response.json();
  },

  // Get revoked certificates (admin)
  async getRevoked(limit = 50, offset = 0) {
    const response = await fetch(
      `${API_BASE_URL}/verify/revoked?limit=${limit}&offset=${offset}`,
      { headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` } }
    );
    return await response.json();
  }
};

// ── ADMIN DASHBOARD API ────────────────────────────────────────────────────────
const AdminAPI = {
  // Get dashboard stats
  async getDashboard() {
    const response = await fetch(`${API_BASE_URL}/admin/dashboard`, {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    return await response.json();
  },

  // Log admin access
  async logAccess(section, method) {
    const response = await fetch(`${API_BASE_URL}/admin/access-log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`
      },
      body: JSON.stringify({ section, method })
    });
    return await response.json();
  },

  // Get audit log
  async getAuditLog(limit = 100, offset = 0, actionType = null) {
    let url = `${API_BASE_URL}/admin/audit-log?limit=${limit}&offset=${offset}`;
    if (actionType) url += `&actionType=${actionType}`;
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    return await response.json();
  },

  // Get login attempts
  async getLoginAttempts() {
    const response = await fetch(`${API_BASE_URL}/admin/login-attempts`, {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    return await response.json();
  },

  // Get failed password attempts
  async getFailedPasswords() {
    const response = await fetch(`${API_BASE_URL}/admin/failed-passwords`, {
      headers: { 'Authorization': `Bearer ${AUTH_TOKEN}` }
    });
    return await response.json();
  }
};

// ── HELPER FUNCTIONS ──────────────────────────────────────────────────────────
function isAuthenticated() {
  return !!AUTH_TOKEN;
}

function getAuthToken() {
  return AUTH_TOKEN;
}

function setAuthToken(token) {
  AUTH_TOKEN = token;
  localStorage.setItem('certicheck_auth_token', token);
}

function getCurrentUser() {
  const user = localStorage.getItem('certicheck_user');
  return user ? JSON.parse(user) : null;
}

// ── INTEGRATION EXAMPLE ────────────────────────────────────────────────────────
// In your HTML, replace localStorage calls with API calls:
//
// OLD (localStorage):
//   localStorage.setItem('certicheck_pending_applications', JSON.stringify(apps));
//
// NEW (Backend):
//   await ApplicationAPI.submit(orgName, orgType, website, ...);
//
// Then on admin page:
//   const result = await ApplicationAPI.getPending();
//   const apps = result.applications;

module.exports = { AuthAPI, ApplicationAPI, VerifyAPI, AdminAPI, isAuthenticated, getAuthToken, getCurrentUser };
