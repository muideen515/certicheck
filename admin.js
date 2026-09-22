"use strict";

const API_BASE_URL = (function() {
  try {
    const host = window.location.hostname;
    const port = window.location.port;
    if (host === '127.0.0.1' || host === 'localhost') {
      if (port && port !== '5000') return 'http://127.0.0.1:5000/api';
    }
    if (host.includes('.app.github.dev') || host.includes('.githubpreview.dev')) {
      const backendHost = host.replace(/-5500\./, '-5000.').replace(/-3000\./, '-5000.');
      return `https://${backendHost}/api`;
    }
  } catch (e) {
    return 'http://127.0.0.1:5000/api';
  }
  return `${window.location.origin}/api`;
})();
const ADMIN_SESSION_KEY = "certicheck_admin_logged_in";
const ADMIN_TOKEN_KEY = "certicheck_admin_token";
const ADMIN_USER_KEY = "certicheck_admin_user";
// Reduced admin sections: keep only 'audit' and surface other items in audit view
const ADMIN_SECTIONS = [
  { id: "audit", label: "Audit log" },
];

let adminCurrentSection = "audit";
let adminAuditFilter = 'all';
let adminState = {
  token: localStorage.getItem(ADMIN_TOKEN_KEY) || "",
  user: null,
  stats: null,
  pendingApps: [],
  rejectedApps: [],
  checks: [],
  revoked: [],
  auditLog: []
};

function isAdminLoggedIn() {
  return sessionStorage.getItem(ADMIN_SESSION_KEY) === "1" || !!adminState.token;
}

function formatDateTime(value) {
  try {
    return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch (err) {
    return value || "—";
  }
}

function showAdminError(message) {
  const errorBox = document.getElementById("adminLoginError");
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.style.display = "block";
}

function clearAdminError() {
  const errorBox = document.getElementById("adminLoginError");
  if (errorBox) {
    errorBox.textContent = "";
    errorBox.style.display = "none";
  }
}

function getAuthHeaders(body = null) {
  const headers = {};
  if (body) {
    headers["Content-Type"] = "application/json";
  }
  if (adminState.token) {
    headers.Authorization = `Bearer ${adminState.token}`;
  }
  return headers;
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...getAuthHeaders(options.body),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

function setAdminState(enabled, user = null) {
  const loginCard = document.getElementById("adminLoginCard");
  const dashboard = document.getElementById("adminDashboard");
  const welcome = document.getElementById("adminWelcome");
  const navbarSignOut = document.getElementById('adminLogoutBtn');

  if (enabled) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
    if (loginCard) loginCard.style.display = "none";
    if (dashboard) dashboard.style.display = "block";
    clearAdminError();
    if (welcome) {
      welcome.textContent = user?.first_name || user?.email || "Admin";
    }
    // populate profile sidebar if present
    const profileName = document.getElementById('adminProfileName');
    const profileEmail = document.getElementById('adminProfileEmail');
    const profileRole = document.getElementById('adminProfileRole');
    const avatar = document.querySelector('#adminProfile div[style*="width:72px"]');
    if (profileName) profileName.textContent = user?.first_name ? `${user.first_name} ${user.last_name || ''}`.trim() : (user?.email || 'Admin');
    if (profileEmail) profileEmail.textContent = user?.email || '';
    if (profileRole) profileRole.innerHTML = `<span style="background:rgba(124,58,237,0.08);color:var(--purple-mid);padding:6px 10px;border-radius:999px;font-weight:700;font-size:12px;">${(user?.user_type || 'admin').toUpperCase()}</span>`;
    if (avatar && user?.first_name) {
      const initials = (user.first_name[0] || 'A') + (user.last_name ? user.last_name[0] : 'D');
      avatar.textContent = initials.toUpperCase();
    }
      // no visible tabs in simplified UI
    loadAdminDashboard();
  } else {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
    adminState.token = "";
    adminState.user = null;
    if (loginCard) loginCard.style.display = "block";
    if (dashboard) dashboard.style.display = "none";
    clearAdminError();
  }
}

// Quick action wiring: filter audit view
function bindQuickActions() {
  const container = document.querySelector('.quick-actions');
  if (!container) return;
  container.querySelectorAll('button[data-action-quick]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.actionQuick;
      adminAuditFilter = action || 'all';
      adminCurrentSection = 'audit';
      renderAdminDashboard();
    });
  });
}

