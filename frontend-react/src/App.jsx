import React, { useState } from 'react'

async function connectWallet() {
  if (window.solana && window.solana.isPhantom) {
    const resp = await window.solana.connect()
    return resp.publicKey.toString()
  }
  alert('Phantom wallet not found — please install it.')
  return null
}

function IssueForm({ onResult }) {
  const [form, setForm] = useState({
    certificateId: 'CERT-FRONTEND-' + Date.now(),
    holderName: 'Frontend Holder',
    holderEmail: 'holder@example.com',
    certificateType: 'Demo Certificate',
    issuerName: 'Frontend Issuer',
    issuerWallet: 'demo-wallet',
    onChain: false
  })
  const [status, setStatus] = useState('')
  const [issuedCertificate, setIssuedCertificate] = useState(null)
  const [walletAddress, setWalletAddress] = useState('')

  const handleChange = (event) => {
    const { name, value, type, checked } = event.target
    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const onIssue = async () => {
    setStatus('Issuing via backend...')
    setIssuedCertificate(null)

    try {
      const payload = {
        certificateId: form.certificateId,
        holderName: form.holderName,
        holderEmail: form.holderEmail,
        certificateType: form.certificateType,
        issuerName: form.issuerName,
        issuerWallet: form.issuerWallet,
        onChain: form.onChain,
        metadata: { source: 'frontend-react' }
      }

      const res = await fetch('/api/certificates/issue', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer demo-token',
          'x-demo-user-type': 'issuer'
        },
        body: JSON.stringify(payload)
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Certificate issuance failed')
      }

      setIssuedCertificate(data?.certificate || data)
      setStatus(JSON.stringify(data, null, 2))
      if (onResult) onResult(data)
    } catch (err) {
      setStatus(JSON.stringify({ error: err.message }, null, 2))
    }
  }

  const handleConnectWallet = async () => {
    const address = await connectWallet()
    if (address) {
      setWalletAddress(address)
      setForm((current) => ({ ...current, issuerWallet: address }))
    }
  }

  return (
    <div style={{ padding: 20, borderRight: '1px solid #eee', minHeight: '240px', width: '50%' }}>
      <h3>Issue Certificate</h3>
      <div style={{ marginBottom: 12 }}>
        <button type="button" onClick={handleConnectWallet}>Connect Wallet</button>
      </div>
      {walletAddress && (
        <div style={{ marginBottom: 12, fontSize: 13 }}>
          <strong>Wallet:</strong> {walletAddress}
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        <label>
          Certificate ID
          <input name="certificateId" value={form.certificateId} onChange={handleChange} style={{ width: '100%' }} />
        </label>

        <label>
          Holder Name
          <input name="holderName" value={form.holderName} onChange={handleChange} style={{ width: '100%' }} />
        </label>

        <label>
          Holder Email
          <input name="holderEmail" value={form.holderEmail} onChange={handleChange} style={{ width: '100%' }} />
        </label>

        <label>
          Certificate Type
          <input name="certificateType" value={form.certificateType} onChange={handleChange} style={{ width: '100%' }} />
        </label>

        <label>
          Issuer Name
          <input name="issuerName" value={form.issuerName} onChange={handleChange} style={{ width: '100%' }} />
        </label>

        <label>
          Issuer Wallet
          <input name="issuerWallet" value={form.issuerWallet} onChange={handleChange} style={{ width: '100%' }} />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input name="onChain" type="checkbox" checked={form.onChain} onChange={handleChange} />
          Issue on-chain when configured
        </label>

        <button type="button" onClick={onIssue} style={{ width: 180 }}>
          Issue Certificate
        </button>
      </div>

      {issuedCertificate && (
        <div style={{ marginTop: 16, padding: 12, border: '1px solid #d9d9d9', borderRadius: 8, background: '#fafafa' }}>
          <h4 style={{ marginTop: 0 }}>Issued certificate</h4>
          <div><strong>Certificate ID:</strong> {issuedCertificate.certificate_id || issuedCertificate.certificateId || '—'}</div>
          <div><strong>IPFS CID:</strong> {issuedCertificate.ipfs_cid || issuedCertificate.ipfsCid || '—'}</div>
          <div><strong>Transaction Signature:</strong> {issuedCertificate.blockchain_transaction_id || issuedCertificate.blockchainTransactionId || '—'}</div>
        </div>
      )}

      <pre style={{ whiteSpace: 'pre-wrap', marginTop: 16 }}>{status || 'No result yet'}</pre>
    </div>
  )
}

function LookupForm() {
  const [id, setId] = useState('')
  const [result, setResult] = useState(null)
  const [walletAddress, setWalletAddress] = useState('')

  const handleConnectWallet = async () => {
    const address = await connectWallet()
    if (address) {
      setWalletAddress(address)
    }
  }

  async function onLookup() {
    setResult({ loading: true })
    try {
      const res = await fetch(`/api/certificates/lookup/${encodeURIComponent(id)}`)
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Lookup failed')
      }
      setResult(data)
    } catch (err) {
      setResult({ error: err.message })
    }
  }

  async function onRevoke() {
    setResult({ loading: true })
    try {
      const res = await fetch(`/api/certificates/revoke/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer demo-token',
          'x-demo-user-type': 'admin'
        },
        body: JSON.stringify({ reason: 'Revoked from frontend demo' })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error || 'Revocation failed')
      }
      setResult(data)
    } catch (err) {
      setResult({ error: err.message })
    }
  }

  return (
    <div style={{ padding: 20, width: '50%' }}>
      <h3>Lookup / Revoke</h3>
      <div style={{ marginBottom: 12 }}>
        <button type="button" onClick={handleConnectWallet}>Connect Wallet</button>
      </div>
      {walletAddress && (
        <div style={{ marginBottom: 12, fontSize: 13 }}>
          <strong>Wallet:</strong> {walletAddress}
        </div>
      )}
      <div style={{ marginBottom: 8 }}>
        <input
          placeholder="Certificate ID"
          value={id}
          onChange={(e) => setId(e.target.value)}
          style={{ width: 320, marginRight: 8 }}
        />
        <button onClick={onLookup}>Lookup</button>
        <button onClick={onRevoke} style={{ marginLeft: 8 }}>Revoke (admin)</button>
      </div>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{result ? JSON.stringify(result, null, 2) : 'No result'}</pre>
    </div>
  )
}

export default function App() {
  const [last, setLast] = useState(null)

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <IssueForm onResult={setLast} />
      <LookupForm last={last} />
    </div>
  )
}
