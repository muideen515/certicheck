const crypto = require('crypto');
const fetch = require('cross-fetch');

async function pinJsonToIpfs(payload) {
  const normalizedPayload = {
    ...payload,
    pinnedAt: new Date().toISOString()
  };

  if (process.env.PINATA_JWT) {
    try {
      const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.PINATA_JWT}`
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
      console.warn('Pinata pin failed:', response.status, errorData);
    } catch (err) {
      console.warn('Pinata upload failed, using local fallback:', err.message);
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
