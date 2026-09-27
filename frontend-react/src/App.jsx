import React, { useState } from 'react'
import VerificationResultModal from './VerificationResultModal'

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
  const [verification, setVerification] = useState(null)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [walletAddress, setWalletAddress] = useState('')

  const handleConnectWallet = async () => {
    const address = await connectWallet()
    if (address) {
      setWalletAddress(address)
    }
  }

  async function onLookup() {
    const certificateId = id.trim()
    if (!certificateId) {
      setResult({ error: 'Enter a certificate ID to verify.' })
      return
    }

    setResult(null)
    setVerification(null)
    setIsLookingUp(true)
    try {
      const res = await fetch(`/api/certificates/lookup/${encodeURIComponent(certificateId)}`)
      const data = await res.json()
      if (res.status === 404 || data?.status === 'not_found') {
        setVerification({ status: 'not_found', certificate: null })
        return
      }
      if (!res.ok) {
        throw new Error(data?.error || 'Lookup failed')
      }

      const certificate = data?.certificate || data
      const statusValue = String(
        certificate?.verification_status || certificate?.status || data?.status || 'valid'
      ).toLowerCase()
      const status = statusValue.includes('revok')
        ? 'revoked'
        : ['valid', 'approved', 'verified'].includes(statusValue)
          ? 'valid'
          : 'not_found'
      setVerification({ status, certificate })
    } catch (err) {
      setResult({ error: err.message })
    } finally {
      setIsLookingUp(false)
    }
  }

  async function onRevoke() {
    setVerification(null)
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
    <div className="certificate-lookup">
      <h3>Verify a Certificate</h3>
      <p className="certificate-lookup-intro">Check authenticity and revocation status by certificate ID.</p>
      <div className="certificate-lookup-wallet">
        <button type="button" onClick={handleConnectWallet}>Connect Wallet</button>
      </div>
      {walletAddress && (
        <div className="certificate-lookup-wallet-status">
          <strong>Wallet:</strong> {walletAddress}
        </div>
      )}
      <div className="certificate-lookup-controls">
        <input
          aria-label="Certificate ID"
          placeholder="Certificate ID"
          value={id}
          onChange={(e) => setId(e.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') onLookup() }}
        />
        <button type="button" onClick={onLookup} disabled={isLookingUp}>
          {isLookingUp ? 'Checking…' : 'Verify certificate'}
        </button>
        <button type="button" onClick={onRevoke} disabled={isLookingUp}>Revoke (admin)</button>
      </div>
      {result && (
        <div className={`certificate-lookup-feedback ${result.error ? 'is-error' : ''}`} role={result.error ? 'alert' : 'status'}>
          {result.loading ? 'Updating certificate…' : result.error || 'Certificate updated.'}
        </div>
      )}
      <VerificationResultModal
        open={Boolean(verification)}
        status={verification?.status || 'not_found'}
        certificate={verification?.certificate}
        onClose={() => setVerification(null)}
      />
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
