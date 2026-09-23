const fs = require('node:fs');
const path = require('node:path');

const STORAGE_FILE = path.join(__dirname, '..', 'data', 'demo-applications.json');

function ensureStore() {
  const dir = path.dirname(STORAGE_FILE);
  fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(STORAGE_FILE)) {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify([]));
  }
}

function readStore() {
  ensureStore();
  const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
}

function writeStore(records) {
  ensureStore();
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(records, null, 2));
}

function makeId() {
  return `demo-app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeApp(app) {
  return {
    ...app,
    id: String(app.id),
    status: app.status || 'pending',
    submitted_at: app.submitted_at || new Date().toISOString(),
    reviewed_at: app.reviewed_at || null,
    reviewer_id: app.reviewer_id || null,
    issuer_id: app.issuer_id ?? 1
  };
}

function createApplication({ issuerId, orgName, orgType, website, contactName, contactEmail, contactRole, volume, useCase, wallet }) {
  const records = readStore();
  const app = normalizeApp({
    id: makeId(),
    issuer_id: issuerId || 1,
    organization_name: orgName,
    organization_type: orgType,
    organization_website: website,
    contact_name: contactName,
    contact_email: contactEmail,
    contact_role: contactRole,
    certificate_volume: volume,
    use_case: useCase,
    wallet_address: wallet,
    status: 'pending',
    submitted_at: new Date().toISOString(),
    reviewed_at: null,
    reviewer_id: null
  });
  records.push(app);
  writeStore(records);
  return {
    id: app.id,
    organization_name: app.organization_name,
    status: app.status,
    submitted_at: app.submitted_at
  };
}

function getApplicationsByStatus(status, limit = 50, offset = 0) {
  const records = readStore();
  const filtered = records.filter(app => app.status === status).slice(offset, offset + limit);
  return filtered.map(item => normalizeApp(item));
}

function getAllApplications(limit = 50, offset = 0) {
  const records = readStore();
  return records.slice(offset, offset + limit).map(item => normalizeApp(item));
}

function countByStatus(status) {
  const records = readStore();
  return records.filter(app => app.status === status).length;
}

function updateStatus(appId, status, reviewerId) {
  const records = readStore();
  const index = records.findIndex(app => String(app.id) === String(appId));
  if (index < 0) return null;

  records[index] = normalizeApp({
    ...records[index],
    status,
    reviewed_at: new Date().toISOString(),
    reviewer_id: reviewerId || null
  });
  writeStore(records);
  return records[index];
}

module.exports = {
  createApplication,
  getAllApplications,
  getApplicationsByStatus,
  countByStatus,
  updateStatus
};
