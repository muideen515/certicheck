<<<<<<< HEAD
import React, { useState } from 'react'
=======
import React, { useMemo, useCallback, useState } from 'react'
import {
  ConnectionProvider,
  WalletProvider,
  useWallet
} from '@solana/wallet-adapter-react'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import '@solana/wallet-adapter-react-ui/styles.css'
import * as web3 from '@solana/web3.js'
>>>>>>> origin/main

function IssueForm({ onResult }) {
  import React, { useMemo, useCallback, useState } from 'react'
  import {
    ConnectionProvider,
    WalletProvider,
    useWallet
  } from '@solana/wallet-adapter-react'
  import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
  import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
  import '@solana/wallet-adapter-react-ui/styles.css'
  import * as web3 from '@solana/web3.js'

<<<<<<< HEAD
    const wallet = useWallet()
    const [status, setStatus] = useState('')
    const [issueOnChain, setIssueOnChain] = useState(false)
    setStatus('Issuing via backend...')
    const onIssue = useCallback(async () => {
      if (issueOnChain && (!wallet.connected || !wallet.publicKey)) return alert('Connect a Phantom wallet first')
      setStatus(issueOnChain ? 'Preparing on-chain issuance...' : 'Issuing via backend...')
    if (!wallet.connected || !wallet.publicKey) return alert('Connect a Phantom wallet first')

    setStatus('Preparing issuance...')

    // For on-chain issuance: pin metadata via backend, build a memo tx, sign with Phantom, send, then record
>>>>>>> origin/main
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
      <div style={{ padding: 20 }}>
        <h2>Issuer Demo</h2>
    }
          <WalletMultiButton />

  return (
<<<<<<< HEAD
    <div style={{ padding: 20, borderRight: '1px solid #eee', minHeight: '240px' }}>
      <h3>Issue Certificate</h3>
      <div style={{ marginBottom: 12 }}>
        <button onClick={onIssue}>Issue Certificate (demo)</button>
=======
    <div style={{ padding: 20 }}>
      <h2>Issuer Demo</h2>
      <div style={{ marginBottom: 12 }}>
        <WalletMultiButton />
      </div>
      <div style={{ marginBottom: 12, fontSize: 13 }}>
        <strong>Wallet:</strong>{' '}
        {wallet.connected && wallet.publicKey ? wallet.publicKey.toString() : 'Not connected'}
      </div>
      <label style={{display:'block',marginBottom:8}}><input type="checkbox" checked={issueOnChain} onChange={e => setIssueOnChain(e.target.checked)} style={{marginRight:8}}/> Issue on-chain (devnet)</label>
      <div>
        <button disabled={!wallet.connected} onClick={onIssue}>Issue Certificate</button>
>>>>>>> origin/main
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
  const endpoint = useMemo(() => process.env.REACT_APP_SOLANA_RPC_URL || 'https://api.devnet.solana.com', [])
  const wallets = useMemo(() => [new PhantomWalletAdapter()], [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <div style={{ display: 'flex', minHeight: '100vh' }}>
          <IssueForm onResult={setLast} />
          <LookupForm />
        </div>
      </WalletProvider>
    </ConnectionProvider>
  )
}
