function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

const DEFAULT_ADMIN_PASSWORD = 'password';
const DEFAULT_ADMIN_ACCOUNTS = [
  {
    email: 'admin@certicheck.com',
    password: DEFAULT_ADMIN_PASSWORD,
    firstName: 'Admin',
    lastName: 'User',
    userType: 'admin'
  },
  {
    email: 'admin2@certicheck.com',
    password: DEFAULT_ADMIN_PASSWORD,
    firstName: 'Alex',
    lastName: 'Admin',
    userType: 'admin'
  },
  {
    email: 'admin3@certicheck.com',
    password: DEFAULT_ADMIN_PASSWORD,
    firstName: 'Jordan',
    lastName: 'Admin',
    userType: 'admin'
  }
];

module.exports = { DEFAULT_ADMIN_ACCOUNTS };
