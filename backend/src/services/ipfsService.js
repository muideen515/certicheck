const crypto = require('crypto');
const fetch = require('cross-fetch');

function getGatewayUri(cid) {
  return `https://gateway.pinata.cloud/ipfs/${cid}`;
}

async function readPinataError(response) {
  await response.text();
  return `Pinata pin failed: ${response.status}. Check the configured credential and request.`;
}

function validatePinataJwt(jwt) {
  if (jwt.trim() !== jwt || /[^\x21-\x7E]/.test(jwt)) {
    throw new Error('PINATA_JWT must be a single-line value containing only printable ASCII characters.');
  }
}

async function pinJsonToIpfs(payload, fetchImpl = fetch) {
  const normalizedPayload = {
    ...payload,
    pinnedAt: new Date().toISOString()
  };

  const configuredJwt = process.env.PINATA_JWT;
  if (configuredJwt) {
    try {
      validatePinataJwt(configuredJwt);
      const response = await fetchImpl('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${configuredJwt}`
        },
        body: JSON.stringify({ pinataContent: normalizedPayload })
      });

      if (response.ok) {
        const data = await response.json();
        if (!data.IpfsHash) throw new Error('Pinata pin failed: response did not include an IPFS CID.');
        return {
          cid: data.IpfsHash,
          uri: getGatewayUri(data.IpfsHash),
          source: 'pinata'
        };
      }

      const errorMessage = await readPinataError(response);
      console.error(errorMessage);
      throw new Error(errorMessage);
    } catch (err) {
      const safeError = err.message === 'PINATA_JWT must be a single-line value containing only printable ASCII characters.'
        ? err
        : new Error('Pinata metadata upload failed. Verify PINATA_JWT and network connectivity.');
      console.error(safeError.message);
      throw safeError;
    }
  }

  const digest = crypto.createHash('sha256').update(JSON.stringify(normalizedPayload)).digest('hex');
  const cid = digest.slice(0, 64);

  return {
    cid,
    uri: null,
    source: 'fallback'
  };
}

async function pinFileToIpfs({ dataUrl, filename }, fetchImpl = fetch) {
  if (!process.env.PINATA_JWT) {
    return { cid: null, uri: null, source: 'fallback' };
  }

  const match = typeof dataUrl === 'string'
    ? dataUrl.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/)
    : null;
  if (!match) throw new Error('Supporting file data is not a valid base64 data URL.');
  if (!/^[a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+$/.test(match[1])) {
    throw new Error('Supporting file has an invalid content type.');
  }

  const fileContent = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  const safeFilename = String(filename || 'certificate-attachment').replace(/[^a-zA-Z0-9._ -]/g, '_');
  const boundary = `----CerticheckPinata${crypto.randomBytes(12).toString('hex')}`;
  const multipartBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safeFilename}"\r\nContent-Type: ${match[1]}\r\n\r\n`),
    fileContent,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  try {
    validatePinataJwt(process.env.PINATA_JWT);
    const response = await fetchImpl('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Authorization: `Bearer ${process.env.PINATA_JWT}`
      },
      body: multipartBody
    });

    if (!response.ok) throw new Error(await readPinataError(response));
    const data = await response.json();
    if (!data.IpfsHash) throw new Error('Pinata file pin failed: response did not include an IPFS CID.');
    return {
      cid: data.IpfsHash,
      uri: getGatewayUri(data.IpfsHash),
      source: 'pinata'
    };
  } catch (err) {
    const safeError = err.message === 'PINATA_JWT must be a single-line value containing only printable ASCII characters.'
      ? err
      : new Error('Pinata file upload failed. Verify PINATA_JWT and network connectivity.');
    console.error(safeError.message);
    throw safeError;
  }
}

module.exports = {
  pinJsonToIpfs,
  pinFileToIpfs
};
