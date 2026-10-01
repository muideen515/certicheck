const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..', '..');
const indexHtml = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const scriptJs = fs.readFileSync(path.join(rootDir, 'script.js'), 'utf8');
const adminJs = fs.readFileSync(path.join(rootDir, 'admin.js'), 'utf8');

test('application form buttons do not submit the page', () => {
  assert.match(indexHtml, /<button type="button" class="btn-ghost" id="formBack"/);
  assert.match(indexHtml, /id="formBack"[^>]*>Back<\/button>/);
  assert.match(indexHtml, /<button type="button" class="btn-primary" id="formNext"/);
  assert.match(scriptJs, /nextBtn\.addEventListener\("click", \(event\) => \{\s*event\.preventDefault\(\);/s);
  assert.match(scriptJs, /if \(!validateApplyStep\(applyStep\)\) return;/);
  assert.match(scriptJs, /function validateApplyStep\(step\)/);
  assert.match(indexHtml, /id="orgName"[^>]*required/);
  assert.match(indexHtml, /id="orgType"[^>]*required/);
  assert.match(indexHtml, /id="contactName"[^>]*required/);
  assert.match(indexHtml, /id="contactEmailInput"[^>]*required/);
  assert.match(indexHtml, /id="contactRole"[^>]*required/);
  const useCaseField = indexHtml.match(/<textarea class="field-input" id="useCase"[^>]*>/)?.[0] || '';
  assert.doesNotMatch(useCaseField, /\brequired\b/);
  assert.match(indexHtml, /id="volume"[^>]*required/);
  const walletField = indexHtml.match(/<input class="field-input font-mono" id="wallet"[^>]*>/)?.[0] || '';
  assert.doesNotMatch(walletField, /\brequired\b/);
  assert.match(indexHtml, /for="useCase">Use Case <span[^>]*>\(optional\)<\/span>/);
  assert.match(indexHtml, /for="wallet">Solana Wallet Address <span[^>]*>\(optional\)<\/span>/);
  assert.doesNotMatch(indexHtml.match(/<input class="field-input" id="orgWebsite"[^>]*>/)?.[0] || '', /\brequired\b/);
  assert.match(indexHtml, /id="volumeCustom" type="number" min="1" step="1" placeholder="[^"]+" \/>/);
  assert.match(indexHtml, /<option value="custom">Custom<\/option>/);
  assert.match(scriptJs, /volumeCustomInput\.required = isCustom/);
  assert.match(scriptJs, /backBtn\?\.addEventListener\("click", \(event\) => \{\s*event\.preventDefault\(\);/s);
});

test('application confirmation does not show an auto-generated CertiCheck email', () => {
  assert.doesNotMatch(indexHtml, /generatedEmailCard|Your CertiCheck email/);
  assert.doesNotMatch(scriptJs, /generateCertiCheckEmail|generatedEmailCard/);
  assert.match(scriptJs, /showSuccessMessage\(officialEmail\)/);
});

test('forgot-password OTP screen provides a resend control with a 40-second cooldown', () => {
  assert.match(indexHtml, /id="resendResetOtpBtn"[^>]*disabled>Resend code in 40s/);
  assert.match(scriptJs, /FORGOT_OTP_RESEND_COOLDOWN_MS = 40_000/);
  assert.match(scriptJs, /beginForgotOtpResendCooldown\(\)/);
  assert.match(scriptJs, /\/auth\/forgot-password/);
  assert.match(scriptJs, /Resend code in \$\{remaining\}s/);
});

test('login guidance explains the default password and required password change', () => {
  assert.match(indexHtml, /default password is <strong>password<\/strong>.*must change it before you can access your account/i);
});

test('admin dashboard refreshes for successful applications without manual reload', () => {
  assert.match(adminJs, /startAdminDashboardPolling\(\)/);
  assert.match(adminJs, /loadAdminDashboard\(\)\.catch\(\(\) => \{\}\);/);
  assert.match(adminJs, /stopAdminDashboardPolling\(\)/);
});
