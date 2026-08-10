'use client'

import { useEffect, useState } from 'react'
import PortalShell, { usePortal } from '../PortalShell'

type PortalEvent = {
  id: string
  summary: string
  league: string | null
  event_date: string
  start_time: string
  end_time: string
  status: string
  event_type: string | null
  venue_name: string
}

function fmtDay(value: string) {
  return new Date(value).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function fmtTime(value: string) {
  return new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function EventRow({ event }: { event: PortalEvent }) {
  return (
    <div className="cp-row">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate">{event.summary}</div>
          <div className="mt-1 text-xs" style={{ color: 'var(--anc-muted)' }}>
            {event.venue_name}
            {event.league ? ` · ${event.league}` : ''}
            {' · '}
            {fmtTime(event.start_time)}–{fmtTime(event.end_time)}
          </div>
        </div>
        <span className="cp-chip">{fmtDay(event.event_date)}</span>
      </div>
    </div>
  )
}

function EventsContent() {
  const { selectedVenueId, refreshSignal } = usePortal()
  const [today, setToday] = useState<PortalEvent[]>([])
  const [upcoming, setUpcoming] = useState<PortalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    const qs = selectedVenueId ? `?venue=${encodeURIComponent(selectedVenueId)}` : ''
    fetch(`/api/customer/events${qs}`)
      .then(async res => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Could not load your schedule.')
        return data
      })
      .then(data => {
        if (cancelled) return
        setToday(data.today || [])
        setUpcoming(data.upcoming || [])
      })
      .catch(err => { if (!cancelled) setError(err.message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedVenueId, refreshSignal])

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="cp-page-title">Events</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--anc-muted)' }}>
          What&rsquo;s on today and what&rsquo;s lined up for the week at your venues.
        </p>
      </div>

      {error ? <div className="cp-error">{error}</div> : null}
      {loading ? (
        <div className="cp-panel p-6 text-sm" style={{ color: 'var(--anc-muted)' }}>Loading your schedule…</div>
      ) : (
        <>
          <div className="cp-section-title mb-2">Today</div>
          <div className="cp-panel overflow-hidden mb-6">
            {today.length === 0 ? (
              <div className="p-4 text-sm" style={{ color: 'var(--anc-muted)' }}>
                Nothing scheduled today.
              </div>
            ) : today.map(event => <EventRow key={event.id} event={event} />)}
          </div>

          <div className="cp-section-title mb-2">Next 7 days</div>
          <div className="cp-panel overflow-hidden">
            {upcoming.length === 0 ? (
              <div className="p-4 text-sm" style={{ color: 'var(--anc-muted)' }}>
                Nothing else scheduled this week.
              </div>
            ) : upcoming.map(event => <EventRow key={event.id} event={event} />)}
          </div>
        </>
      )}
    </div>
  )
}

export default function CustomerEventsPage() {
  return (
    <PortalShell active="Events">
      <EventsContent />
    </PortalShell>
  )
}
