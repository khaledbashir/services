'use client'

import { useEffect, useState } from 'react'

type ActivityEvent = {
  id: string
  eventType: string
  actorName: string | null
  fromValue: string | null
  toValue: string | null
  detail: Record<string, unknown> | null
  createdAt: string
}

const STATUS_LABEL: Record<string, string> = {
  request_submitted: 'Request Submitted',
  in_progress: 'In Progress',
  submitted_internally: 'Submitted Internally',
  client_review: 'Client Review',
  revisions: 'Revisions',
  approved: 'Approved',
  on_hold: 'On Hold',
  request_closed: 'Request Closed',
  cancelled: 'Cancelled',
}

const label = (value: string | null) => value ? STATUS_LABEL[value] || value.replace(/_/g, ' ') : ''

function describe(event: ActivityEvent): { title: string; detail?: string } {
  const data = event.detail || {}
  switch (event.eventType) {
    case 'created': return { title: 'Request submitted', detail: String(data.jobTitle || '') || undefined }
    case 'status_change': return { title: `Status changed to ${label(event.toValue)}`, detail: event.fromValue ? `from ${label(event.fromValue)}` : undefined }
    case 'time_logged': return { title: `${Number(data.hours || event.toValue || 0)}h logged`, detail: String(data.description || '') || undefined }
    case 'proof_sent': return { title: 'Proof sent for client review', detail: data.fileCount ? `${data.fileCount} files` : undefined }
    case 'client_response': return { title: event.toValue === 'approved' ? 'Client approved the proof' : 'Client requested revisions', detail: String(data.note || '') || undefined }
    case 'client_upload': return { title: 'Client uploaded replacement media', detail: event.toValue || undefined }
    case 'comment': return { title: 'Comment added', detail: String(data.body || '') || undefined }
    default: return { title: event.eventType.replace(/_/g, ' ') }
  }
}

export function CgDesignActivityTimeline({ requestId }: { requestId: string }) {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/cg-designs/${requestId}/activity`, { cache: 'no-store' })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
      .then((data) => { if (!cancelled) setEvents(data.activity || []) })
      .catch(() => { if (!cancelled) setEvents([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [requestId])

  return (
    <section className="rounded-xl bg-white p-5 ring-1 ring-zinc-200">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">History</h2>
        {!loading && <span className="text-[11px] text-zinc-400">{events.length} events</span>}
      </div>
      {loading ? (
        <p className="text-sm text-zinc-400">Loading history...</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-zinc-400">New status changes, time entries, proofs, and comments will appear here.</p>
      ) : (
        <ol className="space-y-4 border-l border-zinc-200 pl-5">
          {events.map((event) => {
            const copy = describe(event)
            return (
              <li key={event.id} className="relative">
                <span className="absolute -left-[1.43rem] top-1.5 h-2.5 w-2.5 rounded-full bg-[#0A52EF] ring-2 ring-white" />
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-zinc-900">{copy.title}</span>
                  <span className="shrink-0 text-[11px] text-zinc-400">{new Date(event.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                </div>
                {copy.detail && <p className="mt-0.5 text-xs text-zinc-500">{copy.detail}</p>}
                <p className="mt-0.5 text-[11px] text-zinc-400">{event.actorName || 'System'}</p>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
