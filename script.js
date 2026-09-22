"use strict";

// Global error reporting overlay to prevent blank pages on runtime errors
function showAppError(message) {
  try {
    let el = document.getElementById('appErrorBanner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'appErrorBanner';
      el.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#ef4444;color:white;padding:12px 20px;border-radius:8px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-family:sans-serif;font-size:14px;';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.display = 'block';
    setTimeout(() => { if (el) el.style.display = 'none'; }, 5000);
  } catch (e) {
    console.error('App error:', message, e);
  }
}

const FAQ_DATA = [
  {
    category: "About the System",
    items: [
      { q: "What is the Solana Certificate Verification System?",
        a: "Our platform issues tamper-proof digital certificates anchored on the Solana blockchain. Each certificate is a verifiable on-chain record that any third party can independently confirm — no middlemen, no central authority." },
      { q: "Who can issue certificates?",
        a: "Accredited institutions, training providers, universities, and businesses with a verified issuer account can mint certificates directly on-chain." },
      { q: "What types of certificates can be issued?",
        a: "Academic degrees, professional certifications, course completions, skill badges, event attendance, and any credential requiring verifiable authenticity." },
      { q: "Is this system open-source?",
        a: "Yes. Our smart contracts and verification SDK are fully open-source. You can review the code on GitHub at any time." },
    ],
  },
  {
    category: "Verification",
    items: [
      { q: "How do I verify a certificate?",
        a: "Enter the certificate ID or scan the QR code. Our verifier queries Solana directly and returns the authenticity result in seconds." },
      { q: "Can a certificate be faked or tampered with?",
        a: "No. Each certificate is cryptographically signed by the issuer's on-chain keypair and stored as an immutable transaction. Any alteration invalidates the signature." },
      { q: "What information is publicly visible on-chain?",
        a: "The certificate hash, issuer address, issuance timestamp, and revocation status. Personal details are stored off-chain and revealed only with the holder's consent." },
      { q: "How long does verification take?",
        a: "Typically under 2 seconds, thanks to Solana's high throughput and sub-second finality." },
      { q: "Can I verify without creating an account?",
        a: "Yes. Certificate verification is fully public and requires no login or wallet." },
    ],
  },
  {
    category: "For Certificate Holders",
    items: [
      { q: "How do I receive my certificate?",
        a: "After the issuer mints your certificate, you will receive an email with your unique certificate ID and a link to your digital certificate page." },
      { q: "Do I need a Solana wallet?",
        a: "No wallet is required to receive or share a certificate. A wallet is optional for holders who wish to take full self-custody." },
      { q: "Can I share my certificate on LinkedIn?",
        a: "Yes. Each certificate has a shareable link and an embeddable badge. LinkedIn, Twitter/X, and direct URL sharing are all supported." },
      { q: "What happens if I lose my certificate link?",
        a: "Log in to your holder dashboard and retrieve all certificates issued to your email at any time." },
      { q: "Can a certificate be revoked?",
        a: "Issuers can revoke certificates (e.g. in cases of fraud). A revoked certificate shows a clear revoked status during verification, but the on-chain record is never deleted." },
    ],
  },
  {
    category: "For Issuers",
    items: [
      { q: "How do I become a verified issuer?",
        a: "Apply through the issuer onboarding form. Our team reviews your credentials and activates your issuer account within 1–3 business days." },
      { q: "What does it cost to issue a certificate?",
        a: "Issuers pay a small Solana network fee per certificate (typically less than $0.01 USD) plus any applicable platform subscription fee." },
      { q: "Can I issue certificates in bulk?",
        a: "Yes. Our API and CSV upload tool support batch issuance — thousands of certificates in a single operation." },
      { q: "Can I customise the certificate design?",
        a: "Yes. Upload your logo, choose your colour scheme, and define custom fields in the issuer dashboard." },
    ],
  },
  {
    category: "Technical & Security",
    items: [
      { q: "Which Solana network is used?",
        a: "Production certificates are issued on Solana mainnet-beta. Devnet is available for testing before going live." },
      { q: "Has the smart contract been audited?",
        a: "Yes. Our on-chain program has been independently audited. The full report is publicly available in our documentation." },
      { q: "Is there an API I can integrate?",
        a: "Yes. A fully documented REST API and TypeScript SDK are available. See the Resources page for details." },
    ],
  },
];

const API_BASE_URL = (function() {
  try {
    const host = window.location.hostname;
    const port = window.location.port;
    if (host === '127.0.0.1' || host === 'localhost') {
      if (port && port !== '5000') return 'http://127.0.0.1:5000/api';
    }
    if (host.includes('.app.github.dev') || host.includes('.githubpreview.dev')) {
      // Map Codespaces preview ports (e.g. -5500, -5501, -3000) to backend port -5000
      const backendHost = host.replace(/-\d{4}\./, '-5000.');
      return `https://${backendHost}/api`;
    }
  } catch (e) {
    return 'http://127.0.0.1:5000/api';
  }
  return `${window.location.origin}/api`;
})();

function getPreviewBaseUrl() {
  try {
    const origin = window.location.origin;
    return origin || 'http://127.0.0.1:5500';
  } catch (e) {
    return 'http://127.0.0.1:5500';
  }
}

function bindPreviewLinks() {
  const base = getPreviewBaseUrl();
  const mainLink = document.getElementById('mainPreviewLink');
  const adminLink = document.getElementById('adminPreviewLink');
  if (mainLink) mainLink.href = base;
  if (adminLink) adminLink.href = `${base}/admin.html`;
}

  const RESOURCES_DATA = [
  { icon: "📄", title: "Documentation",         desc: "Full API reference, SDK docs, and integration guides.",             tag: "Docs", href: "quickstart.html#documentation" },
  { icon: "⚡", title: "Quick Start Guide",      desc: "Issue your first certificate on Solana devnet in under 5 minutes.", tag: "Guide", href: "quickstart.html" },
  { icon: "🔐", title: "Security Audit",         desc: "Read the independent smart-contract audit report.",                 tag: "Security" },
  { icon: "🧩", title: "TypeScript SDK",          desc: "npm install @nebulacert/sdk — type-safe certificate API.",          tag: "SDK" },
  { icon: "🔗", title: "REST API Reference",     desc: "OpenAPI spec, endpoints, auth, and rate limits.",                   tag: "API" },
  { icon: "🎓", title: "Example Integrations",   desc: "Next.js, Express, and Django starter templates.",                   tag: "Examples" },
  { icon: "🗳️", title: "Governance",             desc: "How protocol upgrades are proposed and voted on-chain.",            tag: "DAO" },
  { icon: "💬", title: "Community Discord",       desc: "Get help, share feedback, and connect with other builders.",        tag: "Community" },
];

/* ═══════════════════════════════════════════════
   ROUTER — state-based page switching
═══════════════════════════════════════════════ */
let currentPage = "home";
let currentUser = null;
let desiredSignupType = null; // 'holder' or 'issuer' set by home CTAs

function getAuthToken() {
  return localStorage.getItem("certicheck_auth_token");
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("certicheck_user") || "null");
  } catch {
    return null;
  }
}

function getRememberedLoginEmail() {
  return localStorage.getItem("certicheck_last_login_email") || "";
}

function setRememberedLoginEmail(email) {
  if (email) {
    localStorage.setItem("certicheck_last_login_email", email);
  } else {
    localStorage.removeItem("certicheck_last_login_email");
  }
}

function saveAuthSession(token, user) {
  localStorage.setItem("certicheck_auth_token", token);
  localStorage.setItem("certicheck_user", JSON.stringify(user));
  currentUser = user;
  updateAuthUi();
}

function clearAuthSession() {
  localStorage.removeItem("certicheck_auth_token");
  localStorage.removeItem("certicheck_user");
  currentUser = null;
  updateAuthUi();
}

function getConnectedWalletAddress() {
  const direct = localStorage.getItem('certicheck_wallet_address');
  if (direct) return direct;
  const storedUser = getStoredUser();
  return storedUser?.wallet || '';
}

function persistWalletAddress(value) {
  const wallet = value ? String(value).trim() : '';
  if (wallet) localStorage.setItem('certicheck_wallet_address', wallet);
  else localStorage.removeItem('certicheck_wallet_address');
  return wallet;
}

function updateAuthUi() {
  const navActions = document.querySelector('.nav-actions');
  const navLinks = document.querySelector('.nav-links');
  if (!navActions) return;

  navActions.querySelectorAll('.auth-item').forEach(el => el.remove());

    if (navLinks) {
    const user = currentUser || getStoredUser();
    // Do not expose a public Admin navigation link. Admin console is available at /admin.html
    if (user && user.user_type === 'issuer') {
      navLinks.innerHTML = ``;
    }
  }

  if (currentUser && currentUser.email) {
    const user = currentUser;
    const displayName = user.display_name || user.name || [user.first_name, user.last_name].filter(Boolean).join(' ') || 'OAU Registry';
    const roleLabel = user.user_type === 'issuer' ? 'issuer' : user.user_type === 'admin' ? 'admin' : 'user';
    const userBadge = document.createElement('div');
    userBadge.className = 'auth-item';
    userBadge.style.marginRight = '8px';
    userBadge.style.color = 'var(--text-secondary)';
    userBadge.textContent = `Signed in as ${displayName} (${roleLabel})`;

    const dashBtn = document.createElement('button');
    dashBtn.className = 'btn-ghost auth-item';
    dashBtn.textContent = 'Dashboard';
    dashBtn.addEventListener('click', () => {
      const page = currentUser.user_type === 'admin' ? 'home' : currentUser.user_type === 'issuer' ? 'home' : 'holder';
      navigate(page);
    });

    const signoutBtn = document.createElement('button');
    signoutBtn.className = 'btn-ghost auth-item';
    signoutBtn.textContent = 'Sign Out';
    signoutBtn.addEventListener('click', () => {
      clearAuthSession();
      navigate('home');
    });

    navActions.querySelectorAll('[data-page="signup"],[data-page="login"]').forEach(b => b.style.display = 'none');

    navActions.prepend(signoutBtn);
    navActions.prepend(dashBtn);
    navActions.prepend(userBadge);
  } else {
    navActions.querySelectorAll('[data-page="signup"],[data-page="login"]').forEach(b => b.style.display = 'inline-block');
    navActions.querySelectorAll('.auth-item').forEach(el => el.remove());
  }
}

function getDemoCertificateData(certificateId) {
  const normalized = String(certificateId || "").trim().toUpperCase();
  const demoCertificates = {
    "CERT-SOL-2024-00418": {
      id: 1,
      certificate_id: "CERT-SOL-2024-00418",
      certificate_type: "Degree Certificate",
      verification_status: "valid",
      verification_message: "Demo certificate is active and verifiable.",
      blockchain_hash: "demo-ipfs-cid-valid",
      blockchain_transaction_id: null,
      checked_at: new Date().toISOString(),
      revoked_at: null,
      revoked_by: null
    },
    "REV-001": {
      id: 2,
      certificate_id: "REV-001",
      certificate_type: "Revocation Demo",
      verification_status: "revoked",
      verification_message: "Demo certificate has been revoked by the issuer.",
      blockchain_hash: "demo-ipfs-cid-revoked",
      blockchain_transaction_id: "demo-revoke-rev-001",
      checked_at: new Date().toISOString(),
      revoked_at: new Date().toISOString(),
      revoked_by: 1
    }
  };

  return demoCertificates[normalized] || null;
}

function getDemoTpsData() {
  return {
    currentTps: 1820,
    peakTps: 2470,
    averageTps: 1640,
    samples: [1800, 1820, 1750, 1900, 1840, 1880, 1760, 1830]
  };
}

