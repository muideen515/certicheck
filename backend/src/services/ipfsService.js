const crypto = require('crypto');
const fetch = require('cross-fetch');

async function pinJsonToIpfs(payload) {
  const normalizedPayload = {
    ...payload,
    pinnedAt: new Date().toISOString()
  };

  const configuredJwt = process.env.PINATA_JWT;
  if (configuredJwt) {
    try {
      const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${configuredJwt}`
        },
        body: JSON.stringify({ pinataContent: normalizedPayload })
      });

      if (response.ok) {
        const data = await response.json();
        return {
          cid: data.IpfsHash,
          uri: `ipfs://${data.IpfsHash}`,
          source: 'pinata'
        };
      }

      const errorData = await response.text();
      const errorMessage = `Pinata pin failed: ${response.status} ${errorData}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    } catch (err) {
      console.error('Pinata upload failed with configured credential:', err.message);
      throw err;
    }
  }

  const digest = crypto.createHash('sha256').update(JSON.stringify(normalizedPayload)).digest('hex');
  const cid = digest.slice(0, 64);

  return {
    cid,
    uri: `ipfs://bafy${cid.slice(0, 40)}`,
    source: 'fallback'
  };
}

async function createDemoIpfsRecord(payload) {
  return pinJsonToIpfs(payload);
}

module.exports = {
  pinJsonToIpfs
};
