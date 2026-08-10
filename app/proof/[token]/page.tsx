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
  // Per-file review (FTP-backed proofs): null = not reviewed yet;
  // undefined = this share doesn't support per-file review.
  response?: 'approved' | 'changes_requested' | null
  responseAt?: string | null
}

type ShareState = 'pending' | 'approved' | 'changes_requested'

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
  viewCount: number
  clientResponse: 'approved' | 'changes_requested' | null
  clientResponseAt: string | null
  clientResponseNote: string | null
  attachments: Attachment[]
  previouslyApproved?: Array<{
    name: string
    sourceVersion: string
    note?: string | null
    at?: string | null
    archivedAt: string
  }>
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

  // Whole-proof response (single-file proofs, and "Approve all" shortcut)
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

  // Per-file response — records the decision for ONE proof, then moves the
  // reviewer along to the next file they haven't decided on yet.
  const submitFileResponse = async (
    fileId: string,
    response: 'approved' | 'changes_requested'
  ) => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/proof-share/${token}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          response,
          fileId,
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
      setResponseNote('')
      setResponseChoice(null)
      if (json.complete) {
        setSubmittedState(json.state)
        await loadProof()
        return
      }
      setData((current) => {
        if (!current) return current
        const attachments = current.attachments.map((a) =>
          a.id === fileId ? { ...a, response, responseAt: new Date().toISOString() } : a
        )
        // Advance to the next unreviewed file so a 12-proof folder is a
        // straight run-through instead of hunting through the dropdown.
        const next = attachments.find((a) => a.response === null && a.id !== fileId)
        if (next) setActiveAttachment(next.id)
        return { ...current, attachments }
      })
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

  // --- Error / 404 ---
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

  // Per-file review is available when the share reports per-file response
  // slots (FTP-backed proofs) and there's more than one file to decide on.
  const perFileMode =
    data.attachments.length > 1 &&
    data.attachments.some((a) => a.response !== undefined)
  const reviewedCount = data.attachments.filter((a) => a.response).length

  // Upload date, view count, and last-viewed are internal review telemetry.
  // The client-facing proof page never surfaces them (Charlie 2026-08-10) —
  // the same fields stay visible to staff on the internal ticket view.

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

        {!!data.previouslyApproved?.length && (
          <div className="px-6 py-4 border-b border-emerald-100 bg-emerald-50/70">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Previously approved — no action needed
            </div>
            <div className="mt-2 space-y-1.5">
              {data.previouslyApproved.map((item, index) => (
                <div key={`${item.name}-${item.sourceVersion}-${index}`} className="flex items-center gap-2 text-sm text-emerald-900">
                  <span className="font-semibold">✓</span>
                  <span className="min-w-0 truncate">{item.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-emerald-700">
                    {item.at ? new Date(item.at).toLocaleDateString() : 'Earlier version'}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-emerald-700">Only the revised files below require a new decision.</p>
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

        {/* File selector — named dropdown so reviewers can jump straight to
            the file they care about instead of decoding numbered buttons. */}
        {data.attachments.length > 1 && (
          <div className="px-6 py-3 border-b border-gray-100 bg-white">
            <label htmlFor="proof-file-select" className="sr-only">
              Select file to preview
            </label>
            <div className="flex items-center gap-2">
              <select
                id="proof-file-select"
                value={activeAttachment || ''}
                onChange={(e) => setActiveAttachment(e.target.value)}
                className="w-full min-w-0 px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[color:var(--anc-brand,#0A52EF)] focus:border-transparent"
              >
                {data.attachments.map((a, index) => (
                  <option key={a.id} value={a.id}>
                    {a.response === 'approved'
                      ? '✓ '
                      : a.response === 'changes_requested'
                        ? '✎ '
                        : ''}
                    {a.displayNumber || index + 1}. {a.name}
                  </option>
                ))}
              </select>
              <div className="shrink-0 flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous file"
                  disabled={activeIndex <= 0}
                  onClick={() => {
                    const prev = data.attachments[activeIndex - 1]
                    if (prev) setActiveAttachment(prev.id)
                  }}
                  className="px-2.5 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 disabled:opacity-40 hover:border-gray-300"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next file"
                  disabled={activeIndex < 0 || activeIndex >= data.attachments.length - 1}
                  onClick={() => {
                    const next = data.attachments[activeIndex + 1]
                    if (next) setActiveAttachment(next.id)
                  }}
                  className="px-2.5 py-2 rounded-lg border border-gray-200 text-xs text-gray-600 disabled:opacity-40 hover:border-gray-300"
                >
                  ›
                </button>
              </div>
            </div>
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
          </div>
        )}

        {/* Response section */}
        <div className="px-6 py-6">
          {hasResponded ? (
            <ResponseConfirmation data={data} submittedState={submittedState} />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-sm font-semibold text-gray-900">
                  {perFileMode && activeAtt
                    ? <>Your response — <span className="font-normal text-gray-600">{activeAtt.name}</span></>
                    : 'Your response'}
                </h2>
                {perFileMode && (
                  <span className="shrink-0 text-xs text-gray-500">
                    {reviewedCount} of {data.attachments.length} reviewed
                  </span>
                )}
              </div>

              {perFileMode && activeAtt?.response && (
                <div
                  className={`mb-4 rounded-lg border px-3 py-2 text-xs ${
                    activeAtt.response === 'approved'
                      ? 'border-green-200 bg-green-50 text-green-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                  }`}
                >
                  {activeAtt.response === 'approved'
                    ? 'You approved this file.'
                    : 'You requested changes on this file.'}{' '}
                  Pick again below to change your decision.
                </div>
              )}

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
                    onClick={() => {
                      if (perFileMode && activeAtt) {
                        if (responseChoice) submitFileResponse(activeAtt.id, responseChoice)
                      } else {
                        submitResponse()
                      }
                    }}
                    disabled={submitting}
                    className="w-full py-3 rounded-lg bg-[color:var(--anc-brand,#0A52EF)] text-white font-medium text-sm hover:opacity-90 disabled:opacity-50"
                  >
                    {submitting
                      ? 'Submitting…'
                      : perFileMode
                        ? responseChoice === 'approved'
                          ? 'Approve this file'
                          : 'Request changes on this file'
                        : responseChoice === 'approved'
                          ? 'Submit approval'
                          : 'Send change request'}
                  </button>
                </div>
              )}

              {perFileMode && reviewedCount === 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    setResponseChoice('approved')
                    setSubmitting(true)
                    try {
                      const res = await fetch(`/api/proof-share/${token}/respond`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          response: 'approved',
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
                  }}
                  disabled={submitting}
                  className="mt-4 w-full py-2.5 rounded-lg border border-green-300 bg-green-50 text-green-800 text-sm font-medium hover:bg-green-100 disabled:opacity-50"
                >
                  ✓ Approve all {data.attachments.length} files
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Charlie 2026-07-16: client can drop replacement media on the proof link */}
      <div className="mt-4 rounded-xl bg-white border border-gray-200 p-4">
          <div className="text-sm font-semibold text-gray-900">Send us replacement media</div>
          <p className="text-xs text-gray-500 mt-1 mb-3">
            Denied the proofs or sent the wrong files? Upload the correct media here and our designers will pick it up on this ticket.
          </p>
          <label className="inline-flex items-center gap-2 rounded-lg bg-[color:var(--anc-brand,#0A52EF)] text-white text-sm font-medium px-3 py-2 cursor-pointer hover:opacity-90">
            <input
              type="file"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const fd = new FormData()
                fd.append('file', file)
                try {
                  const res = await fetch(`/api/proof-share/${token}/client-upload`, {
                    method: 'POST',
                    body: fd,
                  })
                  const body = await res.json().catch(() => ({}))
                  if (!res.ok) {
                    alert(body.error || 'Upload failed')
                    return
                  }
                  alert(
                    body.proofFolderPath
                      ? `Uploaded “${file.name}” to the proof folder for our team.`
                      : `Uploaded “${file.name}” — our team can now pick it up.`
                  )
                } catch {
                  alert('Upload failed')
                } finally {
                  e.target.value = ''
                }
              }}
            />
            Upload media
          </label>
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
          preload="metadata"
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
      {data.attachments.some((a) => a.response) && (
        <div className="mt-4 pl-12 space-y-1">
          {data.attachments.map((a, index) => (
            <div key={a.id} className="flex items-center gap-2 text-xs">
              <span
                className={
                  a.response === 'changes_requested' ? 'text-amber-700' : 'text-green-700'
                }
              >
                {a.response === 'changes_requested' ? '✎' : '✓'}
              </span>
              <span className="text-gray-700 truncate">
                {a.displayNumber || index + 1}. {a.name}
              </span>
              <span className="text-gray-400">
                {a.response === 'changes_requested' ? 'changes requested' : 'approved'}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 pl-12 text-xs text-gray-500">
        The ANC team has been notified. Thanks for reviewing!
      </div>
    </div>
  )
}
