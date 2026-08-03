# Backend Setup & Integration Checklist

## Phase 1: Backend Setup

### Prerequisites
- Node.js 16+ installed
- PostgreSQL installed & running
- npm installed

### Step 1: Install Dependencies
```bash
cd backend
npm install
```

### Step 2: Create PostgreSQL Database
```bash
# Linux/Mac
createdb certicheck

# Windows (via psql)
psql -U postgres -c "CREATE DATABASE certicheck;"
```

### Step 3: Configure Environment
```bash
cp .env.example .env
```

Edit `.env` with your PostgreSQL credentials:
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password_here
DB_NAME=certicheck
JWT_SECRET=choose_a_strong_secret_key_here
```

### Step 4: Initialize Database Schema
```bash
npm run setup-db
```

This creates all tables:
- `users` - User accounts
- `pending_applications` - Issuer applications
- `verify_history` - Certificate verification log
- `revoked_certificates` - Revoked certs
- `audit_log` - Complete audit trail
- `admin_access_log` - Admin dashboard access
- `wrong_password_attempts` - Failed login attempts
- `sessions` - Active sessions

### Step 5: Start Backend Server
```bash
npm run dev
```

Expected output:
```
✓ Certicheck backend running on http://localhost:5000
✓ Health check: http://localhost:5000/health
```

### Step 6: Test Health Check
```bash
curl http://localhost:5000/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "2026-06-23T...",
  "message": "Certicheck backend is running"
}
```

---

## Phase 2: Frontend Integration

### Option A: Replace localStorage with Backend (Recommended)

1. **Copy integration file to frontend:**
   ```bash
   cp backend/frontend-integration.js ../
   ```

2. **Update index.html to use the API wrapper:**
   ```html
   <!-- At the end of body, before other scripts -->
   <script src="frontend-integration.js"></script>
   ```

3. **Replace localStorage calls in admin.js:**
   
   **OLD (localStorage):**
   ```javascript
   function loadPendingApplications() {
     const raw = localStorage.getItem("certicheck_pending_applications");
     return raw ? JSON.parse(raw) : [];
   }
   ```

   **NEW (Backend API):**
   ```javascript
   async function loadPendingApplications() {
     const result = await ApplicationAPI.getPending();
     return result.applications || [];
   }
   ```

4. **Replace form submission in script.js:**
   
   **OLD (localStorage):**
   ```javascript
   function submitApplyForm() {
     // ... validation
     const app = { id: Date.now(), org Name, ...};
     apps.push(app);
     savePendingApplications(apps);
   }
   ```

   **NEW (Backend API):**
   ```javascript
   async function submitApplyForm() {
     // ... validation
     const result = await ApplicationAPI.submit(
       orgName, orgType, website, contactName, contactEmail, contactRole, volume, useCase, wallet
     );
     if (result.success) {
       showSuccessMessage("Application submitted!");
     }
   }
   ```

### Option B: Gradual Migration

Run both systems in parallel:
1. Keep localStorage for local testing
2. Add backend API calls in parallel
3. Gradually migrate sections
4. Remove localStorage fallbacks

---

## Phase 3: Authentication Integration

### Add Login/Register Page

Update your `index.html` to include:

```html
<div id="page-auth" class="page active">
  <div class="page-wrap">
    <div id="auth-register" style="display: block;">
      <h1>Create Account</h1>
      <form id="registerForm">
        <input type="email" placeholder="Email" id="registerEmail" required>
        <input type="password" placeholder="Password" id="registerPassword" required>
        <input type="text" placeholder="First Name" id="registerFirstName" required>
        <input type="text" placeholder="Last Name" id="registerLastName" required>
        <button type="submit" class="btn-primary">Register</button>
      </form>
      <p>Already have account? <a href="#" onclick="showLogin()">Login</a></p>
    </div>

    <div id="auth-login" style="display: none;">
      <h1>Login</h1>
      <form id="loginForm">
        <input type="email" placeholder="Email" id="loginEmail" required>
        <input type="password" placeholder="Password" id="loginPassword" required>
        <button type="submit" class="btn-primary">Login</button>
      </form>
      <p>Don't have account? <a href="#" onclick="showRegister()">Register</a></p>
    </div>
  </div>
