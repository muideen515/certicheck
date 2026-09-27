const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const STORE_FILE = process.env.DEMO_ADMIN_STORE_FILE || path.join(__dirname, '..', 'data', 'demo-admins.json');

function readStore() {
  if (!fs.existsSync(STORE_FILE)) {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify([]));
  }

  const records = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
  if (!Array.isArray(records)) throw new Error('Demo admin store must contain a JSON array');
  return records;
}

function writeStore(records) {
  fs.writeFileSync(STORE_FILE, JSON.stringify(records, null, 2));
}

async function ensureDefaults(defaultAccounts) {
  const records = readStore();
  let changed = false;
  for (const account of defaultAccounts) {
    const email = String(account.email).trim().toLowerCase();
    if (records.some(record => record.email === email)) continue;
    const id = records.reduce((maxId, record) => Math.max(maxId, Number(record.id) || 0), 0) + 1;
    records.push({
      id,
      name: [account.firstName, account.lastName].filter(Boolean).join(' '),
      email,
      password_hash: await bcrypt.hash(account.password, 10),
      profile_picture_url: null,
      role: 'admin',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    changed = true;
  }
  if (changed) writeStore(records);
  return records;
}

async function findByEmail(email, defaultAccounts) {
  const records = await ensureDefaults(defaultAccounts);
  return records.find(record => record.email === String(email).trim().toLowerCase()) || null;
}

async function findById(id, defaultAccounts) {
  const records = await ensureDefaults(defaultAccounts);
  return records.find(record => Number(record.id) === Number(id)) || null;
}

async function verifyPassword(email, password, defaultAccounts) {
  const record = await findByEmail(email, defaultAccounts);
  if (!record || !await bcrypt.compare(String(password || ''), record.password_hash)) return null;
  return record;
}

async function updateProfile(id, updates, defaultAccounts) {
  const records = await ensureDefaults(defaultAccounts);
  const record = records.find(item => Number(item.id) === Number(id));
  if (!record) return null;
  if (updates.name !== null && updates.name !== undefined) record.name = updates.name;
  if (updates.updatePicture) record.profile_picture_url = updates.profilePicture;
  record.updated_at = new Date().toISOString();
  writeStore(records);
  return record;
}

async function updatePassword(id, password, defaultAccounts) {
  const records = await ensureDefaults(defaultAccounts);
  const record = records.find(item => Number(item.id) === Number(id));
  if (!record) return null;
  record.password_hash = await bcrypt.hash(password, 10);
  record.updated_at = new Date().toISOString();
  writeStore(records);
  return record;
}

module.exports = { findByEmail, findById, verifyPassword, updateProfile, updatePassword };
