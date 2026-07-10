'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'

interface Attachment {
  id: string
  name: string
  extension: string
  category: 'image' | 'video' | 'pdf' | 'link' | 'other'
  fileUrl: string
  displayNumber?: number
  version?: number
  lastViewedAt?: string | null
  viewCount?: number
  uploadedAt?: string
}

type ShareState = 'pending' | 'approved' | 'changes_requested' | 'expired'

interface ProofData {
  token: string
  state: ShareState
  recordType: string
  recordName: string
  clientName: string | null
  message: string | null
  createdByName: string | null
  createdByEmail: string | null
  createdAt: string
  expiresAt: string | null
  viewCount: number
  clientResponse: 'approved' | 'changes_requested' | null
  clientResponseAt: string | null
  clientResponseNote: string | null
  attachments: Attachment[]
}

export default function ProofSharePage() {
  const { token } = useParams<{ token: string }>()
  const [data, setData] = useState<ProofData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeAttachment, setActiveAttachment] = useState<string | null>(null)

  // Response form state
  const [responseChoice, setResponseChoice] = useState<
    'approved' | 'changes_requested' | null
  >(null)
  const [responseNote, setResponseNote] = useState('')
  const [responseName, setResponseName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submittedState, setSubmittedState] = useState<ShareState | null>(null)

  const loadProof = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/proof-share/${token}`)
      if (res.status === 410) {
        const body = await res.json()
        setError(body.error || 'This proof link has expired.')
        setData({ ...(body as any), state: 'expired' })
        return
      }
      if (res.status === 404) {
        setError('This proof link could not be found. It may have been deleted or never existed.')
        return
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error || `Error loading proof (${res.status})`)
        return
      }
      const json: ProofData = await res.json()
      setData(json)
      setActiveAttachment((current) => current && json.attachments.some((a) => a.id === current) ? current : (json.attachments[0]?.id || null))
      // Fire-and-forget view tracking
      fetch(`/api/proof-share/${token}/view`, { method: 'POST' }).catch(() => {})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load proof')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadProof()
  }, [loadProof])

  const submitResponse = async () => {
    if (!responseChoice) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/proof-share/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response: responseChoice,
          note: responseNote || undefined,
          name: responseName || undefined,
        }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        alert(`Failed to submit: ${b.error || res.status}`)
        return
      }
      const json = await res.json()
      setSubmittedState(json.state)
      await loadProof()
    } finally {
      setSubmitting(false)
    }
  }

  // --- Loading ---
  if (loading) {
    return (
      <Shell>
        <div className="flex items-center justify-center py-24">
          <div className="text-sm text-gray-500 flex items-center gap-3">
            <svg
              className="w-5 h-5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
              <path d="M12 2a10 10 0 0110 10" />
            </svg>
            Loading proof…
          </div>
        </div>
      </Shell>
    )
  }

  // --- Error / expired / 404 ---
  if (error && !data) {
    return (
      <Shell>
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            Proof unavailable
          </h1>
          <p className="text-sm text-gray-600 max-w-md mx-auto">{error}</p>
          <p className="text-xs text-gray-400 mt-6">
            If you need access, please contact your ANC point of contact for a fresh link.
          </p>
        </div>
      </Shell>
    )
  }

  if (!data) return null

  // --- Expired ---
  if (data.state === 'expired') {
    return (
      <Shell>
        <div className="bg-white rounded-2xl border border-gray-200 p-10 text-center">
          <div className="text-5xl mb-4">⏰</div>
          <h1 className="text-xl font-semibold text-gray-900 mb-2">
            This proof link has expired
          </h1>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            {data.expiresAt && (
              <>Expired on {new Date(data.expiresAt).toLocaleDateString()}. </>
            )}
            Please contact your ANC point of contact for a fresh link.
          </p>
        </div>
      </Shell>
    )
  }

  const activeAtt = data.attachments.find((a) => a.id === activeAttachment)
  const activeIndex = activeAtt ? data.attachments.findIndex((a) => a.id === activeAtt.id) : -1
  const activeDisplayNumber = activeAtt
    ? activeAtt.displayNumber || activeIndex + 1
    : null
  const hasResponded =
    data.state === 'approved' ||
    data.state === 'changes_requested' ||
    submittedState === 'approved' ||
    submittedState === 'changes_requested'

  const formatAttachmentMeta = (attachment: Attachment) => {
    const uploaded = attachment.uploadedAt
      ? new Date(attachment.uploadedAt).toLocaleDateString()
      : ''
    const viewed = attachment.lastViewedAt
      ? `${Math.max(1, Math.floor((Date.now() - new Date(attachment.lastViewedAt).getTime()) / 3600000))}h ago`
      : 'not viewed yet'
    const viewCount = attachment.viewCount || 0
    return `Uploaded ${uploaded} · ${viewCount} view${viewCount === 1 ? '' : 's'} · Last viewed ${viewed}`
  }

  return (
    <Shell>
      {/* Record header */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] font-medium text-[color:var(--anc-brand,#0A52EF)] uppercase tracking-wider">
                {data.recordType}
              </span>
              <StateBadge state={data.state} submittedState={submittedState} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 truncate">{data.recordName}</h1>
            {data.clientName && (
              <div className="text-sm text-gray-500 mt-1">For {data.clientName}</div>
            )}
          </div>
          <div className="shrink-0 text-right text-xs text-gray-400 space-y-0.5">
            {data.createdByName && <div>Sent by {data.createdByName}</div>}
            <div>{new Date(data.createdAt).toLocaleDateString()}</div>
            {data.expiresAt && (
              <div>Expires {new Date(data.expiresAt).toLocaleDateString()}</div>
            )}
          </div>
        </div>

        {/* Optional designer message */}
        {data.message && (
          <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
            <div className="text-xs font-medium text-blue-900 mb-1 uppercase tracking-wide">
              Message from ANC
            </div>
            <div className="text-sm text-blue-900 whitespace-pre-wrap">{data.message}</div>
          </div>
        )}

        {/* File preview */}
        <div className="bg-gray-50 border-b border-gray-100">
          {activeAtt ? (
            <FilePreview attachment={activeAtt} />
          ) : (
            <div className="p-16 text-center text-gray-400 text-sm">No files attached</div>
          )}
        </div>

        {/* File selector / version history */}
        {data.attachments.length > 1 && (
          <div className="px-6 py-3 flex gap-2 overflow-x-auto border-b border-gray-100 bg-white">
            {data.attachments.map((a, index) => (
              <button
                key={a.id}
                onClick={() => setActiveAttachment(a.id)}
                title={a.version ? `Proof ${a.displayNumber || index + 1} · stored version v${a.version}` : `Proof ${a.displayNumber || index + 1}`}
                aria-label={`Open proof ${a.displayNumber || index + 1}`}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border transition ${
                  activeAttachment === a.id
                    ? 'bg-[color:var(--anc-brand,#0A52EF)] text-white border-transparent'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                }`}
              >
                {a.displayNumber || index + 1}
              </button>
            ))}
          </div>
        )}

        {activeAtt && (
          <div className="px-6 py-3 border-b border-gray-100 bg-white/80">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex rounded-full bg-[color:var(--anc-brand,#0A52EF)]/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--anc-brand,#0A52EF)]">
                Proof {activeDisplayNumber}
              </span>
              <span className="text-xs text-gray-500">{activeAtt.name}</span>
            </div>
            <div className="mt-2 text-xs text-gray-400">{formatAttachmentMeta(activeAtt)}</div>
          </div>
        )}

        {/* Response section */}
        <div className="px-6 py-6">
          {hasResponded ? (
            <ResponseConfirmation data={data} submittedState={submittedState} />
          ) : (
            <>
              <h2 className="text-sm font-semibold text-gray-900 mb-4">Your response</h2>

              <div className="grid grid-cols-2 gap-3 mb-5">
                <ChoiceCard
                  label="Approve"
                  emoji="✓"
                  active={responseChoice === 'approved'}
                  tone="green"
                  onClick={() => setResponseChoice('approved')}
                />
                <ChoiceCard
                  label="Request changes"
                  emoji="✎"
                  active={responseChoice === 'changes_requested'}
                  tone="amber"
                  onClick={() => setResponseChoice('changes_requested')}
                />
              </div>

              {responseChoice && (
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Your name (optional)"
                    value={responseName}
                    onChange={(e) => setResponseName(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--anc-brand,#0A52EF)] focus:border-transparent"
                  />
                  <textarea
                    placeholder={
                      responseChoice === 'approved'
                        ? 'Optional note (looks great! / ship it)'
                        : 'What needs to change? Be as specific as you can.'
                    }
                    value={responseNote}
                    onChange={(e) => setResponseNote(e.target.value)}
                    rows={4}
                    className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--anc-brand,#0A52EF)] focus:border-transparent resize-none"
                  />
                  <button
                    onClick={submitResponse}
                    disabled={submitting}
                    className="w-full py-3 rounded-lg bg-[color:var(--anc-brand,#0A52EF)] text-white font-medium text-sm hover:opacity-90 disabled:opacity-50"
                  >
                    {submitting
                      ? 'Submitting…'
                      : responseChoice === 'approved'
                        ? 'Submit approval'
                        : 'Send change request'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Meta footer */}
      <div className="mt-4 flex items-center justify-between text-xs text-gray-400 px-2">
        <div>
          🔒 Secure link
          {data.viewCount > 0 && ` · ${data.viewCount} view${data.viewCount > 1 ? 's' : ''}`}
        </div>
        {data.createdByEmail && (
          <a
            href={`mailto:${data.createdByEmail}?subject=Re: ${encodeURIComponent(data.recordName)}`}
            className="hover:text-gray-600"
          >
            Questions? Email {data.createdByEmail}
          </a>
        )}
      </div>
    </Shell>
  )
}

// ============================================================
// Components
// ============================================================

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen bg-gray-50 py-10 px-4"
      style={{ ['--anc-brand' as any]: '#0A52EF' }}
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-[color:var(--anc-brand)] flex items-center justify-center">
            <span className="text-white font-bold text-xs tracking-tight">ANC</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">ANC Sports</div>
            <div className="text-xs text-gray-500">Proof review</div>
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}

function StateBadge({
  state,
  submittedState,
}: {
  state: ShareState
  submittedState: ShareState | null
}) {
  const effective = submittedState || state
  if (effective === 'approved') {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
        APPROVED
      </span>
    )
  }
  if (effective === 'changes_requested') {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
        CHANGES REQUESTED
      </span>
    )
  }
  return (
    <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
      AWAITING REVIEW
    </span>
  )
}

function FilePreview({ attachment }: { attachment: Attachment }) {
  const { category, fileUrl, name } = attachment
  if (category === 'image') {
    return (
      <div className="flex items-center justify-center p-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={fileUrl}
          alt={name}
          className="max-w-full max-h-[70vh] rounded-lg shadow-sm bg-white object-contain"
        />
      </div>
    )
  }
  if (category === 'video') {
    return (
      <div className="flex items-center justify-center p-6">
        <video
          src={fileUrl}
          controls
          className="max-w-full max-h-[70vh] rounded-lg bg-black"
        />
      </div>
    )
  }
  if (category === 'pdf') {
    return (
      <div className="p-4">
        <iframe
          src={fileUrl}
          className="w-full h-[75vh] rounded-lg bg-white border border-gray-200"
          title={name}
        />
      </div>
    )
  }
  if (category === 'link') {
    return (
      <div className="p-16 text-center">
        <div className="text-5xl mb-3">🔗</div>
        <div className="text-sm text-gray-700 mb-1">External Proof Link</div>
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block mt-4 px-4 py-2 bg-[color:var(--anc-brand)] text-white rounded-lg text-sm font-medium hover:opacity-90"
        >
          Open link
        </a>
      </div>
    )
  }
  return (
    <div className="p-16 text-center">
      <div className="text-5xl mb-3">📄</div>
      <div className="text-sm text-gray-700 mb-1">{name}</div>
      <a
        href={fileUrl}
        download
        className="inline-block mt-4 px-4 py-2 bg-[color:var(--anc-brand)] text-white rounded-lg text-sm font-medium hover:opacity-90"
      >
        Download file
      </a>
    </div>
  )
}

function ChoiceCard({
  label,
  emoji,
  active,
  tone,
  onClick,
}: {
  label: string
  emoji: string
  active: boolean
  tone: 'green' | 'amber'
  onClick: () => void
}) {
  const base = 'border-2 rounded-xl p-4 text-center cursor-pointer transition'
  const inactive = 'border-gray-200 hover:border-gray-300 bg-white'
  const greenActive = 'border-green-500 bg-green-50'
  const amberActive = 'border-amber-500 bg-amber-50'
  const activeClass = tone === 'green' ? greenActive : amberActive
  return (
    <button onClick={onClick} className={`${base} ${active ? activeClass : inactive}`}>
      <div className="text-2xl mb-1">{emoji}</div>
      <div className={`text-sm font-medium ${active ? 'text-gray-900' : 'text-gray-700'}`}>
        {label}
      </div>
    </button>
  )
}

function ResponseConfirmation({
  data,
  submittedState,
}: {
  data: ProofData
  submittedState: ShareState | null
}) {
  const state = submittedState || data.state
  const approved = state === 'approved'
  const response = data.clientResponse || (approved ? 'approved' : 'changes_requested')
  const at = data.clientResponseAt
    ? new Date(data.clientResponseAt).toLocaleString()
    : 'just now'
  const note = data.clientResponseNote

  return (
    <div
      className={`rounded-xl p-5 border-2 ${
        approved ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
      }`}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="text-3xl">{approved ? '✅' : '✏️'}</div>
        <div>
          <div className="text-sm font-semibold text-gray-900">
            {approved ? 'Approved' : 'Changes requested'}
          </div>
          <div className="text-xs text-gray-600">Submitted {at}</div>
        </div>
      </div>
      {note && (
        <div className="mt-3 pl-12 text-sm text-gray-800 whitespace-pre-wrap">
          {note}
        </div>
      )}
      <div className="mt-4 pl-12 text-xs text-gray-500">
        The ANC team has been notified. Thanks for reviewing!
      </div>
    </div>
  )
}
