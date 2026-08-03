const fetch = global.fetch;
const { Pool } = require('pg');
const email = 'api_test_user@example.com';
const base = 'http://localhost:5000/api/auth';
async function req(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({ error: 'invalid-json' }));
  console.log(`${path} -> ${res.status}`, JSON.stringify(data));
  return data;
}
(async () => {
  console.log('Sending signup OTP...');
  await req('/send-otp', { email });

  const pool = new Pool({ host: 'localhost', port: 5432, user: 'postgres', database: 'certicheck' });
  const otpResult = await pool.query(
    "SELECT otp_code FROM otp_verification WHERE email = $1 AND otp_type = 'signup' AND is_verified = false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
    [email]
  );
  const otp = otpResult.rows[0]?.otp_code;
  console.log('otp from db:', otp);
  if (!otp) {
    throw new Error('OTP not found');
  }

  await req('/verify-otp', { email, otp });
  await req('/register', { email, password: 'TestPass123!', firstName: 'Api', lastName: 'User', userType: 'user', otp });
  const loginResponse = await req('/login', { email, password: 'TestPass123!' });
  console.log('Login token present:', Boolean(loginResponse.token));
  await pool.end();
})();