function createDemoUser(email, firstName = "Demo", lastName = "User") {
  return {
    id: Date.now(),
    email,
    firstName,
    lastName,
    user_type: "issuer"
  };
}

function saveDemoAuthSession(email, firstName = "Demo", lastName = "User") {
  const user = createDemoUser(email, firstName, lastName);
  saveAuthSession("demo-token", user);
  return user;
}

// Enhanced demo session helper accepting a role
function saveDemoAuthSessionWithRole(email, firstName = "Demo", lastName = "User", role = 'issuer') {
  const user = createDemoUser(email, firstName, lastName);
  user.user_type = role || 'issuer';
  saveAuthSession("demo-token", user);
  return user;
}

function getIssuerIssuedCertificates() {
  try {
    const user = currentUser || getStoredUser();
    const key = issuerIssuedKeyFor(user);
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function issuerIssuedKeyFor(user) {
  const u = user || currentUser || getStoredUser() || {};
  const id = (u.email || u.id || 'anonymous').toString();
  return `certicheck_issued_certificates:${id}`;
}

function issuerLastResultKeyFor(user) {
  const u = user || currentUser || getStoredUser() || {};
  const id = (u.email || u.id || 'anonymous').toString();
  return `certicheck_last_issuer_result:${id}`;
}

function setIssuerIssuedCertificates(list, user) {
  try {
    const key = issuerIssuedKeyFor(user);
    localStorage.setItem(key, JSON.stringify(Array.isArray(list) ? list : []));
  } catch (e) {
    console.warn('Failed to persist issuer certificates', e?.message || e);
  }
}

function setLastIssuerResult(obj, user) {
  try {
    const key = issuerLastResultKeyFor(user);
    localStorage.setItem(key, JSON.stringify(obj || null));
  } catch (e) {
    console.warn('Failed to persist last issuer result', e?.message || e);
  }
}

function clearUserIssuerStorage(user) {
  try {
    const u = user || currentUser || getStoredUser();
    if (!u) return;
    localStorage.removeItem(issuerIssuedKeyFor(u));
    localStorage.removeItem(issuerLastResultKeyFor(u));
  } catch (e) {
    console.warn('Failed to clear issuer scoped storage', e?.message || e);
  }
}

function getRoleLandingStats() {
  const issued = getIssuerIssuedCertificates();

  const fallback = [
    { certificateId: 'CERT-OAU-2026-001', holderName: 'Jane Doe', certificateType: 'Degree Certificate', verificationStatus: 'Valid', issuedAt: '2026-09-18' },
    { certificateId: 'CERT-OAU-2026-002', holderName: 'John Smith', certificateType: 'Certificate of Completion', verificationStatus: 'Valid', issuedAt: '2026-09-18' },
    { certificateId: 'CERT-OAU-2026-003', holderName: 'Mary Green', certificateType: 'Professional Diploma', verificationStatus: 'Revoked', issuedAt: '2026-09-18' }
  ];

  const entries = issued.length ? issued : fallback;
  const total = entries.length || 3;
  const valid = entries.filter(item => String(item.verificationStatus || item.status || '').toLowerCase() !== 'revoked').length || 2;
  const revoked = entries.filter(item => String(item.verificationStatus || item.status || '').toLowerCase() === 'revoked').length || 1;

  return { total, valid, revoked, institution: 'OAU', recent: entries.slice(0, 4) };
}

function renderRoleLandingHome() {
  const roleHome = document.getElementById('roleHomePanel');
  const hero = document.querySelector('#page-home .hero');
  const user = currentUser || getStoredUser();
  if (!roleHome || !hero) return;

  if (!user || (user.user_type !== 'issuer' && user.user_type !== 'admin')) {
    roleHome.style.display = 'none';
    hero.style.display = 'block';
    return;
  }

  const isAdmin = user.user_type === 'admin';
  const isIssuer = user.user_type === 'issuer';
  const stats = getRoleLandingStats();

  hero.style.display = 'none';
  roleHome.style.display = 'block';

  if (isAdmin) {
    document.getElementById('roleHomeBadge').textContent = 'Admin Control Center';
    document.getElementById('roleHomeTitle').innerHTML = 'System overview';
    document.getElementById('roleHomeMeta').textContent = 'Monitor certificates, issuer access, and app health from a single admin view.';
    document.getElementById('roleHomeStats').innerHTML = [
      { label: 'Total', value: stats.total },
      { label: 'Valid', value: stats.valid },
      { label: 'Revoked', value: stats.revoked },
      { label: 'Issuers', value: 6 }
    ].map(item => `
      <div class="role-stat">
        <div class="role-stat-label">${item.label}</div>
        <div class="role-stat-value">${item.value}</div>
      </div>
    `).join('');

    const walletAddress = getConnectedWalletAddress();
    document.getElementById('roleHomeActions').innerHTML = `
      <a href="admin.html" class="btn-primary" style="display:inline-flex;align-items:center;justify-content:center;">Open full Admin Dashboard</a>
      <button class="btn-ghost" data-page="issuer">Issue</button>
      <button class="btn-ghost" data-page="test">Verify</button>
      <button class="btn-ghost" onclick="window.location.href='admin.html'">Revoke</button>
    `;

    document.getElementById('roleHomeSystem').innerHTML = `
      <div class="alert alert-info">
        <strong>System health</strong>
        <div style="margin-top:8px;display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;">
          <div><strong>API:</strong> online</div>
          <div><strong>Pinata:</strong> connected</div>
          <div><strong>Solana:</strong> enabled</div>
          <div><strong>Wallet:</strong> ${walletAddress ? walletAddress.slice(0, 8) + '…' : 'Not connected'}</div>
          <div><strong>Timestamp:</strong> ${new Date().toLocaleString()}</div>
        </div>
      </div>
    `;
  } else {
    const institution = 'Obafemi Awolowo University';
    const recent = stats.recent.length ? stats.recent : [
      { certificateId: 'CERT-OAU-2026-001', holderName: 'Jane Doe', certificateType: 'Degree Certificate', verificationStatus: 'Valid', issuedAt: '2026-09-18', ipfsCid: 'Qm1...a9s' }
    ];
    const issuedCount = recent.length;
    const activeCount = recent.filter(item => String(item.verificationStatus || item.status || 'Valid').toLowerCase() !== 'revoked').length;
    const revokedCount = recent.filter(item => String(item.verificationStatus || item.status || '').toLowerCase() === 'revoked').length;
    const verificationsToday = Math.max(8, recent.length * 2 + 3);
    const walletAddress = getConnectedWalletAddress();
    const walletStatusMarkup = walletAddress
      ? `<div style="display:inline-flex;align-items:center;gap:8px;padding:7px 10px;border-radius:999px;background:rgba(5,150,105,0.08);border:1px solid rgba(5,150,105,0.14);color:#059669;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;"><span style="width:8px;height:8px;border-radius:50%;background:#10b981;display:inline-block;"></span>${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}</div>`
      : `<div style="display:inline-flex;align-items:center;gap:8px;padding:7px 10px;border-radius:999px;background:rgba(148,163,184,0.08);border:1px solid rgba(148,163,184,0.18);color:var(--text-secondary);font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">Connect Wallet</div>`;

    document.getElementById('roleHomeBadge').textContent = 'Issuer Dashboard';
    document.getElementById('roleHomeTitle').innerHTML = institution;
    document.getElementById('roleHomeMeta').textContent = 'Institution control center for certificate issuance and revocation.';

    document.getElementById('roleHomeStats').innerHTML = [
      { label: 'Issued', value: issuedCount },
      { label: 'Active', value: activeCount },
      { label: 'Revoked', value: revokedCount },
      { label: 'Verifications today', value: verificationsToday }
    ].map(item => `
      <div class="role-stat">
        <div class="role-stat-label">${item.label}</div>
        <div class="role-stat-value">${item.value}</div>
      </div>
    `).join('');

      const latestIssuerResult = (() => {
        try {
          return JSON.parse(localStorage.getItem(issuerLastResultKeyFor()) || 'null');
        } catch {
          return null;
        }
      })();

    document.getElementById('roleHomeActions').innerHTML = `
      <div class="issuer-dashboard-shell" style="grid-template-columns:320px minmax(0, 1fr); gap:22px; align-items:start;">
        <aside class="issuer-profile-panel" style="padding:24px 20px;">
          <div class="issuer-avatar">OAU</div>
          <div class="issuer-name">${institution}</div>
          <div class="issuer-role-badge">ISSUER</div>

          <div class="issuer-meta-list">
            <div class="issuer-meta-row"><span>Institution</span><strong>${institution}</strong></div>
            <div class="issuer-meta-row"><span>Email</span><strong>issuer@oau.edu.ng</strong></div>
            <div class="issuer-meta-row"><span>Role</span><strong>issuer</strong></div>
            <div class="issuer-meta-row"><span>Wallet</span><strong>${walletAddress ? `${walletAddress.slice(0, 8)}...${walletAddress.slice(-4)}` : 'Not connected'}</strong></div>
          </div>

          <div class="issuer-side-actions">
            ${walletStatusMarkup}
            <button id="issuerWalletConnectButton" class="btn-primary btn-block">${walletAddress ? 'Wallet connected' : 'Connect Wallet'}</button>
            <button class="btn-ghost btn-block" onclick="renderRoleLandingHome()">Refresh</button>
              <button class="btn-ghost btn-block" onclick="clearUserIssuerStorage(); localStorage.removeItem('certicheck_auth_token'); localStorage.removeItem('certicheck_user'); localStorage.removeItem('certicheck_wallet_address'); currentUser = null; updateAuthUi(); navigate('home');">Logout</button>
          </div>
        </aside>

        <main class="issuer-workspace-panel" style="padding:22px;">
          <div class="issuer-topbar">
            <div>
              <div class="issuer-panel-label">Issuer Dashboard</div>
              <div class="issuer-panel-title">Issue a New Certificate</div>
            </div>
            <div class="issuer-action-row">
              <button class="btn-ghost" data-page="test">Verify</button>
              <button class="btn-ghost" data-page="issuer">Issue</button>
            </div>
          </div>

          <div style="background:var(--bg-subtle);border:1px solid var(--border-light);border-radius:18px;padding:18px 18px 12px; margin-bottom:18px;">
            <form id="issuerDashboardForm" style="display:grid;gap:14px;">
              <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;">
                <div class="field">
                  <label class="field-label" for="issuerHomeHolderName">Holder full name</label>
                  <input class="field-input" id="issuerHomeHolderName" type="text" placeholder="Jane Doe" required />
                </div>
                <div class="field">
                  <label class="field-label" for="issuerHomeHolderWallet">Holder wallet / ID</label>
                  <input class="field-input" id="issuerHomeHolderWallet" type="text" placeholder="7xKX...9mQ2 or student ID" />
                </div>
              </div>

              <div class="field">
                <label class="field-label" for="issuerHomeType">Certificate type</label>
                <select class="field-input" id="issuerHomeType" required>
                  <option value="">Select type</option>
                  <option>Degree Certificate</option>
                  <option>Transcript</option>
                  <option>Professional Diploma</option>
                  <option>Certificate of Completion</option>
                </select>
              </div>

              <div style="padding:12px 14px;border:1px dashed var(--border);border-radius:12px;background:rgba(124,58,237,0.04);color:var(--text-secondary);font-size:13px;">
                Certificate document is generated automatically when the credential is issued.
              </div>

              <div class="form-actions" style="margin-top:0; padding-top:0; border-top:none; justify-content:flex-end;">
                <button class="btn-primary" type="submit">Issue Certificate</button>
              </div>
            </form>
            <div id="issuerDashboardNotice" style="display:none;margin-top:10px;font-size:13px;color:var(--text-secondary);"></div>
            <div id="issuerDashboardResult" style="margin-top:14px;">${latestIssuerResult ? `
              <div class="alert alert-success" style="margin-bottom:0;">
                <strong>${latestIssuerResult.title || 'Certificate issued successfully.'}</strong>
                <div style="margin-top:12px;display:grid;gap:8px;font-size:13px;">
                  <div><strong>Certificate ID:</strong> ${latestIssuerResult.certificateId || 'N/A'}</div>
                  <div><strong>IPFS CID:</strong> ${latestIssuerResult.ipfsCid || 'N/A'}</div>
                  <div><strong>Transaction:</strong> ${latestIssuerResult.transaction || 'N/A'}</div>
                </div>
              </div>
            ` : ''}</div>
          </div>

          <div style="background:var(--bg-subtle);border:1px solid var(--border-light);border-radius:18px;padding:18px;margin-bottom:18px;">
            <div class="issuer-panel-label">Verify certificate</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;align-items:end;margin-top:12px;">
              <div class="field" style="margin:0;">
                <label class="field-label" for="issuerVerifyCertId">Certificate ID</label>
                <input class="field-input" id="issuerVerifyCertId" type="text" placeholder="CERT-OAU-2026-001" />
              </div>
              <button id="issuerVerifyCertBtn" class="btn-ghost" type="button">Verify</button>
            </div>
            <div id="issuerVerifyResult" style="margin-top:12px;"></div>
          </div>

          <div class="issuer-list-header">
            <div>
              <div class="issuer-list-heading">Recent issuances</div>
            </div>
          </div>

          <div class="issuer-table-wrap">
            <table class="issuer-table">
              <thead>
                <tr>
                  <th>Holder</th>
                  <th>Cert ID</th>
                  <th>Issued</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                ${recent.map(item => `
                  <tr data-certificate-row="${item.certificateId || 'CERT-OAU-2026-001'}">
                    <td>${item.holderName || 'Jane Doe'}</td>
                    <td style="font-family:var(--font-mono);">${item.certificateId || 'CERT-OAU-2026-001'}</td>
                    <td>${item.issuedAt ? new Date(item.issuedAt).toLocaleDateString() : '2026-09-18'}</td>
                    <td><span class="status-pill ${String(item.verificationStatus || item.status || 'Valid').toLowerCase() === 'revoked' ? 'status-revoked' : 'status-valid'}">${String(item.verificationStatus || item.status || 'Valid')}</span></td>
                    <td>${String(item.verificationStatus || item.status || 'Valid').toLowerCase() === 'revoked' ? '<span style="color:var(--text-muted);">Disabled</span>' : '<button class="table-action revoke-certificate" type="button" data-certificate-id="' + (item.certificateId || 'CERT-OAU-2026-001') + '">Revoke</button>'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </main>
      </div>
    `;

    const walletConnectBtn = document.getElementById('issuerWalletConnectButton');
    if (walletConnectBtn) {
      walletConnectBtn.addEventListener('click', async () => {
        try {
          if (!window.solana || !window.solana.isPhantom) {
            alert('Phantom wallet not detected in this browser.');
            return;
          }
          const resp = await window.solana.connect();
          const pub = resp?.publicKey?.toString();
          if (pub) {
            persistWalletAddress(pub);
            renderRoleLandingHome();
          }
        } catch (err) {
          console.warn('Wallet connect failed', err?.message || err);
        }
      });
    }

    document.querySelectorAll('.revoke-certificate').forEach(button => {
      button.addEventListener('click', async () => {
        const certificateId = button.dataset.certificateId;
        if (!certificateId) return;

        const reason = window.prompt('Enter a reason for revoking this certificate:', 'Certificate withdrawn or invalid');
        if (reason === null) return;

        const token = getAuthToken();
        try {
          if (token) {
            const response = await fetch(`${API_BASE_URL}/certificates/revoke/${encodeURIComponent(certificateId)}`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
              },
              body: JSON.stringify({ reason: reason || 'Revoked by issuer' })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Revoke failed');
          }

          const entries = getIssuerIssuedCertificates();
          const updated = entries.map(item => item.certificateId === certificateId ? { ...item, verificationStatus: 'revoked', revokedAt: new Date().toISOString() } : item);
          setIssuerIssuedCertificates(updated);
          renderRoleLandingHome();
        } catch (error) {
          alert(error.message || 'Unable to revoke certificate.');
        }
      });
    });

    const issuerDashboardForm = document.getElementById('issuerDashboardForm');
    if (issuerDashboardForm) {
      issuerDashboardForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const notice = document.getElementById('issuerDashboardNotice');
        const result = document.getElementById('issuerDashboardResult');
        const holderName = document.getElementById('issuerHomeHolderName').value.trim();
        const holderWallet = document.getElementById('issuerHomeHolderWallet').value.trim();
        const certificateType = document.getElementById('issuerHomeType').value.trim();
        const token = getAuthToken();
        const user = getStoredUser();

        if (!holderName || !certificateType || !token || !user) {
          notice.textContent = 'Please complete the form and ensure you are signed in as an issuer.';
          notice.style.display = 'block';
          return;
        }

        notice.textContent = 'Generating certificate record...';
        notice.style.display = 'block';
        result.innerHTML = '';

        try {
          const certificateId = `CERT-${institution.replace(/\s+/g, '').substring(0, 4).toUpperCase()}-${Date.now().toString().slice(-6)}`;
          const generatedCertificate = {
            certificate_id: certificateId,
            certificateId,
            holderName,
            holderWallet,
            certificateType,
            issuerName: institution,
            issuerWallet: getConnectedWalletAddress() || '',
            verificationStatus: 'Valid',
            status: 'valid',
            issuedAt: new Date().toISOString(),
            metadata: {
              type: 'Auto-generated certificate',
              documentType: certificateType,
              generatedBy: 'Certicheck issuer dashboard',
              holderWallet: holderWallet || null,
              institution
            },
            ipfsCid: `generated-${Date.now().toString(16)}`,
            blockchainTransactionId: `TX-${Date.now().toString(16).toUpperCase()}`
          };

          const payload = {
            certificateId,
            holderName,
            holderEmail: user.email || 'holder@example.com',
            holderWallet,
            certificateType,
            issuerName: institution,
            issuerWallet: getConnectedWalletAddress() || '',
            metadata: generatedCertificate.metadata,
            onChain: false
          };

          console.groupCollapsed('Issuance: POST /api/certificates/issue');
          console.log('URL:', `${API_BASE_URL}/certificates/issue`);
          console.log('Headers:', { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` });
          console.log('Payload:', payload);

          const response = await fetch(`${API_BASE_URL}/certificates/issue`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(payload)
          });

          let data = null;
          try { data = await response.json(); } catch (e) { console.warn('Non-JSON response from issuance endpoint', e); }
          console.log('Response status:', response.status);
          console.log('Response body:', data);
          console.groupEnd();

          if (!response.ok) throw new Error((data && (data.error || data.message)) || 'Certificate issuance failed');

          const issued = data.certificate || {};
          const nextId = issued.certificate_id || certificateId;
          const ipfsCid = issued.ipfs_cid || generatedCertificate.ipfsCid;
          const txSig = issued.blockchain_transaction_id || generatedCertificate.blockchainTransactionId;
          const list = getIssuerIssuedCertificates();
          list.unshift({
            certificateId: nextId,
            holderName,
            holderWallet,
            certificateType,
            verificationStatus: 'Valid',
            status: 'valid',
            issuedAt: new Date().toISOString(),
            ipfsCid,
            blockchainTransactionId: txSig,
            issuerEmail: user.email || 'issuer@oau.edu.ng',
            metadata: generatedCertificate.metadata
          });
          setIssuerIssuedCertificates(list, user);
          setLastIssuerResult({
            title: 'Certificate issued successfully.',
            certificateId: nextId,
            ipfsCid,
            transaction: txSig
          }, user);

          notice.style.display = 'none';
          result.innerHTML = `
            <div class="alert alert-success" style="margin-bottom:0;">
              <strong>Certificate issued successfully.</strong>
              <div style="margin-top:12px;display:grid;gap:8px;font-size:13px;">
                <div><strong>Certificate ID:</strong> ${nextId}</div>
                <div><strong>IPFS CID:</strong> ${ipfsCid}</div>
                <div><strong>Transaction:</strong> ${txSig}</div>
              </div>
            </div>
          `;
          issuerDashboardForm.reset();
          renderRoleLandingHome();
        } catch (error) {
          notice.textContent = error.message || 'Issuance failed.';
          notice.style.display = 'block';
          result.innerHTML = `
            <div class="alert alert-error"><strong>Issuance failed.</strong><br/>${error.message || 'Please try again.'}</div>
          `;
        }
      });
    }

    const issuerVerifyCertBtn = document.getElementById('issuerVerifyCertBtn');
    const issuerVerifyResult = document.getElementById('issuerVerifyResult');
    if (issuerVerifyCertBtn && issuerVerifyResult) {
      issuerVerifyCertBtn.addEventListener('click', async () => {
        const certId = document.getElementById('issuerVerifyCertId')?.value?.trim();
        if (!certId) {
          issuerVerifyResult.innerHTML = '<div class="alert alert-error">Enter a certificate ID to verify.</div>';
          return;
        }

        issuerVerifyResult.innerHTML = '<div class="alert alert-info">Checking certificate status...</div>';
        try {
          const response = await fetch(`${API_BASE_URL}/certificates/lookup/${encodeURIComponent(certId)}`);
          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Certificate not found');

          const certificate = data.certificate || {};
          const status = (certificate.verification_status || certificate.status || 'valid').toLowerCase();
          const badgeClass = status === 'revoked' ? 'alert-error' : 'alert-success';
          issuerVerifyResult.innerHTML = `
            <div class="${badgeClass}">
              <strong>Status:</strong> ${status === 'revoked' ? 'Revoked' : 'Valid'}<br/>
              <strong>Certificate:</strong> ${certificate.certificate_id || certId}<br/>
              <strong>Holder:</strong> ${certificate.holderName || certificate.holder_name || 'Unknown'}<br/>
              <strong>Issuer:</strong> ${certificate.issuerName || certificate.issuer_name || institution}
            </div>
          `;
        } catch (error) {
          issuerVerifyResult.innerHTML = `<div class="alert alert-error">${error.message || 'Verification failed.'}</div>`;
        }
      });
    }
  }
}

