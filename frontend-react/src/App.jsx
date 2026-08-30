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

function IssueForm() {
  const wallet = useWallet()
  const [status, setStatus] = useState(null)
  const [issueOnChain, setIssueOnChain] = useState(true)

  const onIssue = useCallback(async () => {
    if (!wallet.connected || !wallet.publicKey) return alert('Connect a Phantom wallet first')

    setStatus('Preparing issuance...')

    // For on-chain issuance: pin metadata via backend, build a memo tx, sign with Phantom, send, then record
    try {
      const holderWallet = wallet.publicKey.toString()
      const certificateId = `CERT-FRONTEND-${Date.now()}`
      const metadata = {
        certificateId,
        holderName: 'Frontend Holder',
        holderEmail: 'holder@example.com',
        certificateType: 'Demo',
        issuerName: 'Frontend Issuer',
        issuerWallet: holderWallet
      }

      // Pin metadata (pin endpoint is demo-friendly and public)
      const pinRes = await fetch('/api/certificates/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata })
      })
      const pinJson = await pinRes.json()
      if (!pinRes.ok || !pinJson.cid) throw new Error(pinJson.error || 'Pin failed')
      const ipfsCid = pinJson.cid

      if (issueOnChain) {
        setStatus('Signing transaction with Phantom...')
        const connection = new web3.Connection(web3.clusterApiUrl('devnet'), 'confirmed')
        const memoProgramId = new web3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')
        const memoData = JSON.stringify({ certificateId, ipfsCid, certificateType: metadata.certificateType })
        const ix = new web3.TransactionInstruction({ keys: [], programId: memoProgramId, data: Buffer.from(memoData) })
        const tx = new web3.Transaction().add(ix)
        tx.feePayer = wallet.publicKey
        const { blockhash } = await connection.getRecentBlockhash()
        tx.recentBlockhash = blockhash

        // Use wallet adapter signTransaction when available
        const signed = wallet.signTransaction ? await wallet.signTransaction(tx) : await window.solana.signTransaction(tx)
        const raw = signed.serialize()
        const sig = await connection.sendRawTransaction(raw)
        await connection.confirmTransaction(sig, 'confirmed')

        setStatus('Recording issuance on backend...')
        const recordRes = await fetch('/api/certificates/issue-client-signed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            certificateId,
            holderName: metadata.holderName,
            holderEmail: metadata.holderEmail,
            certificateType: metadata.certificateType,
            issuerName: metadata.issuerName,
            issuerWallet: metadata.issuerWallet,
            ipfsCid,
            blockchainTransactionId: sig,
            metadata
          })
        })
        const recordJson = await recordRes.json()
        setStatus(JSON.stringify({ pin: pinJson, tx: sig, record: recordJson }, null, 2))
        return
      }

      // Fallback: server-side issuance
      setStatus('Issuing via backend...')
      const res = await fetch('/api/certificates/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certificateId: metadata.certificateId,
          holderName: metadata.holderName,
          holderEmail: metadata.holderEmail,
          certificateType: metadata.certificateType,
          issuerName: metadata.issuerName,
          issuerWallet: metadata.issuerWallet,
          onChain: false
        })
      })
      const j = await res.json()
      setStatus(JSON.stringify(j, null, 2))
    } catch (err) {
      setStatus('Error: ' + (err.message || err))
    }
  }, [wallet])

  return (
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
      </div>
      <pre style={{ whiteSpace: 'pre-wrap' }}>{status}</pre>
    </div>
  )
}

export default function App() {
  const endpoint = 'https://api.devnet.solana.com'
  const wallets = useMemo(() => [new PhantomWalletAdapter()], [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <IssueForm />
      </WalletProvider>
    </ConnectionProvider>
  )
}
