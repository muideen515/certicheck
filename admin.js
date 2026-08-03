"use strict";

const API_BASE_URL = "http://localhost:5000/api";
const ADMIN_SESSION_KEY = "certicheck_admin_logged_in";
const ADMIN_TOKEN_KEY = "certicheck_admin_token";
const ADMIN_USER_KEY = "certicheck_admin_user";
const ADMIN_SECTIONS = [
  { id: "pending", label: "Pending approvals" },
  { id: "rejected", label: "Rejected requests" },
  { id: "checks", label: "Past certificate checks" },
  { id: "revoked", label: "Revoked certificates" },
  { id: "audit", label: "Audit log" },
];

let adminCurrentSection = "pending";
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

  if (enabled) {
    sessionStorage.setItem(ADMIN_SESSION_KEY, "1");
    loginCard.style.display = "none";
    dashboard.style.display = "block";
    clearAdminError();
    if (welcome) {
      welcome.textContent = user?.first_name || user?.email || "Admin";
    }
    renderAdminTabs();
    loadAdminDashboard();
  } else {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
    adminState.token = "";
    adminState.user = null;
    loginCard.style.display = "block";
    dashboard.style.display = "none";
    clearAdminError();
  }
}

function renderAdminTabs() {
  const tabs = document.getElementById("adminTabs");
  if (!tabs) return;

  tabs.innerHTML = ADMIN_SECTIONS.map(section => `
    <button class="admin-tab-button${adminCurrentSection === section.id ? " active" : ""}" data-section="${section.id}">
      ${section.label}
    </button>
  `).join("");

  tabs.querySelectorAll("button[data-section]").forEach(button => {
    button.addEventListener("click", () => setAdminSection(button.dataset.section));
  });
}