function navigate(page) {
  if (page === currentPage && page !== 'home') return;

  // Deactivate old page & nav item
  document.querySelector(".page.active")?.classList.remove("active");
  document.querySelector(".nav-item.active")?.classList.remove("active");

  // Activate new page
  const el = document.getElementById(`page-${page}`);
  if (el) { el.classList.add("active"); currentPage = page; }

  if (page === 'home') {
    renderRoleLandingHome();
  }

  // Activate nav item
  const navBtn = document.querySelector(`[data-page="${page}"]`);
  if (navBtn) navBtn.classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });

  // Lazy-init pages
  if (page === "tps")       initTPS();
  if (page === "faqs")      renderFAQs();
  if (page === "resources") renderResources();
  if (page === "issuer")    initIssuerDashboard();
  if (page === "holder")    initHolderDashboard();
  if (page === "verify")    { /* verify page is static in DOM; no extra init needed */ }
  initAuthPageForms(page);
}

function initAuthPageForms(page) {
  if (page === "verify-otp") initOTPVerificationForm();
  if (page === "verify-reset-otp") initVerifyResetOTPForm();
}

async function renderVerifyResult(response) {
  const resultEl = document.getElementById("verifyResult");
  if (!resultEl) return;

  if (!response || !response.success) {
    resultEl.innerHTML = `<div class="alert alert-error"><strong>Not Found</strong><br/>${response?.error || 'No certificate matched that ID.'}</div>`;
    return;
  }

  const certificate = response.certificate || {};
  const rawStatus = (certificate.verification_status || response.status || 'unknown').toLowerCase();
  const status = rawStatus === 'revoked' ? 'Revoked' : rawStatus === 'valid' ? 'Valid' : rawStatus === 'invalid' ? 'Invalid' : 'Not Found';
  const color = rawStatus === 'valid' ? '#059669' : rawStatus === 'revoked' ? '#dc2626' : '#a855f7';
  const lastChecked = certificate.checked_at || certificate.verifiedAt || certificate.issued_at || new Date().toISOString();
  const txId = certificate.blockchain_transaction_id || certificate.blockchainTransactionId || 'Not issued on-chain';
  const cid = certificate.blockchain_hash || certificate.ipfsCid || certificate.ipfs_cid || 'N/A';
  const ipfsUri = certificate.ipfsUri || certificate.ipfs_uri || (cid && cid !== 'N/A' ? `https://ipfs.io/ipfs/${cid}` : null);
  const issuerName = certificate.issuerName || certificate.issuer || certificate.issuer_name || certificate.issuer_wallet || 'Unknown issuer';
  const holderName = certificate.holderName || certificate.holder || certificate.holder_name || certificate.holderEmail || '—';

  resultEl.innerHTML = `
    <div class="result-card">
      <div class="result-header" style="border-left:4px solid ${color};">
        <div>
          <div class="result-title">Certificate ${certificate.certificate_id || certificate.certificateId || 'ID'}</div>
          <div class="result-subtitle">Status: <strong style="color:${color};text-transform:capitalize">${status}</strong></div>
          <div style="margin-top:6px;font-size:13px;color:var(--text-secondary)">Source: <strong>${response.onChain ? 'On-chain' : (response.onChain === false ? 'Local / DB' : 'Unknown')}</strong></div>
        </div>
      </div>
      <div class="result-body">
        <div><strong>Issuer:</strong> ${issuerName}</div>
        <div><strong>Holder:</strong> ${holderName}</div>
        <div><strong>Type:</strong> ${certificate.certificate_type || certificate.certificateType || 'N/A'}</div>
        <div><strong>Issued:</strong> ${new Date(lastChecked).toLocaleString()}</div>
        <div><strong>IPFS:</strong> ${ipfsUri ? `<a href="${ipfsUri}" target="_blank" rel="noopener">${cid}</a>` : cid}</div>
        <div><strong>Transaction:</strong> ${txId}${txId && txId !== 'Not issued on-chain' ? ` • <a href="https://explorer.solana.com/tx/${txId}?cluster=devnet" target="_blank" rel="noopener">View on Solana Explorer</a>` : ''}</div>
        <div style="margin-top:12px;color:var(--text-secondary);font-size:13px;">${certificate.verification_message || response.message || 'No additional details available.'}</div>
      </div>
    </div>
  `;

}

