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

interface DisplayVenueSummary {
  id: string
  name: string
  display_count: number
  open_issues: number
  last_service: string | null
}

interface DocumentSummary {
  id: string
  name: string
  venue_name: string
  created_at: string
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
  const { user, venues, refreshSignal, selectedVenueId } = usePortal()
  const [stats, setStats] = useState({ open: 0, closed: 0, total: 0 })
  const [recent, setRecent] = useState<Ticket[]>([])
  const [displayVenues, setDisplayVenues] = useState<DisplayVenueSummary[]>([])
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const scope = selectedVenueId && selectedVenueId !== 'all'
      ? `venue=${encodeURIComponent(selectedVenueId)}`
      : ''
    const scopedUrl = (path: string) => `${path}${scope ? `${path.includes('?') ? '&' : '?'}${scope}` : ''}`
    Promise.all([
      fetch(scopedUrl('/api/customer/tickets?status=all')).then(res => res.ok ? res.json() : null),
      fetch(scopedUrl('/api/customer/displays')).then(res => res.ok ? res.json() : null),
      fetch(scopedUrl('/api/customer/documents')).then(res => res.ok ? res.json() : null),
    ])
      .then(([ticketData, displayData, docData]) => {
        if (cancelled) return
        if (ticketData) {
          setStats(ticketData.stats || { open: 0, closed: 0, total: 0 })
          setRecent((ticketData.tickets || []).slice(0, 6))
        }
        setDisplayVenues((displayData?.venues || []).map((v: any) => ({
          id: v.id,
          name: v.name,
          display_count: Number(v.display_count || 0),
          open_issues: Number(v.open_issues || 0),
          last_service: v.last_service || null,
        })))
        setDocuments((docData?.documents || []).slice(0, 4))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [refreshSignal, selectedVenueId])

  const firstName = user?.fullName?.split(' ')[0]
  const visibleVenues = selectedVenueId && selectedVenueId !== 'all'
    ? venues.filter((venue) => venue.id === selectedVenueId)
    : venues
  const totalDisplays = displayVenues.reduce((sum, v) => sum + v.display_count, 0)
  const openDisplayIssues = displayVenues.reduce((sum, v) => sum + v.open_issues, 0)
  const serviceDates = displayVenues
    .map(v => v.last_service)
    .filter(Boolean)
    .sort()
  const lastService = serviceDates.length ? serviceDates[serviceDates.length - 1] : null

  return (
    <div className="max-w-5xl mx-auto">
      <div className="cp-hero">
        <div>
          <h1 className="cp-hero-title">{firstName ? `Welcome back, ${firstName}` : 'Welcome back'}</h1>
          <p className="cp-hero-sub">
            {openDisplayIssues > 0
              ? `${openDisplayIssues} display-health item${openDisplayIssues === 1 ? '' : 's'} currently being watched by ANC.`
              : stats.open === 0
                ? 'No open requests — everything is running clean.'
                : `${stats.open} open request${stats.open === 1 ? '' : 's'} being worked by the ANC team.`}
          </p>
        </div>
        <Link href="/customer/requests?new=1" className="cp-btn whitespace-nowrap">+ New request</Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8 cp-stagger">
        <Link href="/customer/requests" className="cp-panel cp-panel-hover p-5 block">
          <div className="cp-stat-value is-blue">{stats.open}</div>
          <div className="cp-stat-label mt-2">Open requests</div>
        </Link>
        <Link href="/customer/requests" className="cp-panel cp-panel-hover p-5 block">
          <div className="cp-stat-value is-green">{stats.closed}</div>
          <div className="cp-stat-label mt-2">Resolved</div>
        </Link>
        <div className="cp-panel p-5">
          <div className="cp-stat-value">{visibleVenues.length}</div>
          <div className="cp-stat-label mt-2">Venue{visibleVenues.length === 1 ? '' : 's'} under service</div>
        </div>
        <Link href="/customer/displays" className="cp-panel cp-panel-hover p-5 block">
          <div className={`cp-stat-value ${openDisplayIssues > 0 ? '' : 'is-green'}`}>{openDisplayIssues}</div>
          <div className="cp-stat-label mt-2">Display-health items</div>
        </Link>
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
          <h2 className="cp-section-title mb-3">Service snapshot</h2>
          <div className="cp-panel p-4 mb-6 space-y-4">
            <Link href="/customer/displays" className="flex items-center justify-between gap-3 cp-panel-hover rounded p-1 -m-1">
              <div>
                <div className="text-sm font-medium">Displays under service</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--anc-muted)' }}>
                  {totalDisplays || 'Display registry in setup'}
                </div>
              </div>
              <span className={`cp-led ${openDisplayIssues > 0 ? 'is-work' : 'is-done'}`} />
            </Link>
            <Link href="/customer/documents" className="flex items-center justify-between gap-3 cp-panel-hover rounded p-1 -m-1">
              <div>
                <div className="text-sm font-medium">Shared documents</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--anc-muted)' }}>
                  {documents.length ? `${documents.length} recent file${documents.length === 1 ? '' : 's'}` : 'No recent files'}
                </div>
              </div>
              <span className="cp-led is-open" />
            </Link>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Last service activity</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--anc-muted)' }}>
                  {lastService ? fmtDate(lastService) : 'No completed service logged yet'}
                </div>
              </div>
              <span className="cp-led is-closed" />
            </div>
          </div>

          <h2 className="cp-section-title mb-3">Your venues</h2>
          <div className="cp-panel p-2">
            {visibleVenues.length === 0 ? (
              <div className="p-4 text-sm" style={{ color: 'var(--anc-muted)' }}>No venues linked yet.</div>
            ) : (
              visibleVenues.map(v => (
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
            <div className="text-sm font-semibold mb-1">Need Support</div>
            <p className="text-xs" style={{ color: 'var(--anc-muted)', lineHeight: 1.6 }}>
              Tech Support: <a href="tel:+18888752125" className="font-medium">+1 (888) 875-2125</a>
              <br />
              Email: <a href="mailto:Support@anc.com" className="font-medium">Support@anc.com</a>
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