function setAdminSection(section) {
  if (!ADMIN_SECTIONS.some(item => item.id === section)) return;
  adminCurrentSection = section;
  document.querySelectorAll(".admin-tab-button").forEach(button => {
    button.classList.toggle("active", button.dataset.section === section);
  });
  renderAdminDashboard();
}

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

  if (adminCurrentSection === "pending") {
    const pending = adminState.pendingApps || [];
    summary.textContent = `${pending.length} pending application${pending.length === 1 ? "" : "s"}`;
    intro.textContent = "Approve issuer requests and grant certificate issuance access.";

    if (!pending.length) {
      list.innerHTML = renderEmpty("No issuer applications are waiting for approval.");
      return;
    }

    list.innerHTML = pending.map(app => `
      <div class="resource-card" style="padding:22px 24px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text-primary);">${app.organization_name || app.orgName || "Unknown organisation"}</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">${app.organization_type || app.orgType || "—"} · ${app.organization_website || app.orgWebsite || "No website provided"}</div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;">
            <button class="btn-primary" data-action="approve" data-id="${app.id}">Approve</button>
            <button class="btn-ghost" data-action="reject" data-id="${app.id}">Reject</button>
          </div>
        </div>
        <div style="margin-top:14px;display:grid;grid-template-columns:repeat(2,minmax(140px,1fr));gap:12px;">
          <div><strong>Contact</strong><br/>${app.contact_name || app.contactName || "-"}<br/><a href="mailto:${app.contact_email || app.contactEmail || ""}" style="color:var(--purple-mid);">${app.contact_email || app.contactEmail || "-"}</a></div>
          <div><strong>Role</strong><br/>${app.contact_role || app.contactRole || "-"}</div>
          <div><strong>Volume</strong><br/>${app.certificate_volume || app.volume || "-"}</div>
          <div><strong>Wallet</strong><br/>${app.wallet_address || app.wallet || "Optional"}</div>
        </div>
        <div style="margin-top:14px;color:var(--text-secondary);font-size:13px;">${app.use_case || app.useCase || "No use case described."}</div>
      </div>
    `).join("");
  } else if (adminCurrentSection === "rejected") {
    const rejected = adminState.rejectedApps || [];
    summary.textContent = `${rejected.length} rejected request${rejected.length === 1 ? "" : "s"}`;
    intro.textContent = "Review rejected issuer applications and re-open them if needed.";

    if (!rejected.length) {
      list.innerHTML = renderEmpty("There are no rejected requests at the moment.");
      return;
    }

    list.innerHTML = rejected.map(app => `
      <div class="resource-card" style="padding:22px 24px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text-primary);">${app.organization_name || app.orgName || "Unknown organisation"}</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">${app.organization_type || app.orgType || "—"} · ${app.organization_website || app.orgWebsite || "No website provided"}</div>
          </div>
          <div style="font-size:13px;color:var(--red);font-weight:700;">Rejected</div>
        </div>
        <div style="margin-top:14px;display:grid;grid-template-columns:repeat(2,minmax(140px,1fr));gap:12px;">
          <div><strong>Contact</strong><br/>${app.contact_name || app.contactName || "-"}<br/><a href="mailto:${app.contact_email || app.contactEmail || ""}" style="color:var(--purple-mid);">${app.contact_email || app.contactEmail || "-"}</a></div>
          <div><strong>Role</strong><br/>${app.contact_role || app.contactRole || "-"}</div>
          <div><strong>Volume</strong><br/>${app.certificate_volume || app.volume || "-"}</div>
          <div><strong>Wallet</strong><br/>${app.wallet_address || app.wallet || "Optional"}</div>
        </div>
      </div>
    `).join("");
  } else if (adminCurrentSection === "checks") {
    const checks = adminState.checks || [];
    summary.textContent = `${checks.length} certificate check${checks.length === 1 ? "" : "s"}`;
    intro.textContent = "Review recent certificate verification activity and revoke certificates when needed.";

    if (!checks.length) {
      list.innerHTML = renderEmpty("No certificate checks have been performed yet.");
      return;
    }

    list.innerHTML = checks.map(item => `
      <div class="resource-card" style="padding:22px 24px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text-primary);">${item.certificate_id || item.certId || "Unknown certificate"}</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">${formatDateTime(item.checked_at || item.checkedAt)}</div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;align-items:center;">
            <span style="font-size:13px;font-weight:700;color:${item.verification_status === "revoked" ? "var(--red)" : item.verification_status === "valid" ? "#059669" : "var(--text-secondary)"};text-transform:capitalize;">${item.verification_status || item.status || "unknown"}</span>
            ${item.verification_status !== "revoked" ? `<button class="btn-ghost" data-action="revoke" data-id="${item.id}">Revoke</button>` : ""}
          </div>
        </div>
        <div style="margin-top:14px;color:var(--text-secondary);font-size:13px;">Result details: ${item.verification_message || item.message || "No details provided."}</div>
      </div>
    `).join("");
  } else if (adminCurrentSection === "revoked") {
    const revoked = adminState.revoked || [];
    summary.textContent = `${revoked.length} revoked certificate${revoked.length === 1 ? "" : "s"}`;
    intro.textContent = "Manage certificates that were flagged as revoked.";

    if (!revoked.length) {
      list.innerHTML = renderEmpty("No revoked certificates exist yet.");
      return;
    }

    list.innerHTML = revoked.map(item => `
      <div class="resource-card" style="padding:22px 24px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text-primary);">${item.certificate_id || item.certId || "Unknown certificate"}</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">Revoked on ${formatDateTime(item.revoked_at || item.revokedAt)}</div>
          </div>
          <div style="font-size:13px;color:var(--red);font-weight:700;">Revoked</div>
        </div>
        <div style="margin-top:14px;color:var(--text-secondary);font-size:13px;">${item.verification_message || item.message || "No details provided."}</div>
      </div>
    `).join("");
  } else if (adminCurrentSection === "audit") {
    const auditLog = adminState.auditLog || [];
    summary.textContent = `${auditLog.length} recent audit entr${auditLog.length === 1 ? "y" : "ies"}`;
    intro.textContent = "Review privileged admin activity and audit history.";

    if (!auditLog.length) {
      list.innerHTML = renderEmpty("No audit activity has been recorded yet.");
      return;
    }

    list.innerHTML = auditLog.map(entry => `
      <div class="resource-card" style="padding:22px 24px;margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start;">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--text-primary);">${entry.action_type || entry.action || "Action"}</div>
            <div style="font-size:13px;color:var(--text-secondary);margin-top:4px;">${formatDateTime(entry.timestamp)}</div>
          </div>
          <div style="font-size:13px;font-weight:700;color:${entry.status === "failed" ? "var(--red)" : "#059669"};">${entry.status || "success"}</div>
        </div>
        <div style="margin-top:14px;color:var(--text-secondary);font-size:13px;">${entry.error_message || "No additional details."}</div>
      </div>
    `).join("");
  }

  list.querySelectorAll("button[data-action]").forEach(button => {
    button.addEventListener("click", () => {
      const action = button.dataset.action;
      const id = button.dataset.id;
      if (action === "approve" || action === "reject") {
        handleApplicationAction(action, id);
      } else if (action === "revoke") {
        handleRevokeAction(id);
      }
    });
  });
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
      requestJson("/admin/audit-log?limit=20&offset=0")
    ]);

    adminState.stats = dashboardData.stats || null;
    adminState.pendingApps = pendingData.applications || [];
    adminState.rejectedApps = rejectedData.applications || [];
    adminState.checks = historyData.history || [];
    adminState.revoked = revokedData.revoked || [];
    adminState.auditLog = auditData.auditLog || [];

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
    const data = await requestJson("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });

    if (data.user?.user_type !== "admin") {
      throw new Error("This account is not an admin account.");
    }

    adminState.token = data.token;
    adminState.user = data.user;
    localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
    localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(data.user));
    setAdminState(true, data.user);
  } catch (err) {
    showAdminError(err.message);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const loginForm = document.getElementById("adminLoginForm");
  const logoutBtn = document.getElementById("adminLogoutBtn");
  const returnBtn = document.getElementById("adminReturnBtn");

  loginForm?.addEventListener("submit", loginAdmin);
  logoutBtn?.addEventListener("click", () => setAdminState(false));
  returnBtn?.addEventListener("click", () => window.location.href = "index.html");

  const storedUser = localStorage.getItem(ADMIN_USER_KEY);
  if (storedUser) {
    adminState.user = JSON.parse(storedUser);
  }

  if (isAdminLoggedIn()) {
    setAdminState(true, adminState.user);
  }
});