function renderAdminTabs() {
  // tabs intentionally removed — quick actions control the view
  return;
}

function setAdminSection(section) {
  if (!ADMIN_SECTIONS.some(item => item.id === section)) return;
  adminCurrentSection = section;
  document.querySelectorAll(".admin-tab-button").forEach(button => {
    button.classList.toggle("active", button.dataset.section === section);
  });
  renderAdminDashboard();
}

// Apply audit filter inside renderAdminDashboard

function renderAdminDashboard() {
  const list = document.getElementById("adminList");
  const summary = document.getElementById("adminSummary");
  const intro = document.getElementById("adminSectionIntro");
  const statsGrid = document.getElementById("adminStatsGrid");
  if (!list || !summary || !intro) return;

  if (statsGrid && adminState.stats) {
    statsGrid.innerHTML = `
      <div class="resource-card" style="padding:18px 20px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-secondary);">Pending</div>
        <div style="font-size:28px;font-weight:800;margin-top:6px;">${adminState.stats.pendingApplications ?? 0}</div>
      </div>
      <div class="resource-card" style="padding:18px 20px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-secondary);">Approved</div>
        <div style="font-size:28px;font-weight:800;margin-top:6px;">${adminState.stats.approvedApplications ?? 0}</div>
      </div>
      <div class="resource-card" style="padding:18px 20px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-secondary);">Revoked</div>
        <div style="font-size:28px;font-weight:800;margin-top:6px;">${adminState.stats.revokedCertificates ?? 0}</div>
      </div>
      <div class="resource-card" style="padding:18px 20px;">
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--text-secondary);">Checks</div>
        <div style="font-size:28px;font-weight:800;margin-top:6px;">${adminState.stats.totalVerifications ?? 0}</div>
      </div>
    `;
  }
  const renderEmpty = message => `
    <div style="padding:24px;border-radius:20px;border:1px solid var(--border);background:var(--bg-subtle);color:var(--text-secondary);">${message}</div>
  `;

  // Only audit view is supported in the simplified UI. Merge pending/rejected into audit.
  const auditLog = (adminState.auditLog || []).slice();
  // Append pending and rejected applications as audit entries for visibility
  (adminState.pendingApps || []).forEach(app => {
    auditLog.unshift({ action_type: 'Pending Application', timestamp: app.submitted_at || app.created_at || new Date().toISOString(), status: 'pending', error_message: `${app.organization_name || app.orgName || 'Organisation'} — ${app.contact_email || app.contactEmail || ''}` });
  });
  (adminState.rejectedApps || []).forEach(app => {
    auditLog.unshift({ action_type: 'Rejected Application', timestamp: app.rejected_at || app.updated_at || new Date().toISOString(), status: 'rejected', error_message: `${app.organization_name || app.orgName || 'Organisation'} — ${app.contact_email || app.contactEmail || ''}` });
  });

  summary.textContent = `${auditLog.length} audit entries`;
  intro.textContent = "Review privileged admin activity, pending and rejected issuer applications.";

  if (!auditLog.length) {
    list.innerHTML = renderEmpty("No audit activity has been recorded yet.");
    return;
  }
  // Apply quick-action filter
  let rendered = auditLog;
  if (adminAuditFilter && adminAuditFilter !== 'all') {
    if (adminAuditFilter === 'pending') rendered = rendered.filter(e => e.status === 'pending' || (e.action_type && e.action_type.toLowerCase().includes('pending')));
    else if (adminAuditFilter === 'rejected') rendered = rendered.filter(e => e.status === 'rejected' || (e.action_type && e.action_type.toLowerCase().includes('rejected')));
    else if (adminAuditFilter === 'approved') rendered = adminState.approvedApps.map(a => ({ action_type: 'Approved Application', timestamp: a.approved_at || a.updated_at || a.created_at, status: 'approved', error_message: `${a.organization_name || a.orgName || 'Organisation'} — ${a.contact_email || a.contactEmail || ''}`, details: JSON.stringify(a) }));
    else if (adminAuditFilter === 'checks') rendered = adminState.checks.map(c => ({ action_type: 'Certificate Check', timestamp: c.checked_at || c.checkedAt || c.timestamp, status: c.verification_status || c.status || 'info', error_message: c.verification_message || c.message || '', details: JSON.stringify(c) }));
    else if (adminAuditFilter === 'revoked') rendered = adminState.revoked.map(r => ({ action_type: 'Revoked Certificate', timestamp: r.revoked_at || r.revokedAt || r.timestamp, status: 'revoked', error_message: r.reason || r.message || '', details: JSON.stringify(r) }));
    else if (adminAuditFilter === 'audit') rendered = auditLog;
  }

  list.innerHTML = rendered.map(entry => `
    <div class="admin-list-card">
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
        <div>
          <div style="font-size:15px;font-weight:800;color:var(--text-primary);">${entry.action_type || entry.action || 'Action'}</div>
          <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">${formatDateTime(entry.timestamp)}</div>
        </div>
        <div class="admin-status-pill ${entry.status === 'failed' || entry.status === 'rejected' ? 'danger' : entry.status === 'pending' ? 'warning' : entry.status === 'approved' ? 'success' : 'info'}">${entry.status || 'info'}</div>
      </div>
      <div style="margin-top:14px;color:var(--text-secondary);font-size:13px;">${entry.error_message || entry.details || 'No additional details.'}</div>
      ${entry.status === 'pending' ? `<div style="margin-top:10px;display:flex;gap:8px"><button class="btn-success" data-action="approve" data-id="${entry.id || ''}">Approve</button><button class="btn-danger" data-action="reject" data-id="${entry.id || ''}">Reject</button></div>` : ''}
    </div>
  `).join('');

  // bind action buttons where present
  list.querySelectorAll('button[data-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      const id = button.dataset.id;
      if (!id) return;
      if (action === 'approve' || action === 'reject') handleApplicationAction(action, id);
    });
  });
}

