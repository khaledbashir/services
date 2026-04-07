'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuth } from '@/lib/useAuth'
import { Skeleton } from '@/components/skeleton'

interface MyEvent {
  id: string
  summary: string
  venue_name: string
  league: string
  start_time: string
  event_date: string
  workflow_status: string
}

const workflowStatusColors: Record<string, { dot: string; label: string; pill: string }> = {
  pending: { dot: 'bg-rose-500', label: 'Pending', pill: 'bg-rose-50 text-rose-700' },
  checked_in: { dot: 'bg-amber-500', label: 'Checked In', pill: 'bg-amber-50 text-amber-700' },
  game_ready: { dot: 'bg-emerald-500', label: 'Game Ready', pill: 'bg-emerald-50 text-emerald-700' },
  post_game_submitted: { dot: 'bg-blue-500', label: 'Complete', pill: 'bg-blue-50 text-blue-700' },
}

export default function MyEventsPage() {
  const auth = useAuth()
  const [events, setEvents] = useState<MyEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'today' | 'upcoming' | 'past' | 'all'>('upcoming')

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const res = await fetch('/api/events?filter=all&limit=250')
        if (!res.ok) throw new Error('Failed to load assignments')
        const data = await res.json()
        setEvents(data.events || [])
      } catch (err) {
        console.error('Failed to load assigned events:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchEvents()
  }, [])

  const todayKey = new Date().toISOString().split('T')[0]
  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events.filter((event) => {
      const matchesSearch = !q
        || event.summary.toLowerCase().includes(q)
        || event.venue_name.toLowerCase().includes(q)
        || (event.league || '').toLowerCase().includes(q)

      if (!matchesSearch) return false

      if (filter === 'today') return event.event_date === todayKey
      if (filter === 'upcoming') return event.event_date >= todayKey
      if (filter === 'past') return event.event_date < todayKey
      return true
    })
  }, [events, filter, search, todayKey])

  const grouped = useMemo(() => {
    const today: MyEvent[] = []
    const upcoming: MyEvent[] = []
    const past: MyEvent[] = []

    for (const event of filteredEvents) {
      if (event.event_date === todayKey) today.push(event)
      else if (event.event_date > todayKey) upcoming.push(event)
      else past.push(event)
    }

    return { today, upcoming, past }
  }, [filteredEvents, todayKey])

  const formatTime = (dateTimeStr: string) => {
    const date = new Date(dateTimeStr)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  const renderSection = (title: string, items: MyEvent[]) => (
    <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E8E8E8] flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
          <p className="text-xs text-zinc-500 mt-1">{items.length} assigned event{items.length === 1 ? '' : 's'}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="px-5 py-10 text-center">
          <p className="text-sm text-zinc-500">No assigned events in this section.</p>
        </div>
      ) : (
        <div className="divide-y divide-[#E8E8E8]">
          {items.map((event) => {
            const status = workflowStatusColors[event.workflow_status] || workflowStatusColors.pending
            return (
              <Link
                key={event.id}
                href={`/workflow/${event.id}`}
                className="block px-5 py-4 hover:bg-zinc-50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`w-2 h-2 rounded-full ${status.dot}`}></span>
                      <p className="text-sm font-semibold text-zinc-900 truncate">{event.summary}</p>
                      {event.league && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-600">
                          {event.league}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-600 mt-1">{event.venue_name}</p>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 mt-2 flex-wrap">
                      <span>{event.event_date}</span>
                      <span>{formatTime(event.start_time)}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full font-medium ${status.pill}`}>{status.label}</span>
                    </div>
                  </div>
                  <div className="text-xs font-medium text-[#0A52EF] whitespace-nowrap">
                    Open Workflow →
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">My Events</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {auth.loaded && auth.userName
                ? `${auth.userName.split(' ')[0]}, these are the events assigned to you. Open any event to run through the workflow.`
                : 'Open any assigned event to run through the workflow.'}
            </p>
          </div>
          <div className="w-full lg:w-80">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assigned events or venues..."
              className="w-full px-4 py-2.5 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { key: 'upcoming', label: 'Upcoming' },
            { key: 'today', label: 'Today' },
            { key: 'past', label: 'Past' },
            { key: 'all', label: 'All' },
          ].map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key as typeof filter)}
              className={`px-3 py-2 rounded text-xs font-medium transition-colors ${
                filter === option.key
                  ? 'bg-[#0A52EF] text-white'
                  : 'bg-white border border-[#E8E8E8] text-zinc-600 hover:bg-zinc-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            {filter === 'today' && renderSection('Today', grouped.today)}
            {filter === 'upcoming' && (
              <>
                {renderSection('Today', grouped.today)}
                {renderSection('Upcoming', grouped.upcoming)}
              </>
            )}
            {filter === 'past' && renderSection('Past', grouped.past)}
            {filter === 'all' && (
              <>
                {renderSection('Today', grouped.today)}
                {renderSection('Upcoming', grouped.upcoming)}
                {renderSection('Past', grouped.past)}
              </>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
