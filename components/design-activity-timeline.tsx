'use client'

import { useEffect, useState } from 'react'

// Ticket history timeline (Charlie 2026-07-10). Reads the append-only activity
// log for one design request and renders it as a dated feed — added time,
// request submitted, proof creation, status changes, client responses,
// assignments, reschedules — newest first.

type ActivityEvent = {
  id: string
  eventType: string
  actorName: string | null
  actorEmail: string | null
  fromValue: string | null
  toValue: string | null
  detail: Record<string, unknown> | null
  createdAt: string
}

const STATUS_LABEL: Record<string, string> = {
  request_submitted: 'Request Submitted',
  in_queue: 'In Queue',
  in_progress: 'In Progress',
  in_qc: 'In Quality Control',
  client_review: 'Client Review',
  approved: 'Approved',
  done: 'Done',
  cancelled: 'Cancelled',
}

const prettyStatus = (s: string | null) =>
  s ? STATUS_LABEL[s] || s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : ''

const EVENT_DOT: Record<string, string> = {
  created: 'bg-zinc-400',
  status_change: 'bg-[#0A52EF]',
  time_logged: 'bg-amber-500',
  proof_created: 'bg-violet-500',
  proof_sent: 'bg-violet-600',
  client_response: 'bg-emerald-500',
  client_upload: 'bg-blue-500',
  assigned: 'bg-teal-500',
  unassigned: 'bg-zinc-400',
  rescheduled: 'bg-orange-500',
  comment: 'bg-zinc-500',
  note: 'bg-zinc-400',
}

function describe(e: ActivityEvent): { title: string; sub?: string } {
  const d = e.detail || {}
  switch (e.eventType) {
    case 'created':
      return { title: 'Request submitted', sub: (d.jobTitle as string) || undefined }
    case 'status_change':
      return {
        title: `Status → ${prettyStatus(e.toValue)}`,
        sub: e.fromValue
          ? `from ${prettyStatus(e.fromValue)}${d.auto ? ' · automatic' : ''}`
          : d.auto
            ? 'automatic'
            : undefined,
      }
    case 'time_logged': {
      const hrs = Number(d.hours || 0)
      const desc = (d.description as string) || ''
      return {
        title: `Logged ${hrs}h`,
        sub: [desc, d.entryDate ? `on ${String(d.entryDate)}` : ''].filter(Boolean).join(' · ') || undefined,
      }
    }
    case 'proof_created':
      return {
        title: 'Proof created',
        sub: [d.filename as string, d.version ? `v${d.version}` : ''].filter(Boolean).join(' · ') || undefined,
      }
    case 'proof_sent':
      return {
        title: 'Proof sent to client',
        sub: d.emailed ? `emailed ${(d.clientEmail as string) || 'client'}` : 'link generated',
      }
    case 'client_response': {
      const approvedCount = typeof d.approvedCount === 'number' ? d.approvedCount : null
      const changesCount = typeof d.changesCount === 'number' ? d.changesCount : null
      const counts =
        approvedCount != null && changesCount != null && (approvedCount || changesCount)
          ? `${approvedCount} approved · ${changesCount} changes`
          : undefined
      return {
        title: e.toValue === 'approved' ? 'Client approved' : 'Client requested changes',
        // Prefer the per-file rollup; fall back to the free-text note.
        sub: counts || (d.note as string) || undefined,
      }
    }
    case 'client_upload':
      return {
        title: 'Client uploaded replacement media',
        sub: e.toValue || undefined,
      }
    case 'assigned':
      return { title: 'Assigned', sub: e.toValue || undefined }
    case 'unassigned':
      return { title: 'Unassigned' }
    case 'rescheduled':
      return {
        title: 'Rescheduled',
        sub: `${e.fromValue || '—'} → ${e.toValue || '—'}`,
      }
    case 'comment':
      return { title: 'Comment', sub: (d.body as string) || undefined }
    default:
      return { title: e.eventType.replace(/_/g, ' ') }
  }
}

function formatWhen(iso: string): string {
  try {
    const dt = new Date(iso)
    return dt.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function DesignActivityTimeline({ designRequestId }: { designRequestId: string }) {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/design-requests/${designRequestId}/activity`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        setEvents(Array.isArray(data.activity) ? data.activity : [])
      })
      .catch((err) => {
        if (!cancelled) setError(String(err?.message || err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [designRequestId])

  return (
    <section className="mt-6 rounded-xl bg-white ring-1 ring-zinc-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-zinc-900">History</h2>
        {!loading && !error && (
          <span className="text-[11px] text-zinc-400">
            {events.length} {events.length === 1 ? 'event' : 'events'}
          </span>
        )}
      </div>

      {loading && <p className="text-sm text-zinc-400">Loading history…</p>}
      {error && <p className="text-sm text-rose-500">Couldn’t load history ({error}).</p>}
      {!loading && !error && events.length === 0 && (
        <p className="text-sm text-zinc-400">
          No activity recorded yet. New status changes, time entries, proofs, and client responses will appear here.
        </p>
      )}

      {!loading && !error && events.length > 0 && (
        <ol className="relative border-l border-zinc-200 pl-5 space-y-4">
          {events.map((e) => {
            const { title, sub } = describe(e)
            const fileResponses =
              e.eventType === 'client_response' && Array.isArray((e.detail || {}).fileResponses)
                ? ((e.detail as any).fileResponses as Array<{ name: string; response: string; note: string | null }>)
                : null
            return (
              <li key={e.id} className="relative">
                <span
                  className={`absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${
                    EVENT_DOT[e.eventType] || 'bg-zinc-400'
                  }`}
                />
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-zinc-900">{title}</span>
                  <span className="shrink-0 text-[11px] text-zinc-400">{formatWhen(e.createdAt)}</span>
                </div>
                {sub && <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>}
                {/* Per-file approved/denied breakdown so it's clear at a glance what
                    the client signed off vs sent back (Charlie 2026-07-15). */}
                {fileResponses && fileResponses.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {fileResponses.map((f, i) => {
                      const denied = f.response === 'changes_requested'
                      return (
                        <li key={i} className="flex items-start gap-1.5 text-xs">
                          <span className={`mt-0.5 shrink-0 ${denied ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {denied ? '✎' : '✓'}
                          </span>
                          <span className="min-w-0">
                            <span className="text-zinc-700">{f.name}</span>
                            <span className={`ml-1.5 ${denied ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {denied ? 'changes requested' : 'approved'}
                            </span>
                            {f.note && <span className="block text-zinc-500">{f.note}</span>}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}
                <div className="text-[11px] text-zinc-400 mt-0.5">{e.actorName || 'System'}</div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
