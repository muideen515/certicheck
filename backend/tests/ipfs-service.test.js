const test = require('node:test');
const assert = require('node:assert/strict');
const { pinFileToIpfs, pinJsonToIpfs } = require('../src/services/ipfsService');

const originalPinataJwt = process.env.PINATA_JWT;

test.after(() => {
  if (originalPinataJwt === undefined) delete process.env.PINATA_JWT;
  else process.env.PINATA_JWT = originalPinataJwt;
});

test('JSON metadata uses the configured Pinata JWT and returns its CID and gateway URI', async () => {
  process.env.PINATA_JWT = 'test-pinata-token';
  let requestUrl;
  let requestOptions;
  const result = await pinJsonToIpfs({ certificateId: 'CERT-IPFS-001' }, async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return {
      ok: true,
      json: async () => ({ IpfsHash: 'bafyrealmetadata' })
    };
  });

  assert.equal(requestUrl, 'https://api.pinata.cloud/pinning/pinJSONToIPFS');
  assert.equal(requestOptions.headers.Authorization, 'Bearer test-pinata-token');
  assert.deepEqual(JSON.parse(requestOptions.body).pinataContent.certificateId, 'CERT-IPFS-001');
  assert.equal(result.cid, 'bafyrealmetadata');
  assert.equal(result.uri, 'https://gateway.pinata.cloud/ipfs/bafyrealmetadata');
  assert.equal(result.source, 'pinata');
});

test('configured Pinata failure throws instead of returning a fallback identifier', async () => {
  process.env.PINATA_JWT = 'test-pinata-token';
  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    await assert.rejects(
      pinJsonToIpfs({ certificateId: 'CERT-IPFS-FAIL' }, async () => ({
        ok: false,
        status: 401,
        text: async () => 'unauthorized'
      })),
      /Pinata metadata upload failed\. Verify PINATA_JWT and network connectivity\./
    );
  } finally {
    console.error = originalConsoleError;
  }
});

test('invalid configured Pinata credentials are rejected without exposing their value', async () => {
  const credential = `token-with-space ${'x'.repeat(10)}`;
  process.env.PINATA_JWT = credential;
  const originalConsoleError = console.error;
  let logged = '';
  console.error = message => { logged += String(message); };
  let called = false;

  try {
    await assert.rejects(
      pinJsonToIpfs({ certificateId: 'CERT-IPFS-INVALID' }, async () => {
        called = true;
        throw new Error('The invalid header should be rejected before fetch');
      }),
      /PINATA_JWT must be a single-line value containing only printable ASCII characters/
    );
    assert.equal(called, false);
    assert.equal(logged.includes(credential), false);
  } finally {
    console.error = originalConsoleError;
  }
});

test('file attachments use Pinata multipart upload; without a JWT they are explicitly not pinned', async () => {
  process.env.PINATA_JWT = 'test-pinata-token';
  let requestOptions;
  const result = await pinFileToIpfs({
    dataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
    filename: 'degree.pdf'
  }, async (url, options) => {
    requestOptions = options;
    return {
      ok: true,
      json: async () => ({ IpfsHash: 'bafyrealfile' })
    };
  });

  assert.match(requestOptions.headers['Content-Type'], /^multipart\/form-data; boundary=/);
  assert.equal(requestOptions.headers.Authorization, 'Bearer test-pinata-token');
  assert.match(requestOptions.body.toString(), /filename="degree\.pdf"/);
  assert.match(requestOptions.body.toString(), /%PDF-1\.4/);
  assert.deepEqual(result, {
    cid: 'bafyrealfile',
    uri: 'https://gateway.pinata.cloud/ipfs/bafyrealfile',
    source: 'pinata'
  });

  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      pinFileToIpfs({
        dataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
        filename: 'degree.pdf'
      }, async () => ({
        ok: false,
        status: 500,
        text: async () => 'pin service unavailable'
      })),
      /Pinata file upload failed\. Verify PINATA_JWT and network connectivity\./
    );
  } finally {
    console.error = originalConsoleError;
  }

  delete process.env.PINATA_JWT;
  let called = false;
  const fallback = await pinFileToIpfs({
    dataUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
    filename: 'degree.pdf'
  }, async () => {
    called = true;
    throw new Error('Must not send file without Pinata configuration');
  });
  assert.equal(called, false);
  assert.deepEqual(fallback, { cid: null, uri: null, source: 'fallback' });
});
