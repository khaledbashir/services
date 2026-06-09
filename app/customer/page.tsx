'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PortalShell, { usePortal } from './PortalShell'

interface Ticket {
  id: string
  ticket_number: number
  title: string
  priority: string
  status: string
  created_at: string
  venue_name: string
}

function ledClass(status: string) {
  if (status === 'new' || status === 'open') return 'is-open'
  if (status === 'in_progress') return 'is-work'
  if (status === 'waiting' || status === 'on_hold' || status === 'pending') return 'is-wait'
  if (status === 'resolved') return 'is-done'
  return 'is-closed'
}

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function OverviewContent() {
  const { user, venues, refreshSignal } = usePortal()
  const [stats, setStats] = useState({ open: 0, closed: 0, total: 0 })
  const [recent, setRecent] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/customer/tickets?status=all')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return
        setStats(data.stats || { open: 0, closed: 0, total: 0 })
        setRecent((data.tickets || []).slice(0, 6))
      })
      .finally(() => setLoading(false))
  }, [refreshSignal])

  const firstName = user?.fullName?.split(' ')[0]

  return (
    <div className="max-w-5xl mx-auto">
      <div className="cp-hero">
        <div>
          <h1 className="cp-hero-title">{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</h1>
          <p className="cp-hero-sub">
            {stats.open === 0
              ? 'No open requests — everything is running clean.'
              : `${stats.open} open request${stats.open === 1 ? '' : 's'} being worked by the ANC team.`}
          </p>
        </div>
        <Link href="/customer/requests?new=1" className="cp-btn whitespace-nowrap">+ New request</Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 cp-stagger">
        <Link href="/customer/requests" className="cp-panel cp-panel-hover p-5 block">
          <div className="cp-stat-value is-blue">{stats.open}</div>
          <div className="cp-stat-label mt-2">Open requests</div>
        </Link>
        <Link href="/customer/requests" className="cp-panel cp-panel-hover p-5 block">
          <div className="cp-stat-value is-green">{stats.closed}</div>
          <div className="cp-stat-label mt-2">Resolved</div>
        </Link>
        <div className="cp-panel p-5">
          <div className="cp-stat-value">{venues.length}</div>
          <div className="cp-stat-label mt-2">Venue{venues.length === 1 ? '' : 's'} under service</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="cp-section-title">Recent activity</h2>
            <Link href="/customer/requests" className="cp-link-sm">View all →</Link>
          </div>
          <div className="cp-panel overflow-hidden">
            {loading ? (
              <div className="p-10 text-center text-sm" style={{ color: 'var(--anc-muted)' }}>Loading…</div>
            ) : recent.length === 0 ? (
              <div className="p-10 text-center text-sm" style={{ color: 'var(--anc-muted)' }}>
                No requests yet — use the assistant or the New request button when something needs attention.
              </div>
            ) : (
              recent.map(t => (
                <Link key={t.id} href={`/customer/tickets/${t.id}`} className="cp-row">
                  <div className="flex items-center gap-3">
                    <span className={`cp-led ${ledClass(t.status)}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.title}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--anc-muted)' }}>
                        {t.venue_name} · {fmtDate(t.created_at)}
                      </div>
                    </div>
                    <span className="cp-status-text" style={{ color: 'var(--anc-muted)' }}>
                      {t.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div>
          <h2 className="cp-section-title mb-3">Your venues</h2>
          <div className="cp-panel p-2">
            {venues.length === 0 ? (
              <div className="p-4 text-sm" style={{ color: 'var(--anc-muted)' }}>No venues linked yet.</div>
            ) : (
              venues.map(v => (
                <div key={v.id} className="cp-venue-item">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--anc-brand)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" />
                  </svg>
                  <span className="text-sm truncate">{v.name}</span>
                </div>
              ))
            )}
          </div>

          <div className="cp-assist-card mt-6">
            <div className="text-sm font-semibold mb-1">Need a hand?</div>
            <p className="text-xs" style={{ color: 'var(--anc-muted)', lineHeight: 1.6 }}>
              The assistant in the corner can file a request for you, check status, or walk you through quick fixes.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CustomerOverviewPage() {
  return (
    <PortalShell active="Overview">
      <OverviewContent />
    </PortalShell>
  )
}