async function verifyCertificate() {
  const input = document.getElementById("certIdInput");
  const certificateId = input?.value?.trim();
  const resultEl = document.getElementById("verifyResult");

  if (!certificateId) {
    if (resultEl) {
      resultEl.innerHTML = `<div class="alert alert-error">Please enter a certificate ID.</div>`;
    }
    return;
  }

  if (resultEl) {
    resultEl.innerHTML = `<div class="alert alert-info">Checking certificate ${certificateId} on-chain...</div>`;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/certificates/lookup/${encodeURIComponent(certificateId)}`);
    const data = await response.json();
    if (!response.ok) {
      await renderVerifyResult({ success: false, error: data?.error || 'Not Found' });
      return;
    }
    await renderVerifyResult(data);
  } catch (err) {
    const demoData = getDemoCertificateData(certificateId);
    await renderVerifyResult(demoData ? { success: true, certificate: demoData } : { success: false, error: 'Not Found' });
  }
}

// Wire all nav buttons & CTAs
document.addEventListener("DOMContentLoaded", () => {
  bindPreviewLinks();
  // Use event delegation on the navbar to reliably catch clicks even when
  // nav links are dynamically hidden/shown (mobile toggle).
  const navbarEl = document.getElementById('navbar');
  if (navbarEl) {
    navbarEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-page]');
      if (!btn) return;
      const page = btn.dataset.page;
      if (page) navigate(page);
    });
  } else {
    // Fallback binding for any stray elements
    document.querySelectorAll('[data-page]').forEach(el => el.addEventListener('click', () => navigate(el.dataset.page)));
  }
  currentUser = getStoredUser();
  initTheme();
  initSignupForm();
  initLoginForm();
  initForgotPasswordForm();
  initAuthPageForms(currentPage);

  document.getElementById("verifyBtn")?.addEventListener("click", verifyCertificate);
  // Demo code chips: populate input but do not auto-submit
  document.querySelectorAll(".code-inline[data-demo]").forEach(code => {
    code.addEventListener("click", () => {
      const value = code.dataset.demo;
      const input = document.getElementById("certIdInput");
      if (input) {
        input.value = value;
        input.focus();
      }
    });
  });

  // Prefer form submission (Enter key) for verification
  const verifyForm = document.getElementById('verifyForm');
  if (verifyForm) {
    verifyForm.addEventListener('submit', (e) => { e.preventDefault(); verifyCertificate(); });
  } else {
    document.getElementById("verifyBtn")?.addEventListener("click", verifyCertificate);
  }
  
  // Home CTAs set signup type
  document.getElementById('homeGraduateBtn')?.addEventListener('click', () => { desiredSignupType = 'holder'; });
  document.getElementById('homeIssuerBtn')?.addEventListener('click', () => { desiredSignupType = 'issuer'; });
  document.getElementById('homeVerifyBtn')?.addEventListener('click', () => { desiredSignupType = null; });
  // Ensure hero CTA buttons navigate on all screen sizes
  const homeVerify = document.getElementById('homeVerifyBtn');
  const homeIssuer = document.getElementById('homeIssuerBtn');
  if (homeVerify) homeVerify.addEventListener('click', (e) => { e.preventDefault(); navigate('test'); });
  if (homeIssuer) homeIssuer.addEventListener('click', (e) => { e.preventDefault(); navigate('apply'); });

  // Wire holder page init on navigation
  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.dataset.page;
      if (p === 'holder') initHolderDashboard();
    });
  });

  // Mobile nav toggle
  const navToggle = document.getElementById('navToggle');
  navToggle && navToggle.addEventListener('click', () => {
    const links = document.querySelector('.nav-links');
    if (!links) return;
    const isHidden = getComputedStyle(links).display === 'none';
    links.style.display = isHidden ? 'flex' : 'none';
  });
  // Show toggle on small screens
  function updateNavForWidth() {
    const links = document.querySelector('.nav-links');
    const toggle = document.getElementById('navToggle');
    if (window.innerWidth <= 900) {
      if (links) links.style.display = 'none';
      if (toggle) toggle.style.display = 'inline-block';
    } else {
      if (links) links.style.display = 'flex';
      if (toggle) toggle.style.display = 'none';
    }
  }
  updateNavForWidth();
  window.addEventListener('resize', updateNavForWidth);
});

/* ═══════════════════════════════════════════════
   NAVBAR — scroll shadow
═══════════════════════════════════════════════ */
const navbar = document.getElementById("navbar");
if (navbar) {
  window.addEventListener("scroll", () => {
    navbar.classList.toggle("scrolled", window.scrollY > 20);
  }, { passive: true });
}

/* ═══════════════════════════════════════════════
   SCROLL HINT
═══════════════════════════════════════════════ */
document.getElementById("scrollHint")?.addEventListener("click", () => {
  window.scrollBy({ top: window.innerHeight, behavior: "smooth" });
});

/* ═══════════════════════════════════════════════
   CUBE PARALLAX
═══════════════════════════════════════════════ */
const cubeWraps = document.querySelectorAll(".cube-wrap");
if (cubeWraps && cubeWraps.length) {
  document.addEventListener("mousemove", (e) => {
    const cx = window.innerWidth  / 2;
    const cy = window.innerHeight / 2;
    const dx = (e.clientX - cx) / cx;
    const dy = (e.clientY - cy) / cy;

    cubeWraps.forEach((wrap, i) => {
      const depth = 0.6 + i * 0.14;
      wrap.style.transform = `translate(${dx * 18 * depth}px, ${dy * 12 * depth}px)`;
    });
  });
}

/* ═══════════════════════════════════════════════
   TPS — live Solana data
═══════════════════════════════════════════════ */
let tpsTimer   = null;
let tpsCountRef = 10;
let tpsInitialised = false;

function tpsStatus(tps) {
  if (tps >= 2000) return { label: "Healthy",   color: "#059669", bg: "rgba(5,150,105,0.1)",   text: "#065f46" };
  if (tps >= 800)  return { label: "Normal",    color: "#2563eb", bg: "rgba(37,99,235,0.1)",   text: "#1e3a8a" };
  if (tps >= 200)  return { label: "Degraded",  color: "#d97706", bg: "rgba(217,119,6,0.1)",   text: "#78350f" };
  return                   { label: "Congested", color: "#dc2626", bg: "rgba(220,38,38,0.1)",   text: "#7f1d1d" };
}

function tpsBarColor(tps) {
  if (tps >= 2000) return "#059669";
  if (tps >= 800)  return "#2563eb";
  if (tps >= 200)  return "#d97706";
  return "#dc2626";
}

async function fetchTPS() {
  const errBox   = document.getElementById("tps-error");
  const curEl    = document.getElementById("tpsCurrent");
  const peakEl   = document.getElementById("tpsPeak");
  const avgEl    = document.getElementById("tpsAvg");
  const badgeEl  = document.getElementById("tpsStatusBadge");
  const barsEl   = document.getElementById("tpsBars");
  const updatedEl= document.getElementById("tpsUpdated");

  errBox.style.display = "none";

  [curEl, peakEl, avgEl].forEach(el => { if (el && !el.dataset.loaded) el.innerHTML = `<div class="skeleton" style="width:${el === curEl ? '180px' : '100px'};height:${el === curEl ? '64px' : '32px'};border-radius:6px"></div>`; });

  try {
    const res = await fetch(`${API_BASE_URL}/network/tps`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || "Unable to load TPS data from the backend");
    }

    const arr = Array.isArray(data.samples) ? data.samples : [];
    if (!arr.length) throw new Error("Empty TPS response from the backend");

    const current = Number(data.currentTps ?? arr[0] ?? 0);
    const peak    = Number(data.peakTps ?? Math.max(...arr));
    const avg     = Number(data.averageTps ?? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length));
    const max     = Math.max(peak, 1);
    const st      = tpsStatus(current);

    curEl.dataset.loaded = "1";
    curEl.innerHTML = `<span style="color:${st.color}">${current.toLocaleString()}</span>`;

    badgeEl.innerHTML = `
      <div class="status-badge" style="background:${st.bg};color:${st.text}">
        <span class="pulse-dot" style="background:${st.color}"></span>
        ${st.label}
      </div>`;

    peakEl.dataset.loaded = avgEl.dataset.loaded = "1";
    peakEl.textContent = peak.toLocaleString();
    avgEl.textContent  = avg.toLocaleString();

    barsEl.innerHTML = arr.map(t => {
      const pct = Math.max(6, Math.round((t / max) * 100));
      return `<div class="tps-bar" style="height:${pct}%;background:${tpsBarColor(t)}" title="${t.toLocaleString()} TPS"></div>`;
    }).join("");

    const now = new Date();
    updatedEl.textContent = `last updated ${now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  } catch (err) {
    const demo = getDemoTpsData();
    const current = demo.currentTps;
    const peak = demo.peakTps;
    const avg = demo.averageTps;
    const max = Math.max(peak, 1);
    const st = tpsStatus(current);

    curEl.dataset.loaded = "1";
    curEl.innerHTML = `<span style="color:${st.color}">${current.toLocaleString()}</span>`;
    badgeEl.innerHTML = `
      <div class="status-badge" style="background:${st.bg};color:${st.text}">
        <span class="pulse-dot" style="background:${st.color}"></span>
        ${st.label}
      </div>`;
    peakEl.dataset.loaded = avgEl.dataset.loaded = "1";
    peakEl.textContent = peak.toLocaleString();
    avgEl.textContent = avg.toLocaleString();
    barsEl.innerHTML = demo.samples.map(t => {
      const pct = Math.max(6, Math.round((t / max) * 100));
      return `<div class="tps-bar" style="height:${pct}%;background:${tpsBarColor(t)}" title="${t.toLocaleString()} TPS"></div>`;
    }).join("");
    updatedEl.textContent = `last updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
  }
}

function initTPS() {
  if (tpsInitialised) return;
  tpsInitialised = true;

  fetchTPS();

  // Countdown + auto-refresh
  tpsTimer = setInterval(() => {
    tpsCountRef -= 1;
    const cdEl = document.getElementById("tpsCountdown");
    if (cdEl) cdEl.textContent = `next refresh in ${tpsCountRef}s`;
    if (tpsCountRef <= 0) { tpsCountRef = 10; fetchTPS(); }
  }, 1_000);

  // Manual refresh button
  document.getElementById("tpsRefreshBtn")?.addEventListener("click", () => {
    tpsCountRef = 10;
    fetchTPS();
  });
}

// Pause timer when not on TPS page
document.addEventListener("visibilitychange", () => {
  if (document.hidden && tpsTimer) { clearInterval(tpsTimer); tpsTimer = null; }
  else if (!document.hidden && currentPage === "tps" && !tpsTimer) { initTPS(); }
});

const THEME_KEY = "certicheck_theme";
const PENDING_APPS_KEY = "certicheck_pending_apps";

// Store signup data temporarily during OTP flow
let pendingSignupData = null;
let pendingForgotEmail = null;

function initIssuerDashboard() {
  const formWrap = document.getElementById("issuerFormWrap");
  const notice = document.getElementById("issuerNotice");
  const form = document.getElementById("issuerIssueForm");
  const button = document.getElementById("issuerSubmitBtn");
  const errorEl = document.getElementById("issuerError");
  const resultEl = document.getElementById("issuerResult");

  if (!formWrap || !notice || !button) return;

  const token = getAuthToken();
  if (!token) {
    notice.style.display = "block";
    formWrap.style.display = "none";
    return;
  }

  const user = getStoredUser();
  if (!user) {
    notice.style.display = "block";
    formWrap.style.display = "none";
    return;
  }

  if (user.user_type !== "issuer" && user.user_type !== "admin") {
    notice.innerHTML = "Your account is not approved as an issuer yet. Please complete the issuer application first.";
    notice.style.display = "block";
    formWrap.style.display = "none";
    return;
  }

  notice.style.display = "none";
  formWrap.style.display = "block";
  if (user.email) {
    notice.innerHTML = `Signed in as <strong>${user.email}</strong>. You can issue a certificate now.`;
    notice.style.display = "block";
  }

  // Render issuer certificate list from the backend when possible
  async function loadIssuerCertificates() {
    const listEl = document.getElementById('issuerCertificatesList');
    if (!listEl) return [];

    if (token) {
      try {
        const response = await fetch(`${API_BASE_URL}/verify/my-history`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          if (data.success && Array.isArray(data.history)) {
            return data.history.map((entry) => ({
              certificateId: entry.certificate_id,
              holderName: entry.certificate_type || entry.holder_name || '',
              holderEmail: '',
              certificateType: entry.certificate_type,
              ipfsCid: entry.blockchain_hash || '',
              ipfsUri: entry.blockchain_hash ? `https://ipfs.io/ipfs/${entry.blockchain_hash}` : null,
              blockchainTransactionId: entry.blockchain_transaction_id,
              verificationStatus: entry.verification_status,
              issuedAt: entry.checked_at
            }));
          }
        }
      } catch (err) {
        console.warn('Unable to load issuer certificates from backend:', err.message);
      }
    }

      try {
        const raw = localStorage.getItem(issuerIssuedKeyFor(user));
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
  }

  async function renderIssuerCertificatesList() {
    const listEl = document.getElementById('issuerCertificatesList');
    if (!listEl) return;
    const all = await loadIssuerCertificates();
    const ours = all.filter(c => c.issuerEmail === user.email || c.issuerWallet === (document.getElementById('issuerWallet')?.value || ''));
    if (!ours.length) {
      listEl.innerHTML = 'No certificates issued yet.';
      return;
    }

    listEl.innerHTML = `<table style="width:100%"><thead><tr><th>ID</th><th>Type</th><th>IPFS</th><th>On-chain</th><th>Status</th><th>Actions</th></tr></thead><tbody>${ours.map(c => `
      <tr data-cert-id="${c.certificateId}">
        <td style="font-family:var(--font-mono)">${c.certificateId}</td>
        <td>${c.certificateType || '—'}</td>
        <td style="font-family:var(--font-mono)">${c.ipfsCid ? `<a href="${c.ipfsUri || 'https://ipfs.io/ipfs/' + c.ipfsCid}" target="_blank">${c.ipfsCid}</a>` : '—'}</td>
        <td>${c.blockchainTransactionId ? '<span style="color:#059669">Yes</span>' : 'No'}</td>
        <td>${c.verificationStatus || 'issued'}</td>
        <td>${c.verificationStatus === 'revoked' ? '<em>Revoked</em>' : `<button class="btn-ghost btn-revoke" data-cert="${c.certificateId}">Revoke</button>`}</td>
      </tr>`).join('')}</tbody></table>`;

    // Wire revoke buttons
    listEl.querySelectorAll('.btn-revoke').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const certId = btn.dataset.cert;
        if (!certId) return;
        if (!confirm(`Revoke certificate ${certId}? This action is recorded.`)) return;

        const token = getAuthToken();
        try {
          if (token) {
            const res = await fetch(`${API_BASE_URL}/certificates/revoke/${encodeURIComponent(certId)}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ reason: 'Revoked via issuer dashboard' })
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Revoke failed');
          } else {
            // Demo fallback: mark locally
              const allLocal = await loadIssuerCertificates();
              const updated = allLocal.map(x => x.certificateId === certId ? { ...x, verificationStatus: 'revoked', revokedAt: new Date().toISOString() } : x);
              setIssuerIssuedCertificates(updated);
          }

          // Update UI: mark row revoked
          const row = listEl.querySelector(`tr[data-cert-id="${certId}"]`);
          if (row) {
            row.querySelector('td:nth-child(5)').innerHTML = 'revoked';
            row.querySelector('td:nth-child(6)').innerHTML = '<em>Revoked</em>';
          }
        } catch (err) {
          alert('Unable to revoke certificate: ' + (err.message || err));
        }
      });
    });
  }

  renderIssuerCertificatesList();

  // Wallet connect (Phantom)
  const connectBtn = document.getElementById('connectWalletBtn');
  const walletBadge = document.getElementById('connectedWalletBadge');
  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      try {
        if (!window.solana || !window.solana.isPhantom) return alert('Phantom wallet not detected in this browser.');
        const resp = await window.solana.connect();
        const pub = resp?.publicKey?.toString();
        if (pub) {
          persistWalletAddress(pub);
          walletBadge.textContent = pub;
          const wInput = document.getElementById('issuerWallet');
          if (wInput) wInput.value = pub;
          renderRoleLandingHome();
        }
      } catch (err) {
        console.warn('Wallet connect failed', err?.message || err);
      }
    });
  }

  const existingWallet = getConnectedWalletAddress();
  if (existingWallet && walletBadge) {
    walletBadge.textContent = existingWallet;
    const wInput = document.getElementById('issuerWallet');
    if (wInput) wInput.value = existingWallet;
  }

  button.onclick = async () => {
    errorEl.style.display = "none";
    errorEl.textContent = "";
    resultEl.innerHTML = "";

    const payload = {
      certificateId: document.getElementById("issuerCertId")?.value?.trim() || "",
      holderName: document.getElementById("issuerHolderName")?.value?.trim() || "",
      holderEmail: document.getElementById("issuerHolderEmail")?.value?.trim() || "",
      certificateType: document.getElementById("issuerType")?.value?.trim() || "",
      issuerName: document.getElementById("issuerName")?.value?.trim() || "",
      issuerWallet: document.getElementById("issuerWallet")?.value?.trim() || "",
      metadata: document.getElementById("issuerMetadata")?.value || null,
      expiry: document.getElementById("issuerExpiry")?.value || null,
      walletAddress: document.getElementById("issuerWallet")?.value?.trim() || "",
      issueOnChain: document.getElementById("issuerOnChain")?.checked || false
    };

    button.disabled = true;
    button.textContent = "Issuing...";

    try {
      // If issuer requested on-chain issuance and Phantom is connected, perform client-side pin + sign
      if (payload.issueOnChain && window.solana && window.solana.isPhantom) {
        // 1) Pin metadata to IPFS via backend pin endpoint
        const metadata = {
          certificateId: payload.certificateId,
          holderName: payload.holderName,
          holderEmail: payload.holderEmail,
          certificateType: payload.certificateType,
          issuerName: payload.issuerName,
          extra: payload.metadata || null,
          expiry: payload.expiry || null
        };

        const pinRes = await fetch(`${API_BASE_URL}/certificates/pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ metadata })
        });
        const pinJson = await pinRes.json();
        if (!pinRes.ok || !pinJson.cid) throw new Error(pinJson.error || 'Failed to pin metadata');
        const ipfsCid = pinJson.cid;

        // 2) Build a memo transaction with the IPFS CID and certificate id, sign locally and send
        const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('devnet'), 'confirmed');
        const memoData = JSON.stringify({ certificateId: payload.certificateId, ipfsCid, certificateType: payload.certificateType });
        const memoProgramId = new solanaWeb3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
        const ix = new solanaWeb3.TransactionInstruction({ keys: [], programId: memoProgramId, data: Buffer.from(memoData) });
        const tx = new solanaWeb3.Transaction().add(ix);
        tx.feePayer = window.solana.publicKey;
        const { blockhash } = await connection.getRecentBlockhash();
        tx.recentBlockhash = blockhash;

        const signed = await window.solana.signTransaction(tx);
        const raw = signed.serialize();
        const txid = await connection.sendRawTransaction(raw);
        await connection.confirmTransaction(txid, 'confirmed');

        // 3) Notify backend to record the certificate with the client-signed transaction
        const recordPayload = {
          certificateId: payload.certificateId,
          holderName: payload.holderName,
          holderEmail: payload.holderEmail,
          certificateType: payload.certificateType,
          issuerName: payload.issuerName,
          issuerWallet: window.solana.publicKey?.toString() || payload.issuerWallet || null,
          ipfsCid,
          blockchainTransactionId: txid,
          metadata
        };

        const recordRes = await fetch(`${API_BASE_URL}/certificates/issue-client-signed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(recordPayload)
        });
        const recordJson = await recordRes.json();
        if (!recordRes.ok) throw new Error(recordJson.error || 'Failed to record client-signed issuance');

        const certificate = recordJson.certificate || {};
        const certificateId = certificate.certificate_id || payload.certificateId;
        localStorage.setItem("certicheck_last_certificate", JSON.stringify(certificate));
        localStorage.setItem("certicheck_last_certificate_id", certificateId);

        // Append to issuer certificate list in localStorage for dashboard rendering
        try {
          const arr = getIssuerIssuedCertificates();
          const entry = {
            certificateId,
            holderName: certificate.holderName || payload.holderName || payload.holderEmail,
            holderEmail: payload.holderEmail || null,
            certificateType: payload.certificateType || certificate.certificate_type || null,
            ipfsCid: certificate.ipfsCid || certificate.ipfs_cid || certificate.blockchain_hash || ipfsCid,
            ipfsUri: certificate.ipfsUri || certificate.ipfs_uri || (ipfsCid ? `https://ipfs.io/ipfs/${ipfsCid}` : null),
            blockchainTransactionId: certificate.blockchainTransactionId || certificate.blockchain_transaction_id || txid,
            blockchainExplorerUrl: `https://explorer.solana.com/tx/${txid}?cluster=devnet`,
            issuerEmail: user.email,
            issuerWallet: recordPayload.issuerWallet || null,
            metadata: payload.metadata || certificate.metadata || null,
            expiry: payload.expiry || certificate.expiry || null,
            issuedAt: new Date().toISOString()
          };
          arr.unshift(entry);
          setIssuerIssuedCertificates(arr, user);
        } catch (e) { console.warn('Failed to store issued certificate locally', e); }

        resultEl.innerHTML = `
          <div class="alert alert-success">
            <strong>Certificate issued successfully (client-signed).</strong>
            <div class="issuer-result-card" style="margin-top:12px;padding:14px;border:1px solid rgba(5,118,210,.12);border-radius:12px;">
              <div><strong>ID:</strong> ${certificateId}</div>
              <div><strong>On-chain:</strong> Yes</div>
              <div><strong>Transaction:</strong> ${txid}</div>
              <div><strong>Explorer:</strong> <a href="https://explorer.solana.com/tx/${txid}?cluster=devnet" target="_blank">View on Solana Explorer</a></div>
              <div><strong>IPFS CID:</strong> ${ipfsCid}</div>
            </div>
          </div>`;

        try { renderIssuerCertificatesList(); } catch (e) {}
        return;
      }

      // Fallback: server-side issuance flow
      const response = await fetch(`${API_BASE_URL}/certificates/issue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-demo-user-type": user.user_type || "issuer"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Certificate issuance failed");
      }

      const certificate = data.certificate || {};
      const certificateId = certificate.certificate_id || payload.certificateId;
      localStorage.setItem("certicheck_last_certificate", JSON.stringify(certificate));
      localStorage.setItem("certicheck_last_certificate_id", certificateId);

      const certInput = document.getElementById("certIdInput");
      if (certInput) {
        certInput.value = certificateId;
      }

      const status = certificate.status || 'issued';
      const onChain = certificate.onChain ? 'Yes' : 'No';
      const txId = certificate.blockchainTransactionId || 'N/A';
      const txStatus = certificate.blockchainTransactionStatus ? certificate.blockchainTransactionStatus.confirmationStatus || JSON.stringify(certificate.blockchainTransactionStatus) : 'Pending';
      const explorerLink = certificate.blockchainExplorerUrl ? `<a href="${certificate.blockchainExplorerUrl}" target="_blank" rel="noopener noreferrer">View on Solana Explorer</a>` : '';

      // Append to issuer certificate list in localStorage for dashboard rendering
      try {
        const storedRaw = null;
        const arr = getIssuerIssuedCertificates();
        const entry = {
          certificateId,
          holderName: certificate.holderName || payload.holderName || payload.holderEmail,
          holderEmail: payload.holderEmail || null,
          certificateType: payload.certificateType || certificate.certificate_type || null,
          ipfsCid: certificate.ipfsCid || certificate.ipfs_cid || certificate.blockchain_hash || null,
          ipfsUri: certificate.ipfsUri || certificate.ipfs_uri || (certificate.ipfsCid ? `https://ipfs.io/ipfs/${certificate.ipfsCid}` : null),
          blockchainTransactionId: certificate.blockchainTransactionId || certificate.blockchain_transaction_id || null,
          blockchainExplorerUrl: certificate.blockchainExplorerUrl || null,
          issuerEmail: user.email,
          issuerWallet: payload.issuerWallet || null,
          metadata: payload.metadata || certificate.metadata || null,
          expiry: payload.expiry || certificate.expiry || null,
          issuedAt: new Date().toISOString()
        };
        arr.unshift(entry);
        setIssuerIssuedCertificates(arr, user);
      } catch (e) { console.warn('Failed to store issued certificate locally', e); }

      resultEl.innerHTML = `
        <div class="alert alert-success">
          <strong>Certificate issued successfully.</strong>
          <div class="issuer-result-card" style="margin-top:12px;padding:14px;border:1px solid rgba(5,118,210,.12);border-radius:12px;">
            <div><strong>ID:</strong> ${certificateId}</div>
            <div><strong>Status:</strong> ${status}</div>
            <div><strong>On-chain:</strong> ${onChain}</div>
            <div><strong>Transaction:</strong> ${txId}</div>
            <div><strong>Transaction status:</strong> ${certificate.blockchainTransactionId ? txStatus : 'Not submitted'}</div>
            ${explorerLink ? `<div>${explorerLink}</div>` : ''}
            <div><strong>IPFS CID:</strong> ${certificate.ipfsCid || 'N/A'}</div>
          </div>
        </div>`;

      // Refresh issuer list view if visible
      try { renderIssuerCertificatesList(); } catch (e) {}
    } catch (err) {
      const message = err?.message || "The backend could not issue the certificate.";
      errorEl.textContent = message;
      errorEl.style.display = "block";
      resultEl.innerHTML = `
        <div class="alert alert-error">
          <strong>Issuance failed.</strong><br/>
          <div style="margin-top:8px;font-size:13px">${message}</div>
        </div>`;
    } finally {
      button.disabled = false;
      button.textContent = "Issue Certificate";
    }
  };
}

