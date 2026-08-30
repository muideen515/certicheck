import React, { useState } from 'react'

function IssueForm({ onResult }) {
  const [status, setStatus] = useState('')

  async function onIssue() {
    setStatus('Issuing via backend...')
    try {
      const certificateId = `CERT-FRONTEND-${Date.now()}`
      const res = await fetch('/api/certificates/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token', 'x-demo-user-type': 'issuer' },
        body: JSON.stringify({ certificateId, holderName: 'Frontend Holder', holderEmail: 'holder@example.com', certificateType: 'Demo', issuerName: 'Frontend Issuer', issuerWallet: 'demo', onChain: false })
      })
      const j = await res.json()
      setStatus(JSON.stringify(j, null, 2))
      if (onResult) onResult(j)
    } catch (err) {
      setStatus('Error: ' + (err.message || err))
    }
  }

  return (
    <div style={{ padding: 20, borderRight: '1px solid #eee', minHeight: '240px' }}>
      <h3>Issue Certificate</h3>
      <div style={{ marginBottom: 12 }}>
        <button onClick={onIssue}>Issue Certificate (demo)</button>
      </div>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{status}</pre>
    </div>
  )
}

function LookupForm() {
  const [id, setId] = useState('')
  const [result, setResult] = useState(null)

  async function onLookup() {
    setResult({ loading: true })
    try {
      const res = await fetch(`/api/certificates/lookup/${encodeURIComponent(id)}`)
      const j = await res.json()
      setResult(j)
    } catch (err) {
      setResult({ error: err.message })
    }
  }

  async function onRevoke() {
    try {
      const res = await fetch(`/api/certificates/revoke/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer demo-token', 'x-demo-user-type': 'admin' }, body: JSON.stringify({ reason: 'Revoked from frontend demo' }) })
      const j = await res.json()
      setResult(j)
    } catch (err) {
      setResult({ error: err.message })
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h3>Lookup / Revoke</h3>
      <div style={{ marginBottom: 8 }}>
        <input placeholder="Certificate ID" value={id} onChange={e => setId(e.target.value)} style={{ width: 320 }} />
        <button onClick={onLookup} style={{ marginLeft: 8 }}>Lookup</button>
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
      <LookupForm />
    </div>
  )
}
