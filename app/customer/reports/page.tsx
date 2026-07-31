'use client'

import { useEffect, useState } from 'react'
import PortalShell, { usePortal } from '../PortalShell'

type Stats = { open: number; closed: number; total: number }

function ReportsContent() {
  const { venues, selectedVenueId } = usePortal()
  const [stats, setStats] = useState<Stats>({ open: 0, closed: 0, total: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ status: 'all' })
    if (selectedVenueId && selectedVenueId !== 'all') params.set('venue', selectedVenueId)
    fetch(`/api/customer/tickets?${params}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => setStats(data?.stats || { open: 0, closed: 0, total: 0 }))
      .finally(() => setLoading(false))
  }, [selectedVenueId])

  const visibleVenueCount = selectedVenueId && selectedVenueId !== 'all'
    ? venues.filter((venue) => venue.id === selectedVenueId).length
    : venues.length

  const resolvedRate = stats.total ? Math.round((stats.closed / stats.total) * 100) : 100

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="cp-page-title">Reports</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--anc-muted)' }}>
          Service summary, request trends, venue coverage, and renewal-ready proof.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="cp-panel p-5">
          <div className="cp-stat-value is-blue">{loading ? '...' : stats.open}</div>
          <div className="cp-stat-label mt-2">Open requests</div>
        </div>
        <div className="cp-panel p-5">
          <div className="cp-stat-value is-green">{loading ? '...' : stats.closed}</div>
          <div className="cp-stat-label mt-2">Resolved</div>
        </div>
        <div className="cp-panel p-5">
          <div className="cp-stat-value">{loading ? '...' : visibleVenueCount}</div>
          <div className="cp-stat-label mt-2">Venues</div>
        </div>
        <div className="cp-panel p-5">
          <div className="cp-stat-value">{loading ? '...' : `${resolvedRate}%`}</div>
          <div className="cp-stat-label mt-2">Resolved rate</div>
        </div>
      </div>
      <div className="cp-panel mt-6 p-6">
        <h2 className="cp-section-title mb-3">Monthly readout</h2>
        <p className="text-sm leading-6" style={{ color: 'var(--anc-muted)' }}>
          The portal report combines ticket volume, response activity, venue coverage, display-health signals, documents shared, and decisions pending with the client.
        </p>
      </div>
    </div>
  )
}

export default function CustomerReportsPage() {
  return (
    <PortalShell active="Reports">
      <ReportsContent />
    </PortalShell>
  )
}