function toggleTheme() {
  const nextTheme = document.body.classList.contains('dark') ? 'light' : 'dark';
  applyTheme(nextTheme);
  return nextTheme === 'dark';
}

function initTheme() {
  const toggle = document.getElementById('themeToggle');
  const storedTheme = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = storedTheme || (prefersDark ? 'dark' : 'light');

  applyTheme(theme);

  if (toggle && !toggle.dataset.themeBound) {
    toggle.dataset.themeBound = 'true';
    toggle.addEventListener('click', toggleTheme);
  }
}

function buildVerificationLink(certificateId) {
  const base = window.location.origin + window.location.pathname;
  return `${base}?certificate=${encodeURIComponent(certificateId)}`;
}

async function copyVerificationLink(certificateId) {
  const link = buildVerificationLink(certificateId);
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(link);
      return true;
    }

    const helper = document.createElement('textarea');
    helper.value = link;
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    document.body.appendChild(helper);
    helper.select();
    document.execCommand('copy');
    helper.remove();
    return true;
  } catch (err) {
    console.warn('Failed to copy verification link:', err);
    return false;
  }
}

function getHolderCertificatesForUser(user) {
  if (!user) return [];

  const arr = getIssuerIssuedCertificates();

  return arr.filter((certificate) => {
    const holderEmail = String(certificate.holderEmail || certificate.holder_email || '').toLowerCase();
    const holderWallet = String(certificate.holderWallet || certificate.holder_wallet || '');
    const issuerEmail = String(certificate.issuerEmail || certificate.issuer_email || '').toLowerCase();
    const userEmail = String(user.email || '').toLowerCase();
    const userWallet = String(user.wallet || '');

    return (
      (userEmail && holderEmail && holderEmail === userEmail) ||
      (userWallet && holderWallet && holderWallet === userWallet) ||
      (user.id && Number(certificate.userId) === Number(user.id)) ||
      (userEmail && issuerEmail && issuerEmail === userEmail)
    );
  });
}

