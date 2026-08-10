'use client'

import { useEffect, useState } from 'react'
import PortalShell, { usePortal } from '../PortalShell'

type DesignRequest = {
  id: string
  title: string
  venue_name: string
  boards: string | null
  sizes: string | null
  due_date: string | null
  updated_at: string
  state: 'in_progress' | 'awaiting_your_review' | 'approved' | 'complete'
  state_label: string
  needs_your_action: boolean
  proof_url: string | null
  responded_at: string | null
}

function ledClass(state: DesignRequest['state']) {
  if (state === 'awaiting_your_review') return 'is-work'
  if (state === 'approved' || state === 'complete') return 'is-done'
  return 'is-wait'
}

function chipClass(state: DesignRequest['state']) {
  if (state === 'awaiting_your_review') return 'p-high'
  if (state === 'approved' || state === 'complete') return 'p-low'
  return 'p-medium'
}

function fmtDate(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function DesignsContent() {
  const { selectedVenueId, refreshSignal } = usePortal()
  const [requests, setRequests] = useState<DesignRequest[]>([])
  const [awaiting, setAwaiting] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const qs = selectedVenueId ? `?venue=${encodeURIComponent(selectedVenueId)}` : ''
    fetch(`/api/customer/design-requests${qs}`)
      .then(async res => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Could not load your design requests.')
        return data
      })
      .then(data => {
        if (cancelled) return
        setRequests(data.requests || [])
        setAwaiting(data.awaiting_you || 0)
      })
      .catch(err => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedVenueId, refreshSignal])

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="cp-page-title">Design Requests</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--anc-muted)' }}>
          Your creative jobs and where each one stands.
          {awaiting > 0 ? ` ${awaiting} waiting on your review.` : ''}
        </p>
      </div>

      {error ? <div className="cp-error">{error}</div> : null}
      {loading ? (
        <div className="cp-panel p-6 text-sm" style={{ color: 'var(--anc-muted)' }}>Loading your design requests…</div>
      ) : (
        <div className="cp-panel overflow-hidden">
          {requests.length === 0 ? (
            <div className="p-4 text-sm" style={{ color: 'var(--anc-muted)' }}>
              No design requests yet.
            </div>
          ) : requests.map(req => (
            <div key={req.id} className="cp-row">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <span className={`cp-led ${ledClass(req.state)}`} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{req.title}</div>
                  <div className="mt-1 text-xs" style={{ color: 'var(--anc-muted)' }}>
                    {req.venue_name}
                    {req.boards ? ` · ${req.boards}` : ''}
                    {req.due_date ? ` · Due ${fmtDate(req.due_date)}` : ''}
                  </div>
                </div>
                <span className={`cp-chip ${chipClass(req.state)}`}>{req.state_label}</span>
                {req.proof_url ? (
                  <a href={req.proof_url} target="_blank" rel="noreferrer" className="cp-btn">
                    {req.needs_your_action ? 'Review proof' : 'View proof'}
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function CustomerDesignsPage() {
  return (
    <PortalShell active="Design Requests">
      <DesignsContent />
    </PortalShell>
  )
}