</div>
```

### Add Auth Handlers to script.js

```javascript
// Register form
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const result = await AuthAPI.register(
    document.getElementById('registerEmail').value,
    document.getElementById('registerPassword').value,
    document.getElementById('registerFirstName').value,
    document.getElementById('registerLastName').value
  );
  if (result.success) {
    navigate('home');
  } else {
    alert(result.error);
  }
});

// Login form
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const result = await AuthAPI.login(
    document.getElementById('loginEmail').value,
    document.getElementById('loginPassword').value
  );
  if (result.success) {
    navigate('home');
  } else {
    alert(result.error);
  }
});

function showRegister() {
  document.getElementById('auth-register').style.display = 'block';
  document.getElementById('auth-login').style.display = 'none';
}

function showLogin() {
  document.getElementById('auth-register').style.display = 'none';
  document.getElementById('auth-login').style.display = 'block';
}
```

---

## Phase 4: Admin Dashboard Upgrade

Update admin.js to use backend:

```javascript
// Load pending apps from backend
async function loadPendingApplications() {
  const result = await ApplicationAPI.getPending();
  return result.applications || [];
}

// Save is no longer needed! Backend handles it
// function savePendingApplications(apps) { }

// Approve application
async function processApplication(action, id) {
  if (action === 'approve') {
    await ApplicationAPI.approve(id);
  } else if (action === 'reject') {
    await ApplicationAPI.reject(id);
  }
  renderAdminDashboard(); // Refresh display
}

// Revoke certificate
async function revokeHistoryEntry(id) {
  await VerifyAPI.revoke(id);
  renderAdminDashboard(); // Refresh display
}
```

---

## Phase 5: Audit Logging

All actions are automatically logged to database:

### View Audit Logs via API

```bash
curl "http://localhost:5000/api/admin/audit-log?limit=50" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Tracked Actions

- `LOGIN` / `LOGIN_FAILED` - User authentication
- `REGISTER` - New account creation
- `APPLICATION_SUBMIT` - Issuer application
- `APPLICATION_APPROVE` / `APPLICATION_REJECT` - Admin approvals
- `CERTIFICATE_VERIFY` - Certificate checks
- `CERTIFICATE_REVOKE` - Certificate revocation
- `ADMIN_ACCESS` - Admin dashboard access
- `PASSWORD_CHANGE` / `PROFILE_UPDATE` - User changes

### Access Audit Log in Admin Dashboard

Add to admin.html:

```html
<button class="admin-tab-button" data-section="audit">Audit Log</button>
```

Then in admin.js:

```javascript
if (adminCurrentSection === "audit") {
  const auditData = await AdminAPI.getAuditLog(50, 0);
  // Render audit log...
}
```

---

## Troubleshooting

### Backend won't start
```bash
# Check if port 5000 is in use
lsof -i :5000  # Mac/Linux
netstat -ano | findstr :5000  # Windows

# Kill process or change PORT in .env
```

### Database connection fails
```bash
# Verify PostgreSQL is running
psql -U postgres -c "SELECT version();"

# Check .env credentials
# Manually test connection:
psql -h localhost -U postgres -d certicheck
```

### CORS errors in browser
- Backend already has CORS enabled for localhost
- If using different port, update CORS in `backend/src/server.js`:
  ```javascript
  origin: ['http://localhost:YOUR_PORT', ...]
  ```

### Token errors
- Clear localStorage: `localStorage.clear()`
- Login again to get new token
- Check token in browser DevTools → Application → Local Storage

---

## Security Checklist

- [ ] Change JWT_SECRET in .env to random string
- [ ] Use strong PostgreSQL password
- [ ] Enable HTTPS in production
- [ ] Set up database backups
- [ ] Implement rate limiting
- [ ] Configure firewall rules
- [ ] Review audit logs regularly
- [ ] Rotate credentials periodically

---

## Next Steps

1. ✅ Backend setup complete
2. ⬜ Frontend authentication integration
3. ⬜ Replace all localStorage calls with API
4. ⬜ Test complete flow (register → apply → admin approve)
5. ⬜ Deploy to production

Let me know when each phase is complete!