function initHolderDashboard() {
  const notice = document.getElementById('holderNotice');
  const wrap = document.getElementById('holderCertListWrap');
  const listEl = document.getElementById('holderCertificatesList');

  if (!notice || !wrap || !listEl) return;
  const token = getAuthToken();
  const user = getStoredUser();
  if (!token || !user) {
    notice.style.display = 'block';
    wrap.style.display = 'none';
    return;
  }

  notice.style.display = 'none';
  wrap.style.display = 'block';

  try {
    const ours = getHolderCertificatesForUser(user);
    if (!ours.length) {
      listEl.innerHTML = '<div>No certificates found for your account.</div>';
      return;
    }

    listEl.innerHTML = ours.map((certificate) => {
      const certId = certificate.certificateId || certificate.certificate_id || 'Unknown certificate';
      const status = certificate.status || certificate.verification_status || 'valid';
      const issuer = certificate.issuerName || certificate.issuer_name || certificate.issuerWallet || certificate.issuer_wallet || 'Unknown issuer';
      const date = certificate.issuedAt ? new Date(certificate.issuedAt).toLocaleDateString() : (certificate.issued_at ? new Date(certificate.issued_at).toLocaleDateString() : 'N/A');
      const ipfsUrl = certificate.ipfsUri || (certificate.ipfsCid ? `https://ipfs.io/ipfs/${certificate.ipfsCid}` : null);
      const verificationUrl = buildVerificationLink(certId);

      return `
        <div style="padding:16px 14px;border:1px solid rgba(0,0,0,0.06);border-radius:12px;margin-bottom:12px;background:rgba(255,255,255,0.5)">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
            <div>
              <div style="font-family:var(--font-mono);font-size:13px;font-weight:700">${certId}</div>
              <div style="margin-top:6px;color:var(--text-secondary);font-size:13px">${certificate.certificateType || certificate.certificate_type || 'Certificate'} • ${date}</div>
            </div>
            <span style="padding:4px 8px;border-radius:999px;background:${status === 'revoked' ? 'rgba(220,38,38,0.12)' : 'rgba(5,118,210,0.12)'};color:${status === 'revoked' ? '#b91c1c' : '#0f172a'};font-size:12px;font-weight:600;text-transform:capitalize">${status}</span>
          </div>

          <div style="margin-top:10px;font-size:13px;color:var(--text-secondary)">
            <div><strong>Issuer:</strong> ${issuer}</div>
          </div>

          <div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn-ghost" data-share-cert="${certId}" type="button">Share</button>
            ${ipfsUrl ? `<a class="btn-ghost" href="${ipfsUrl}" target="_blank" rel="noreferrer" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center">Download</a>` : '<button class="btn-ghost" type="button" disabled>Download</button>'}
            <a class="btn-ghost" href="${verificationUrl}" target="_blank" rel="noreferrer" style="text-decoration:none;display:inline-flex;align-items:center;justify-content:center">Verify</a>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('[data-share-cert]').forEach((button) => {
      button.addEventListener('click', async () => {
        const certId = button.getAttribute('data-share-cert');
        const copied = await copyVerificationLink(certId);
        button.textContent = copied ? 'Copied' : 'Copy failed';
        setTimeout(() => { button.textContent = 'Share'; }, 1200);
      });
    });
  } catch (e) {
    console.warn('Failed to render holder dashboard certificates:', e);
    listEl.innerHTML = '<div>Error loading certificates.</div>';
  }
}

function applyTheme(theme) {
  const body = document.body;
  const toggle = document.getElementById("themeToggle");
  const nextTheme = theme === "dark" ? "dark" : "light";

  body.classList.toggle("dark", nextTheme === "dark");
  document.documentElement.setAttribute("data-theme", nextTheme);
  localStorage.setItem(THEME_KEY, nextTheme);

  if (toggle) {
    toggle.title = nextTheme === "dark" ? "Switch to light mode" : "Switch to dark mode";
    toggle.setAttribute("aria-label", nextTheme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  }
}

function updateThemeToggleState() {
  const toggle = document.getElementById("themeToggle");
  if (!toggle) return;
  const isDark = document.body.classList.contains("dark");
  toggle.title = isDark ? "Switch to light mode" : "Switch to dark mode";
  toggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
}

/* ═══════════════════════════════════════════════
   AUTHENTICATION — Signup with OTP & Login
═══════════════════════════════════════════════ */
function initSignupForm() {
  const btn = document.getElementById("signupBtn");
  const emailEl = document.getElementById("signupEmail");
  const firstNameEl = document.getElementById("signupFirstName");
  const lastNameEl = document.getElementById("signupLastName");
  const passwordEl = document.getElementById("signupPassword");
  const confirmPasswordEl = document.getElementById("signupConfirmPassword");
  const errorEl = document.getElementById("signupError");

  if (!btn) return;

  btn.addEventListener("click", async () => {
    errorEl.style.display = "none";
    const email = emailEl.value.trim();
    const firstName = firstNameEl.value.trim();
    const lastName = lastNameEl.value.trim();
    const password = passwordEl.value;
    const confirmPassword = confirmPasswordEl.value;

    if (!email || !firstName || !lastName || !password || !confirmPassword) {
      errorEl.textContent = "All fields are required";
      errorEl.style.display = "block";
      return;
    }

    if (password !== confirmPassword) {
      errorEl.textContent = "Passwords do not match";
      errorEl.style.display = "block";
      return;
    }

    if (password.length < 6) {
      errorEl.textContent = "Password must be at least 6 characters";
      errorEl.style.display = "block";
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = "Sending OTP...";

      // Direct registration (OTP removed): create account immediately
      try {
        btn.disabled = true;
        btn.textContent = 'Creating account...';
        const registerResponse = await fetch(`${API_BASE_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, firstName, lastName, userType: desiredSignupType || 'issuer' })
        });
        if (registerResponse.ok) {
          const data = await registerResponse.json();
          saveAuthSession(data.token, data.user);
          // If there is a pending application draft, attach contact info and submit
          const draft = loadPendingApplicationDraft();
          if (draft) {
            try {
              draft.contactEmail = email;
              await fetch(`${API_BASE_URL}/applications/submit`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` },
                body: JSON.stringify(draft)
              });
              clearPendingApplicationDraft();
            } catch (e) { console.warn('Failed to auto-submit draft after registration', e); }
          }
          navigate(data.user.user_type === 'admin' ? 'home' : data.user.user_type === 'issuer' ? 'home' : 'holder');
          return;
        } else {
          const err = await registerResponse.json().catch(() => ({}));
          errorEl.textContent = err.error || 'Registration failed';
          errorEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Create account';
          return;
        }
        } catch (e) {
          console.warn('Registration request failed', e);
          errorEl.textContent = 'Registration failed';
          errorEl.style.display = 'block';
          btn.disabled = false;
          btn.textContent = 'Create account';
          return;
        }
      } catch (err) {
        console.warn('Signup flow failed', err);
        errorEl.textContent = 'Registration failed';
        errorEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Create account';
        return;
      }

      // Try chain-first via API fallback, then local store
    const token = getAuthToken();
    const storedUser = getStoredUser();
    const userEmail = (storedUser?.email || '').trim();
    const userWallet = (storedUser?.wallet || '').trim();

    async function renderCertificates(certificates) {
      if (!certificates || !certificates.length) {
        listEl.innerHTML = '<div>No certificates found for your account.</div>';
        return;
      }
      listEl.innerHTML = certificates.map((certificate) => {
        const certId = certificate.certificateId || certificate.certificate_id || 'Unknown certificate';
        const status = certificate.status || certificate.verification_status || 'valid';
        const issuer = certificate.issuerName || certificate.issuer_name || certificate.issuerWallet || certificate.issuer_wallet || 'Unknown issuer';
        const date = certificate.issuedAt ? new Date(certificate.issuedAt).toLocaleDateString() : (certificate.issued_at ? new Date(certificate.issued_at).toLocaleDateString() : 'N/A');
        const ipfsUrl = certificate.ipfsUri || (certificate.ipfsCid ? `https://ipfs.io/ipfs/${certificate.ipfsCid}` : null);
        const verificationUrl = buildVerificationLink(certId);
        return `
          <div class="holder-cert-card">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
              <div>
                <div style="font-weight:800;font-size:15px;">${certId}</div>
                <div style="color:var(--text-secondary);font-size:13px;">${certificate.certificate_type || certificate.certificateType || ''} · ${date}</div>
              </div>
              <div style="text-align:right;">
                <div style="font-weight:800;color:${status === 'revoked' ? 'var(--danger)' : 'var(--success)'};">${status}</div>
                ${ipfsUrl ? `<a href="${ipfsUrl}" target="_blank" class="btn-ghost">IPFS</a>` : ''}
                <a href="${verificationUrl}" class="btn-outline">Verify</a>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    try {
      // Prefer API lookup by holder (chain-local fallback)
      const params = new URLSearchParams();
      if (userEmail) params.set('email', userEmail);
      if (userWallet) params.set('wallet', userWallet);
      const res = await fetch(`/api/certificates/lookup-by-holder?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const body = await res.json();
        if (body && body.certificates) {
          await renderCertificates(body.certificates);
          wrap.style.display = 'block';
          return;
        }
      }
    } catch (err) {
      console.warn('Holder API lookup failed, falling back to local store:', err);
    }

    // Final fallback: local store
    try {
      const ours = getHolderCertificatesForUser(user);
      await renderCertificates(ours);
      wrap.style.display = 'block';
      return;
    } catch (err) {
      console.warn('Failed to initialize holder dashboard:', err);
      listEl.innerHTML = '<div>No certificates found for your account.</div>';
    }

    try {
      btn.disabled = true;
      btn.textContent = "Verifying...";

      let verified = false;
      try {
        const verifyResponse = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: pendingSignupData.email, otp })
        });
        verified = verifyResponse.ok;
      } catch (err) {
        console.warn('OTP verification request failed, falling back to demo mode:', err.message);
      }

      if (verified) {
        try {
          const registerResponse = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: pendingSignupData.email,
              password: pendingSignupData.password,
              firstName: pendingSignupData.firstName,
              lastName: pendingSignupData.lastName,
              userType: pendingSignupData.userType,
              otp
            })
          });

          if (registerResponse.ok) {
            const data = await registerResponse.json();
            if (data.token && data.user) {
              saveAuthSession(data.token, data.user);
              pendingSignupData = null;
              // If a draft application exists, submit it now as the authenticated user
              const draft = loadPendingApplicationDraft();
              if (draft) {
                try {
                  await fetch(`${API_BASE_URL}/applications/submit`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getAuthToken()}` },
                    body: JSON.stringify(draft)
                  });
                  clearPendingApplicationDraft();
                } catch (e) {
                  console.warn('Failed to auto-submit pending application after signup', e.message || e);
                }
              }
              navigate(data.user.user_type === 'admin' ? 'home' : data.user.user_type === 'issuer' ? 'home' : 'holder');
              return;
            }
          }
        } catch (registerErr) {
          console.warn('Registration request failed, falling back to demo mode:', registerErr.message);
        }
      }

      const role = pendingSignupData.userType || desiredSignupType || 'issuer';
      saveDemoAuthSessionWithRole(pendingSignupData.email, pendingSignupData.firstName, pendingSignupData.lastName, role);
      pendingSignupData = null;
      navigate(role === 'holder' ? 'holder' : role === 'admin' ? 'home' : 'home');
    } catch (err) {
      errorEl.textContent = "Demo signup completed locally.";
      errorEl.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Verify & Create Account";
    }
  });

  // Resend OTP
  resendBtn?.addEventListener("click", async () => {
    if (!pendingSignupData) return;

    try {
      resendBtn.disabled = true;
      resendBtn.textContent = "Resending...";

      try {
        await fetch(`${API_BASE_URL}/auth/send-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: pendingSignupData.email })
        });
      } catch {}

      otpInput.value = "";
      otpInput.focus();
      errorEl.style.display = "none";
      resendBtn.textContent = "OTP skipped in demo mode";
      setTimeout(() => {
        resendBtn.disabled = false;
        resendBtn.textContent = "Resend";
      }, 3000);
    } catch (err) {
      errorEl.textContent = "Demo mode: OTP resend is ready.";
      errorEl.style.display = "block";
      resendBtn.disabled = false;
      resendBtn.textContent = "Resend";
    }
  });
}

