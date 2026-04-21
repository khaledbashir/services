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
        const res = await fetch('/api/events?filter=all&limit=250&mine=true')
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

  const formatDateLabel = (dateStr: string) => {
    const date = new Date(`${dateStr}T00:00:00`)
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const nextAssignedEvent = grouped.today[0] || grouped.upcoming[0] || null
  const inProgressCount = events.filter((event) => event.workflow_status === 'checked_in' || event.workflow_status === 'game_ready').length
  const completedCount = events.filter((event) => event.workflow_status === 'post_game_submitted').length
  const todayCount = events.filter((event) => event.event_date === todayKey).length
  const statCards = [
    { label: 'Today', value: todayCount, tone: 'text-[#0A52EF] bg-[#0A52EF]/8 border-[#0A52EF]/15' },
    { label: 'In Progress', value: inProgressCount, tone: 'text-amber-700 bg-amber-50 border-amber-200' },
    { label: 'Completed', value: completedCount, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  ]

  const renderSection = (title: string, items: MyEvent[]) => (
    <div className="bg-white rounded-2xl border border-[#E8E8E8] shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-[#E8E8E8] flex items-center justify-between bg-zinc-50/70">
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
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`w-2 h-2 rounded-full ${status.dot}`}></span>
                      <p className="text-sm font-semibold text-zinc-900">{event.summary}</p>
                      {event.league && (
                        <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-600">
                          {event.league}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-600 mt-1">{event.venue_name}</p>
                    <div className="flex items-center gap-3 text-xs text-zinc-500 mt-2 flex-wrap">
                      <span>{formatDateLabel(event.event_date)}</span>
                      <span>{formatTime(event.start_time)}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full font-medium ${status.pill}`}>{status.label}</span>
                    </div>
                  </div>
                  <div className="sm:text-right">
                    <div className="inline-flex items-center justify-center px-3 py-2 rounded-xl bg-[#0A52EF] text-white text-xs font-semibold whitespace-nowrap shadow-sm">
                      Open Workflow
                    </div>
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
        <div className="relative overflow-hidden rounded-[28px] border border-[#DDE7FF] bg-[linear-gradient(135deg,#0A52EF_0%,#1F7BF2_55%,#7FB5FF_100%)] px-5 py-6 text-white shadow-sm">
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-white/10 blur-2xl"></div>
          <div className="absolute bottom-0 right-0 h-24 w-24 rounded-full bg-[#7FB5FF]/25 blur-2xl"></div>
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] uppercase tracking-[0.28em] text-white/70 font-semibold">Technician View</p>
              <h1 className="text-3xl font-semibold mt-2">My Events</h1>
              <p className="text-sm text-white/80 mt-2">
                {auth.loaded && auth.userName
                  ? `${auth.userName.split(' ')[0]}, open the next assigned event and move through the workflow without waiting on a shared link.`
                  : 'Open the next assigned event and move through the workflow without waiting on a shared link.'}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {statCards.map((card) => (
                <div key={card.label} className={`min-w-[84px] rounded-2xl border px-3 py-3 backdrop-blur-sm ${card.tone}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{card.label}</p>
                  <p className="text-2xl font-semibold mt-1">{card.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {nextAssignedEvent && (
          <Link
            href={`/workflow/${nextAssignedEvent.id}`}
            className="block rounded-[24px] border border-[#E8E8E8] bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-[#0A52EF] font-semibold">Next Up</p>
                <h2 className="text-lg font-semibold text-zinc-900 mt-2">{nextAssignedEvent.summary}</h2>
                <p className="text-sm text-zinc-600 mt-1">{nextAssignedEvent.venue_name}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 mt-3">
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium">{formatDateLabel(nextAssignedEvent.event_date)}</span>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium">{formatTime(nextAssignedEvent.start_time)}</span>
                  {(nextAssignedEvent.league || '').trim() && (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium">{nextAssignedEvent.league}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-right">
                  <p className="text-xs text-zinc-500">Fastest path</p>
                  <p className="text-sm font-medium text-zinc-900">Arrive, open, check in</p>
                </div>
                <div className="inline-flex items-center justify-center rounded-2xl bg-[#0A52EF] px-4 py-3 text-sm font-semibold text-white shadow-sm">
                  Start Workflow
                </div>
              </div>
            </div>
          </Link>
        )}

        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Assignments</h2>
            <p className="text-sm text-zinc-500 mt-1">Use the filters below to jump between today, upcoming, and completed work.</p>
          </div>
          <div className="w-full lg:w-80">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search assigned events or venues..."
              className="w-full px-4 py-2.5 border border-[#E8E8E8] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
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
