const test = require('node:test');
const assert = require('node:assert/strict');

const configuredOrigin = 'https://issuer-login-test.example';
process.env.CORS_ORIGINS = [
  process.env.CORS_ORIGINS,
  configuredOrigin
].filter(Boolean).join(',');

const app = require('../src/server');

test('CORS preflight allows the configured frontend origin for login', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  t.after(() => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  }));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: configuredOrigin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type'
    }
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), configuredOrigin);
});
