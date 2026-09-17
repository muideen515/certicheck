const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('frontend proxy targets the backend API server on port 5000', () => {
  const configPath = path.join(__dirname, '..', 'vite.config.js');
  const configText = fs.readFileSync(configPath, 'utf8');

  assert.match(configText, /http:\/\/localhost:5000/);
  assert.doesNotMatch(configText, /http:\/\/localhost:3000/);
});
