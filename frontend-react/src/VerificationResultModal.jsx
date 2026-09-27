import React, { useEffect, useMemo, useRef, useState } from 'react'
import './VerificationResultModal.css'

const RESULT_COPY = {
  valid: {
    label: 'VALID',
    message: 'This certificate is authentic and has not been revoked.',
    className: 'is-valid',
    iconLabel: 'Valid certificate'
  },
  revoked: {
    label: 'REVOKED',
    message: 'This certificate was issued but has been revoked by the issuer.',
    className: 'is-revoked',
    iconLabel: 'Revoked certificate warning'
  },
  not_found: {
    label: 'NOT FOUND',
    message: 'No certificate matches this ID. It may be invalid or never issued.',
    className: 'is-not-found',
    iconLabel: 'Certificate not found'
  }
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== '')
}

function formatDate(value) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString()
}

function StatusIcon({ status, label }) {
  if (status === 'valid') {
    return (
      <svg className="verification-result-icon" viewBox="0 0 96 96" role="img" aria-label={label}>
        <circle className="verification-result-icon-ring" cx="48" cy="48" r="43" />
        <path className="verification-result-icon-mark verification-result-icon-check" d="m27 49 14 14 29-31" />
      </svg>
    )
  }

  if (status === 'revoked') {
    return (
      <svg className="verification-result-icon" viewBox="0 0 96 96" role="img" aria-label={label}>
        <path className="verification-result-icon-ring" d="M48 5 92 84H4L48 5Z" />
        <path className="verification-result-icon-mark verification-result-icon-warning" d="M48 34v22m0 13h.1" />
      </svg>
    )
  }

  return (
    <svg className="verification-result-icon" viewBox="0 0 96 96" role="img" aria-label={label}>
      <circle className="verification-result-icon-ring" cx="48" cy="48" r="43" />
      <path className="verification-result-icon-mark verification-result-icon-cross" d="m33 33 30 30m0-30L33 63" />
    </svg>
  )
}

export default function VerificationResultModal({ open, onClose, status = 'not_found', certificate }) {
  const dialogRef = useRef(null)
  const closeRef = useRef(null)
  const [showExtraDetails, setShowExtraDetails] = useState(false)
  const safeStatus = RESULT_COPY[status] ? status : 'not_found'
  const copy = RESULT_COPY[safeStatus]

  const { details, extraDetails } = useMemo(() => {
    const metadata = certificate?.metadata || {}
    const core = [
      ['Certificate ID', firstValue(certificate?.certificate_id, certificate?.certificateId, certificate?.id)],
      ['Name', firstValue(certificate?.holder_name, certificate?.holderName, certificate?.recipient_name, certificate?.name, metadata.holderName)],
      ['Matric', firstValue(certificate?.matric_number, certificate?.matricNo, certificate?.matric, certificate?.student_id, metadata.matricNumber)],
      ['Issuer', firstValue(certificate?.issuer_name, certificate?.issuerName, metadata.issuerName)],
      ['Issued', formatDate(firstValue(certificate?.issued_at, certificate?.issuedAt, certificate?.verifiedAt, certificate?.checked_at, certificate?.created_at))],
      ['Status', copy.label],
      ...(safeStatus === 'revoked' ? [['Revoked', formatDate(firstValue(certificate?.revoked_at, certificate?.revokedAt))]] : [])
    ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')

    const extras = [
      ['Certificate type', firstValue(certificate?.certificate_type, certificate?.certificateType, metadata.certificateType)],
      ['Holder email', firstValue(certificate?.holder_email, certificate?.holderEmail, metadata.holderEmail)],
      ['Issuer wallet', firstValue(certificate?.issuer_wallet, certificate?.issuerWallet)],
      ['Transaction', firstValue(certificate?.blockchain_transaction_id, certificate?.blockchainTransactionId)]
    ].filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')

    return { details: core, extraDetails: extras }
  }, [certificate, copy.label, safeStatus])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open && !dialog.open) {
      dialog.showModal()
      closeRef.current?.focus()
      setShowExtraDetails(false)
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open])

  if (!open) return null

  return (
    <dialog
      ref={dialogRef}
      className={`verification-result-dialog ${copy.className}`}
      aria-labelledby="verification-result-title"
      aria-describedby="verification-result-message"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <article className="verification-result-card" role="status" aria-live="assertive">
        <button
          ref={closeRef}
          className="verification-result-dismiss"
          type="button"
          aria-label="Close verification result"
          onClick={onClose}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
        </button>

        <div className="verification-result-icon-wrap">
          <StatusIcon status={safeStatus} label={copy.iconLabel} />
        </div>
        <p className="verification-result-eyebrow">CERTIFICATE CHECK</p>
        <h2 id="verification-result-title" className="verification-result-title">{copy.label}</h2>
        <p id="verification-result-message" className="verification-result-message">{copy.message}</p>

        {details.length > 0 && (
          <section className="verification-result-details" aria-label="Certificate details">
            <dl>
              {details.map(([label, value]) => (
                <div className="verification-result-detail" key={label}>
                  <dt>{label}</dt>
                  <dd title={String(value)}>{value}</dd>
                </div>
              ))}
              {showExtraDetails && extraDetails.map(([label, value]) => (
                <div className="verification-result-detail" key={label}>
                  <dt>{label}</dt>
                  <dd title={String(value)}>{value}</dd>
                </div>
              ))}
            </dl>
            {safeStatus === 'valid' && extraDetails.length > 0 && (
              <button
                className="verification-result-details-toggle"
                type="button"
                aria-expanded={showExtraDetails}
                onClick={() => setShowExtraDetails((visible) => !visible)}
              >
                {showExtraDetails ? 'Hide details' : 'View details'}
              </button>
            )}
          </section>
        )}

        <button className="verification-result-primary" type="button" onClick={onClose}>Close</button>
      </article>
    </dialog>
  )
}