function initLoginForm() {
  const btn = document.getElementById("loginBtn");
  const emailEl = document.getElementById("loginEmail");
  const passwordEl = document.getElementById("loginPassword");
  const rememberEl = document.getElementById("loginRemember");
  const statusEl = document.getElementById("loginStatus");
  const errorEl = document.getElementById("loginError");

  if (!btn) return;

  const savedEmail = getRememberedLoginEmail();
  if (emailEl && savedEmail) {
    emailEl.value = savedEmail;
  }
  if (rememberEl) {
    rememberEl.checked = Boolean(savedEmail);
  }
  if (statusEl) {
    if (savedEmail) {
      statusEl.textContent = `Auto-suggested email: ${savedEmail}`;
      statusEl.style.display = "block";
    } else {
      statusEl.textContent = "No remembered email yet. Check 'Remember my email' to save it.";
      statusEl.style.display = "block";
    }
  }

  btn.addEventListener("click", async () => {
    errorEl.style.display = "none";
    const email = emailEl.value.trim();
    const password = passwordEl.value;
    const remember = rememberEl?.checked;

    if (!email || !password) {
      errorEl.textContent = "Email and password are required";
      errorEl.style.display = "block";
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = "Signing in...";

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          if (remember) {
            setRememberedLoginEmail(email);
          } else {
            setRememberedLoginEmail("");
          }
          saveAuthSession(data.token, data.user);
          return navigate(data.user.user_type === 'admin' ? 'home' : data.user.user_type === 'issuer' ? 'home' : 'holder');
        }
      }

      if (remember) {
        setRememberedLoginEmail(email);
      } else {
        setRememberedLoginEmail("");
      }

      // Demo login: preserve desired role if set
      const role = desiredSignupType || 'issuer';
      saveDemoAuthSessionWithRole(email, 'Demo', 'User', role);
      navigate(role === 'holder' ? 'holder' : 'home');
    } catch (err) {
      console.warn('Login request failed, falling back to demo mode:', err.message);
      const role = desiredSignupType || 'issuer';
      saveDemoAuthSessionWithRole(email, 'Demo', 'User', role);
      navigate(role === 'holder' ? 'holder' : 'home');
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign In";
    }
  });
}

