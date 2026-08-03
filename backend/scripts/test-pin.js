require('dotenv').config();
const { pinJsonToIpfs } = require('../src/services/ipfsService');

async function run() {
  try {
    console.log('PINATA_JWT:', !!process.env.PINATA_JWT);
    const payload = { test: 'certicheck-pin-test', ts: new Date().toISOString() };
    const res = await pinJsonToIpfs(payload);
    console.log('pinJsonToIpfs result:', res);
  } catch (err) {
    console.error('Pin test failed:', err);
    process.exit(2);
  }
}

run();
