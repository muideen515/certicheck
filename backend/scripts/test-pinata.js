const { pinJsonToIpfs } = require('../src/services/ipfsService');

async function run() {
  try {
    const sample = {
      certificateId: 'TEST-PINATA-001',
      holderName: 'Pinata Test',
      issuerName: 'Certicheck',
      metadata: { test: true }
    };

    const res = await pinJsonToIpfs(sample);
    console.log('Pin result:', res);
    process.exit(0);
  } catch (err) {
    console.error('Pin test failed:', err.message || err);
    process.exit(2);
  }
}

run();