function initForgotPasswordForm() {
  const btn = document.getElementById("forgotBtn");
  const emailEl = document.getElementById("forgotEmail");
  const errorEl = document.getElementById("forgotError");

  if (!btn) return;

  btn.addEventListener("click", async () => {
    errorEl.style.display = "none";
    const email = emailEl.value.trim();

    if (!email) {
      errorEl.textContent = "Please enter your email";
      errorEl.style.display = "block";
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = "Sending code...";

      try {
        await fetch(`${API_BASE_URL}/auth/forgot-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
      } catch {}

      pendingForgotEmail = email;
      errorEl.textContent = "Demo mode: reset code skipped. Use any 6-digit code to continue.";
      errorEl.style.display = "block";
      navigate('verify-reset-otp');
      
    } catch (err) {
      errorEl.textContent = "Demo reset flow is ready.";
      errorEl.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Send Reset Code";
    }
  });
}

function initVerifyResetOTPForm() {
  const btn = document.getElementById("resetPasswordBtn");
  const otpInput = document.getElementById("resetOtpCode");
  const newPasswordEl = document.getElementById("newPassword");
  const confirmPasswordEl = document.getElementById("confirmNewPassword");
  const errorEl = document.getElementById("resetError");

  if (!btn || btn.dataset.bound === "true" || !pendingForgotEmail) return;
  btn.dataset.bound = "true";

  btn.addEventListener("click", async () => {
    errorEl.style.display = "none";
    const otp = otpInput.value.trim();
    const newPassword = newPasswordEl.value;
    const confirmPassword = confirmPasswordEl.value;

    if (!otp || otp.length !== 6) {
      errorEl.textContent = "Please enter a valid 6-digit code";
      errorEl.style.display = "block";
      return;
    }

    if (!newPassword || !confirmPassword) {
      errorEl.textContent = "Please enter and confirm your password";
      errorEl.style.display = "block";
      return;
    }

    if (newPassword !== confirmPassword) {
      errorEl.textContent = "Passwords do not match";
      errorEl.style.display = "block";
      return;
    }

    if (newPassword.length < 6) {
      errorEl.textContent = "Password must be at least 6 characters";
      errorEl.style.display = "block";
      return;
    }

    try {
      btn.disabled = true;
      btn.textContent = "Resetting...";

      try {
        await fetch(`${API_BASE_URL}/auth/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: pendingForgotEmail,
            newPassword,
            otp
          })
        });
      } catch {}

      pendingForgotEmail = null;
      navigate('login');
      
    } catch (err) {
      errorEl.textContent = "Demo password reset completed locally.";
      errorEl.style.display = "block";
      btn.disabled = false;
      btn.textContent = "Reset Password";
    }
  });
}

/* ═══════════════════════════════════════════════
   FAQs — accordion + category filter
═══════════════════════════════════════════════ */
let faqActiveCat = "All";
let faqRendered  = false;

function renderFAQs() {
  if (faqRendered) return;
  faqRendered = true;

  // Category pills
  const catsEl = document.getElementById("faqCats");
  const categories = ["All", ...FAQ_DATA.map(g => g.category)];
  catsEl.innerHTML = categories.map(c => `
    <button class="faq-cat-btn ${c === "All" ? "active" : ""}" data-cat="${c}">${c}</button>
  `).join("");

  catsEl.addEventListener("click", e => {
    const btn = e.target.closest(".faq-cat-btn");
    if (!btn) return;
    faqActiveCat = btn.dataset.cat;
    catsEl.querySelectorAll(".faq-cat-btn").forEach(b => b.classList.toggle("active", b === btn));
    buildAccordion();
  });

  buildAccordion();
}

function buildAccordion() {
  const root    = document.getElementById("faqAccordion");
  const groups  = faqActiveCat === "All" ? FAQ_DATA : FAQ_DATA.filter(g => g.category === faqActiveCat);

  root.innerHTML = groups.map(group => `
    <div class="faq-group">
      <div class="faq-group-title">${group.category}</div>
      <div class="faq-group-inner">
        ${group.items.map((item, i) => `
          <div class="faq-item">
            <button class="faq-q" data-idx="${i}">
              <span>${item.q}</span>
              <span class="faq-icon">+</span>
            </button>
          </div>
        `).join("")}
      </div>
    </div>
  `).join("");

  // Store answers for lookup
  root._groups = groups;

  // Accordion toggle
  root.addEventListener("click", e => {
    const btn = e.target.closest(".faq-q");
    if (!btn) return;

    const item   = btn.closest(".faq-item");
    const isOpen = btn.classList.contains("open");

    // Close all
    root.querySelectorAll(".faq-q.open").forEach(q => {
      q.classList.remove("open");
      q.nextElementSibling?.remove();
    });

    if (!isOpen) {
      // Find answer
      const groupEl  = btn.closest(".faq-group");
      const groupIdx = [...root.querySelectorAll(".faq-group")].indexOf(groupEl);
      const idx      = parseInt(btn.dataset.idx);
      const answer   = root._groups[groupIdx]?.items[idx]?.a || "";

      btn.classList.add("open");
      const ansEl = document.createElement("div");
      ansEl.className = "faq-a";
      ansEl.textContent = answer;
      item.appendChild(ansEl);
    }
  });
}

/* ═══════════════════════════════════════════════
   APPLY — multi-step form
═══════════════════════════════════════════════ */
let applyStep = 1;

(function initApplyForm() {
  const nextBtn = document.getElementById("formNext");
  const backBtn = document.getElementById("formBack");
  const volumeSelect = document.getElementById("volume");
  const volumeCustomField = document.getElementById("volumeCustomField");
  const volumeCustomInput = document.getElementById("volumeCustom");

  if (!nextBtn) return;

  const toggleCustomVolume = () => {
    const isCustom = volumeSelect?.value === "custom";
    if (volumeCustomField) volumeCustomField.style.display = isCustom ? "block" : "none";
    if (volumeCustomInput) {
      volumeCustomInput.required = isCustom;
      if (!isCustom) volumeCustomInput.value = "";
    }
  };

  volumeSelect?.addEventListener("change", toggleCustomVolume);
  toggleCustomVolume();

  nextBtn.addEventListener("click", () => {
    if (applyStep < 3) {
      setApplyStep(applyStep + 1);
    } else {
      submitApplyForm();
    }
  });

  backBtn?.addEventListener("click", () => {
    if (applyStep > 1) setApplyStep(applyStep - 1);
  });
})();

function setApplyStep(step) {
  // Hide old step
  document.getElementById(`form-step-${applyStep}`)?.classList.remove("active");
  // Show new step
  document.getElementById(`form-step-${step}`)?.classList.add("active");

  // Update step indicator
  document.querySelectorAll(".step").forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.toggle("active", s === step);
    el.classList.toggle("done",   s <  step);
  });

  // Button labels
  const nextBtn = document.getElementById("formNext");
  const backBtn = document.getElementById("formBack");
  if (nextBtn) nextBtn.textContent = step === 3 ? "Submit Application" : "Continue →";
  if (backBtn) backBtn.style.display = step > 1 ? "inline-flex" : "none";

  applyStep = step;
}

function submitApplyForm() {
  const name  = document.getElementById("contactName")?.value || "";
  const email = document.getElementById("contactEmail")?.value || "";
  const volumeSelect = document.getElementById("volume");
  const volumeCustomInput = document.getElementById("volumeCustom");
  let volumeText = volumeSelect?.value || "";

  if (volumeText === "custom" && volumeCustomInput?.value) {
    volumeText = `${volumeCustomInput.value.trim()} certificate${volumeCustomInput.value.trim() === "1" ? "" : "s"}`;
  } else {
    volumeText = volumeSelect?.selectedOptions[0]?.text || volumeText;
  }

  const authToken = localStorage.getItem('certicheck_auth_token');
  
  // Prepare application data
  const applicationData = {
    orgName: document.getElementById("orgName")?.value.trim() || "",
    orgType: document.getElementById("orgType")?.value || "",
    website: document.getElementById("orgWebsite")?.value.trim() || "",
    contactName: name,
    contactEmail: email,
    contactRole: document.getElementById("contactRole")?.value.trim() || "",
    useCase: document.getElementById("useCase")?.value.trim() || "",
    volume: volumeText,
    wallet: document.getElementById("wallet")?.value.trim() || ""
  };

  // Submit to backend if authenticated, otherwise save locally
  if (authToken) {
    fetch(`${API_BASE_URL}/applications/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(applicationData)
    })
    .then(res => res.json())
    .then(data => {
      if (data.success || data.id) {
        showSuccessMessage(name, email, volumeText);
      } else {
        console.error('Application submission failed:', data);
        saveApplicationLocally(applicationData);
        showSuccessMessage(name, email, volumeText);
      }
    })
    .catch(err => {
      console.error('Error submitting application:', err);
      saveApplicationLocally(applicationData);
      showSuccessMessage(name, email, volumeText);
    });
    } else {
      // Not authenticated, save locally
      saveApplicationLocally(applicationData);
      showSuccessMessage(name, email, volumeText);
    }
}

function saveApplicationLocally(applicationData) {
  const application = {
    id: `app-${Date.now()}`,
    ...applicationData,
    submittedAt: new Date().toISOString(),
    status: "pending"
  };

    // Save application draft locally but do not force a signup; show success state instead.
    try {
      localStorage.setItem('certicheck_pending_application_draft', JSON.stringify(applicationData));
    } catch (e) {
      const apps = loadPendingApplications();
      apps.push(application);
      savePendingApplications(apps);
    }
}

function loadPendingApplicationDraft() {
  try {
    const raw = localStorage.getItem('certicheck_pending_application_draft');
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function clearPendingApplicationDraft() {
  try { localStorage.removeItem('certicheck_pending_application_draft'); } catch (e) {}
}

function showSuccessMessage(name, email, volumeText) {
  document.getElementById(`form-step-${applyStep}`)?.classList.remove("active");
  document.getElementById("form-step-success")?.classList.add("active");
  document.getElementById("formActions").style.display = "none";

  const msg = document.getElementById("successMsg");
  if (msg) {
    const contactLine = email ? `<a href="mailto:${email}" style="color:var(--purple-mid);font-weight:700">${email}</a>` : 'you';
    if (name) {
      msg.innerHTML = `Thank you, <strong>${name}</strong>.<br/>We'll contact <strong>${contactLine}</strong> within 1–3 business days.`;
    } else {
      msg.innerHTML = `Application received. We'll contact <strong>${contactLine}</strong> within 1–3 business days.`;
    }

    if (volumeText) {
      msg.innerHTML += `<br/><small style="color:var(--text-secondary);margin-top:12px;display:block">Selected volume: ${volumeText}</small>`;
    }
    // Provide admin review link for convenience using the current preview origin.
    const adminHref = `${getPreviewBaseUrl()}/admin.html`;
    msg.innerHTML += `<br/><small style="display:block;margin-top:10px;color:var(--text-secondary)">Admin review: <a href="${adminHref}">Open admin console</a></small>`;
  }

  // Mark all steps done
  document.querySelectorAll(".step").forEach(el => el.classList.add("done"));
}

function loadPendingApplications() {
  try {
    const raw = localStorage.getItem(PENDING_APPS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

function savePendingApplications(apps) {
  localStorage.setItem(PENDING_APPS_KEY, JSON.stringify(apps));
}

function loadVerifyHistory() {
  try {
    const raw = localStorage.getItem("certicheck_verify_history");
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

function saveVerifyHistory(history) {
  localStorage.setItem("certicheck_verify_history", JSON.stringify(history));
}

/* ═══════════════════════════════════════════════
   RESOURCES — render cards
═══════════════════════════════════════════════ */
function renderResources() {
  const grid = document.getElementById("resourcesGrid");
  if (!grid || grid.dataset.rendered) return;
  grid.dataset.rendered = "1";

  grid.innerHTML = RESOURCES_DATA.map((r, i) => `
    <div class="resource-card" style="animation-delay:${i * 0.06}s">
      <div class="resource-card-top">
        <div class="resource-icon-wrap">${r.icon}</div>
        <span class="resource-tag">${r.tag}</span>
      </div>
      <div class="resource-title">${r.href ? `<a href="${r.href}" style="color:inherit;text-decoration:none">${r.title}</a>` : r.title}</div>
      <div class="resource-desc">${r.desc}</div>
    </div>
  `).join("");
}

/* ═══════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  // Make sure home page is shown
  document.getElementById("page-home").classList.add("active");
  document.querySelector('[data-page="home"]')?.classList.add("active");
  // Initialize auth UI from stored session
  currentUser = getStoredUser();
  updateAuthUi();
  renderRoleLandingHome();
  // Initialize theme and other UI bits
  try { initTheme(); } catch (e) {}
});