async function handleCreateAccountForApplication(id) {
  try {
    const data = await requestJson(`/applications/${id}/create-account`, { method: 'POST' });
    if (data.success && data.credentials) {
      alert(`Issuer account created:\nEmail: ${data.credentials.email}\nPassword: ${data.credentials.password}`);
    } else if (data.success && data.user) {
      alert(`Existing account linked for ${data.user.email}`);
    }
    await loadAdminDashboard();
  } catch (err) {
    showAdminError(err.message);
  }
}

async function handleApplicationAction(action, id) {
  try {
    const endpoint = action === "approve" ? `/applications/${id}/approve` : `/applications/${id}/reject`;
    await requestJson(endpoint, { method: "PUT" });
    await loadAdminDashboard();
  } catch (err) {
    showAdminError(err.message);
  }
}

async function handleRevokeAction(id) {
  try {
    await requestJson(`/verify/${id}/revoke`, { method: "PUT" });
    await loadAdminDashboard();
  } catch (err) {
    showAdminError(err.message);
  }
}

async function loadAdminDashboard() {
  try {
    const [dashboardData, pendingData, rejectedData, historyData, revokedData, auditData] = await Promise.all([
      requestJson("/admin/dashboard"),
      requestJson("/applications/pending?limit=50&offset=0"),
      requestJson("/applications/rejected?limit=50&offset=0"),
      requestJson("/verify/history?limit=50&offset=0"),
      requestJson("/verify/revoked?limit=50&offset=0"),
      requestJson("/admin/audit-log?limit=50&offset=0")
    ]);

    adminState.stats = dashboardData.stats || null;
    adminState.pendingApps = pendingData.applications || [];
    adminState.rejectedApps = rejectedData.applications || [];
    adminState.checks = historyData.history || [];
    adminState.revoked = revokedData.revoked || [];
    adminState.auditLog = auditData.auditLog || [];

    // approved apps endpoint may not exist on all backends; fetch defensively
    try {
      const approvedData = await requestJson('/applications/approved?limit=50&offset=0');
      adminState.approvedApps = approvedData.applications || [];
    } catch (e) {
      adminState.approvedApps = [];
    }

    await requestJson("/admin/access-log", {
      method: "POST",
      body: JSON.stringify({ section: adminCurrentSection, method: "dashboard" })
    });

    renderAdminDashboard();
  } catch (err) {
    showAdminError(err.message);
  }
}

