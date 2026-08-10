'use client'

import { useEffect, useState } from 'react'
import PortalShell, { usePortal } from '../PortalShell'

type Approval = {
  token: string
  title: string
  venue_name: string
  due_date: string | null
  shared_at: string
  message: string | null
  response: string | null
  responded_at: string | null
  note: string | null
  review_url: string
}

function fmtDate(value: string | null) {
  if (!value) return null
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function responseLabel(response: string | null) {
  if (response === 'approved') return 'Approved'
  if (response === 'changes_requested') return 'Changes requested'
  return response || ''
}

function ApprovalRow({ item, pending }: { item: Approval; pending: boolean }) {
  const approved = item.response === 'approved'
  return (
    <div className="cp-row">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <span className={`cp-led ${pending ? 'is-work' : approved ? 'is-done' : 'is-wait'}`} />
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{item.title}</div>
          <div className="mt-1 text-xs" style={{ color: 'var(--anc-muted)' }}>
            {item.venue_name}
            {/* The shared date always shows on pending rows: one job can have
                more than one proof package out at once, and without it two
                rows for the same job are indistinguishable. */}
            {pending
              ? `${item.due_date ? ` · Due ${fmtDate(item.due_date)}` : ''} · Shared ${fmtDate(item.shared_at)}`
              : ` · ${responseLabel(item.response)} ${fmtDate(item.responded_at)}`}
          </div>
          {!pending && item.note ? (
            <div className="mt-1 text-xs" style={{ color: 'var(--anc-muted)' }}>“{item.note}”</div>
          ) : null}
        </div>
        {pending ? <span className="cp-chip p-high">Needs your review</span> : (
          <span className={`cp-chip ${approved ? 'p-low' : 'p-medium'}`}>{responseLabel(item.response)}</span>
        )}
        <a href={item.review_url} target="_blank" rel="noreferrer" className={pending ? 'cp-btn' : 'cp-btn-ghost'}>
          {pending ? 'Review' : 'View'}
        </a>
      </div>
    </div>
  )
}

function ApprovalsContent() {
  const { selectedVenueId, refreshSignal } = usePortal()
  const [pending, setPending] = useState<Approval[]>([])
  const [decided, setDecided] = useState<Approval[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const qs = selectedVenueId ? `?venue=${encodeURIComponent(selectedVenueId)}` : ''
    fetch(`/api/customer/approvals${qs}`)
      .then(async res => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Could not load your approvals.')
        return data
      })
      .then(data => {
        if (cancelled) return
        setPending(data.pending || [])
        setDecided(data.decided || [])
      })
      .catch(err => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedVenueId, refreshSignal])

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="cp-page-title">Approvals</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--anc-muted)' }}>
          Proofs shared with you for review.
          {pending.length > 0 ? ` ${pending.length} waiting on you.` : ''}
        </p>
      </div>

      {error ? <div className="cp-error">{error}</div> : null}
      {loading ? (
        <div className="cp-panel p-6 text-sm" style={{ color: 'var(--anc-muted)' }}>Loading your approvals…</div>
      ) : (
        <>
          <div className="cp-section-title mb-2">Waiting on you</div>
          <div className="cp-panel overflow-hidden mb-6">
            {pending.length === 0 ? (
              <div className="p-4 text-sm" style={{ color: 'var(--anc-muted)' }}>
                Nothing needs your review right now.
              </div>
            ) : pending.map(item => <ApprovalRow key={item.token} item={item} pending />)}
          </div>

          <div className="cp-section-title mb-2">Already decided</div>
          <div className="cp-panel overflow-hidden">
            {decided.length === 0 ? (
              <div className="p-4 text-sm" style={{ color: 'var(--anc-muted)' }}>
                Nothing decided yet.
              </div>
            ) : decided.map(item => <ApprovalRow key={item.token} item={item} pending={false} />)}
          </div>
        </>
      )}
    </div>
  )
}

export default function CustomerApprovalsPage() {
  return (
    <PortalShell active="Approvals">
      <ApprovalsContent />
    </PortalShell>
  )
}