async function loginAdmin(event) {
  event.preventDefault();
  const emailInput = document.getElementById("adminEmail");
  const passwordInput = document.getElementById("adminPassword");
  const email = emailInput?.value?.trim() || "";
  const password = passwordInput?.value || "";

  if (!email || !password) {
    showAdminError("Enter both your admin email and password.");
    return;
  }

  try {
    const data = await requestJson("/auth/admin/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    if (data.user?.user_type !== "admin") {
      throw new Error("This account is not an admin account.");
    }

    adminState.token = data.token;
    adminState.user = data.user;
    // store admin token separately from regular user token
    localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
    localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(data.user));
    setAdminState(true, data.user);
  } catch (err) {
    // If backend is unreachable or login fails, provide clearer feedback.
    if (err.message && err.message.toLowerCase().includes('failed to fetch')) {
      showAdminError('Unable to reach backend API. Ensure the backend is running at the expected API URL.');
    } else {
      showAdminError(err.message || 'Login failed.');
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("adminLoginForm");
  const logoutBtn = document.getElementById("adminLogoutBtn");
  const returnBtn = document.getElementById("adminReturnBtn");

  loginForm?.addEventListener("submit", loginAdmin);
  // Wire logout button in navbar/menu
  logoutBtn?.addEventListener("click", () => setAdminState(false));
  returnBtn?.addEventListener("click", () => window.location.href = "index.html");

  const storedUser = localStorage.getItem(ADMIN_USER_KEY);
  if (storedUser) {
    adminState.user = JSON.parse(storedUser);
  }

  if (isAdminLoggedIn()) {
    setAdminState(true, adminState.user);
  }
  // show sign out in navbar if logged in
  if (logoutBtn && isAdminLoggedIn()) logoutBtn.style.display = 'inline-block';
  // bind quick actions after DOM ready
  try { bindQuickActions(); } catch (e) { /* ignore */ }
  // navbar profile menu
  const profileToggle = document.getElementById('adminProfileToggle');
  const profileMenu = document.getElementById('adminProfileMenu');
  const menuSignOut = document.getElementById('menuSignOut');
  const navAdminName = document.getElementById('navAdminName');
  const navAdminEmail = document.getElementById('navAdminEmail');
  const menuName = document.getElementById('menuName');
  const menuEmail = document.getElementById('menuEmail');

  if (profileToggle && profileMenu) {
    profileToggle.addEventListener('click', () => {
      profileMenu.style.display = profileMenu.style.display === 'block' ? 'none' : 'block';
    });
  }

  if (menuSignOut) {
    menuSignOut.addEventListener('click', () => setAdminState(false));
  }

  // update navbar profile when state present
  if (adminState.user) {
    try {
      const name = adminState.user.first_name ? `${adminState.user.first_name} ${adminState.user.last_name || ''}`.trim() : (adminState.user.email || 'Admin');
      if (navAdminName) navAdminName.textContent = name;
      if (menuName) menuName.textContent = name;
      if (navAdminEmail) navAdminEmail.textContent = adminState.user.email || '';
      if (menuEmail) menuEmail.textContent = adminState.user.email || '';
    } catch (e) {}
  }
});
