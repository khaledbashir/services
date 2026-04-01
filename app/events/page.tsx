'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton, TableSkeleton } from '@/components/skeleton'

interface Event {
  id: string
  summary: string
  venue_name: string
  league: string
  start_time: string
  event_date: string
  workflow_status: string
  date?: string
  time?: string
}

const leagueColors: Record<string, { bg: string; text: string; hex: string }> = {
  NBA: { bg: 'bg-orange-50', text: 'text-orange-600', hex: '#f97316' },
  NHL: { bg: 'bg-blue-50', text: 'text-blue-600', hex: '#3b82f6' },
  NCAAM: { bg: 'bg-violet-50', text: 'text-violet-600', hex: '#7c3aed' },
  NCAAW: { bg: 'bg-pink-50', text: 'text-pink-600', hex: '#ec4899' },
  MLB: { bg: 'bg-red-50', text: 'text-red-600', hex: '#dc2626' },
  AHL: { bg: 'bg-teal-50', text: 'text-teal-600', hex: '#14b8a6' },
  'NBA G League': { bg: 'bg-orange-50', text: 'text-orange-500', hex: '#f97316' },
  MiLB: { bg: 'bg-emerald-50', text: 'text-emerald-600', hex: '#10b981' },
}

const workflowStatusColors: Record<string, { dot: string; label: string }> = {
  pending: { dot: 'bg-zinc-300', label: 'Pending' },
  checked_in: { dot: 'bg-amber-500', label: 'Checked In' },
  game_ready: { dot: 'bg-emerald-500', label: 'Game Ready' },
  post_game_submitted: { dot: 'bg-blue-500', label: 'Complete' },
}

interface VenueOption {
  id: string
  name: string
}

interface StaffOption {
  id: string
  full_name: string
}

export default function EventsPageWrapper() {
  return <Suspense><EventsPageInner /></Suspense>
}

function EventsPageInner() {
  const [events, setEvents] = useState<Event[]>([])
  const [calendarEvents, setCalendarEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'calendar' | 'list'>('calendar')
  const searchParams = useSearchParams()
  const initialFilter = (['today', 'week', 'month', 'all', 'pending_workflow'] as const).includes(searchParams.get('filter') as any)
    ? (searchParams.get('filter') as 'today' | 'week' | 'month' | 'all' | 'pending_workflow')
    : 'week'
  const [filter, setFilter] = useState<'today' | 'week' | 'month' | 'all' | 'pending_workflow'>(initialFilter)
  const [search, setSearch] = useState('')
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getWeekStart(new Date()))
  const [venueOptions, setVenueOptions] = useState<VenueOption[]>([])
  const [selectedVenues, setSelectedVenues] = useState<Set<string>>(new Set())
  const [showVenueFilter, setShowVenueFilter] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [creating, setCreating] = useState(false)
  const [newEvent, setNewEvent] = useState({
    summary: '', event_date: '', start_time: '', end_time: '',
    venue_id: '', league: '', staff_ids: [] as string[], event_type: 'event',
  })
  const router = useRouter()

  function getWeekStart(date: Date): Date {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day
    return new Date(d.setDate(diff))
  }

  function getDateRange(filter: string, weekStart: Date) {
    const start = new Date(weekStart)
    const end = new Date(weekStart)

    if (filter === 'today') {
      const today = new Date()
      return [today, today]
    } else if (filter === 'week') {
      end.setDate(end.getDate() + 6)
    } else if (filter === 'month') {
      end.setMonth(end.getMonth() + 1)
    } else {
      end.setFullYear(end.getFullYear() + 1)
    }
    return [start, end]
  }

  useEffect(() => {
    fetch('/api/preferences?key=events-view').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.value === 'calendar' || data?.value === 'list') setView(data.value)
    }).catch(() => {})
  }, [])

  const saveViewPreference = (v: 'calendar' | 'list') => {
    setView(v)
    fetch('/api/preferences', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'events-view', value: v }) }).catch(() => {})
  }

  useEffect(() => {
    const fetchVenues = async () => {
      try {
        const res = await fetch('/api/venues')
        if (res.ok) {
          const data = await res.json()
          setVenueOptions((data.venues || []).sort((a: VenueOption, b: VenueOption) => a.name.localeCompare(b.name)))
        }
      } catch {}
    }
    const fetchStaff = async () => {
      try {
        const res = await fetch('/api/staff')
        if (res.ok) {
          const data = await res.json()
          setStaffOptions((data.staff || []).filter((s: any) => s.is_active !== false).sort((a: StaffOption, b: StaffOption) => a.full_name.localeCompare(b.full_name)))
        }
      } catch {}
    }
    fetchVenues()
    fetchStaff()
  }, [])

  const toggleVenue = (id: string) => {
    setSelectedVenues(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearVenueFilter = () => setSelectedVenues(new Set())

  const createEvent = async () => {
    if (!newEvent.summary || !newEvent.event_date || !newEvent.venue_id) return
    setCreating(true)
    try {
      const res = await fetch('/api/events/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEvent),
      })
      if (res.ok) {
        setNewEvent({ summary: '', event_date: '', start_time: '', end_time: '', venue_id: '', league: '', staff_ids: [], event_type: 'event' })
        setShowCreate(false)
        // Refresh events
        const evRes = await fetch(`/api/events?filter=${filter}`)
        if (evRes.ok) { const d = await evRes.json(); setEvents(d.events || []) }
      }
    } catch {} finally { setCreating(false) }
  }

  const toggleStaffSelection = (id: string) => {
    setNewEvent(prev => ({
      ...prev,
      staff_ids: prev.staff_ids.includes(id)
        ? prev.staff_ids.filter(s => s !== id)
        : [...prev.staff_ids, id],
    }))
  }

  // Filter events by selected venues (client-side)
  const filterByVenue = (list: Event[]) => {
    if (selectedVenues.size === 0) return list
    return list.filter(e => {
      const venueName = e.venue_name || (e as any).venue || ''
      return venueOptions.some(v => selectedVenues.has(v.id) && v.name === venueName)
    })
  }

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true)
        const res = await fetch(`/api/events?filter=${filter}`)
        if (res.ok) {
          const data = await res.json()
          const sorted = (data.events || []).sort((a: Event, b: Event) => {
            return new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
          })
          setEvents(sorted)
        }

        // Fetch calendar events
        if (view === 'calendar') {
          const [start, end] = getDateRange(filter, currentWeekStart)
          const startStr = start.toISOString().split('T')[0]
          const endStr = end.toISOString().split('T')[0]
          const calRes = await fetch(`/api/events/calendar?start=${startStr}&end=${endStr}`)
          if (calRes.ok) {
            const calData = await calRes.json()
            setCalendarEvents(calData)
          }
        }
      } catch (err) {
        console.error('Failed to fetch events:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchEvents()
  }, [filter, view, currentWeekStart])

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[date.getMonth()]} ${date.getDate()}`
  }

  const formatTime = (dateTimeStr: string) => {
    const date = new Date(dateTimeStr)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  const getLeagueBadge = (league: string) => {
    return leagueColors[league] || { bg: 'bg-zinc-100', text: 'text-zinc-500', hex: '#71717a' }
  }

  const getWorkflowStatus = (status: string) => {
    return workflowStatusColors[status] || workflowStatusColors.pending
  }

  // Calendar view rendering
  const CalendarView = () => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    const weekCells = []

    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(currentWeekStart)
      dayDate.setDate(dayDate.getDate() + i)
      weekCells.push(dayDate)
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <button
            onClick={() => {
              const prev = new Date(currentWeekStart)
              prev.setDate(prev.getDate() - 7)
              setCurrentWeekStart(prev)
            }}
            className="px-3 py-2 text-sm font-medium hover:bg-zinc-100 rounded transition-colors"
          >
            ← Previous Week
          </button>
          <button
            onClick={() => setCurrentWeekStart(getWeekStart(new Date()))}
            className="px-3 py-2 text-sm font-medium hover:bg-zinc-100 rounded transition-colors"
          >
            Current Week
          </button>
          <button
            onClick={() => {
              const next = new Date(currentWeekStart)
              next.setDate(next.getDate() + 7)
              setCurrentWeekStart(next)
            }}
            className="px-3 py-2 text-sm font-medium hover:bg-zinc-100 rounded transition-colors"
          >
            Next Week →
          </button>
        </div>

        <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
          <div className="grid grid-cols-7 border-b border-[#E8E8E8] bg-zinc-50">
            {weekCells.map((date, i) => {
              const isToday = date.toDateString() === today.toDateString()
              return (
                <div
                  key={i}
                  className={`p-3 text-center border-r border-[#E8E8E8] last:border-r-0 ${isToday ? 'bg-blue-50' : ''}`}
                >
                  <p className="text-xs font-medium text-zinc-600">{days[i]}</p>
                  <p className={`text-sm font-semibold ${isToday ? 'text-blue-600' : 'text-zinc-900'}`}>{date.getDate()}</p>
                </div>
              )
            })}
          </div>

          <div className="divide-y divide-[#E8E8E8]">
            {loading ? (
              <div className="p-6">
                <Skeleton className="h-32 w-full" />
              </div>
            ) : calendarEvents.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-zinc-500 text-sm">No events scheduled</p>
              </div>
            ) : (
              <div className="grid grid-cols-7">
                {weekCells.map((cellDate, colIdx) => {
                  const cellEvents = filterByVenue(calendarEvents).filter((e) => {
                    const eDate = new Date(e.date || e.event_date)
                    if (eDate.toDateString() !== cellDate.toDateString()) return false
                    if (!search) return true
                    const q = search.toLowerCase()
                    return e.summary.toLowerCase().includes(q) || (e.venue_name || '').toLowerCase().includes(q) || (e.league || '').toLowerCase().includes(q) || ((e as any).assigned_techs || '').toLowerCase().includes(q)
                  })

                  return (
                    <div key={colIdx} className="border-r border-[#E8E8E8] last:border-r-0 p-2 min-h-64 bg-white" style={{ borderColor: '#E8E8E8' }}>
                      {cellEvents.map((event) => {
                        const leagueColor = getLeagueBadge(event.league)
                        return (
                          <button
                            key={event.id}
                            onClick={() => router.push(`/events/${event.id}`)}
                            className="w-full text-left p-2 rounded mb-1 transition-all hover:shadow-md text-xs"
                            style={{ backgroundColor: leagueColor.hex + '20', borderLeft: `3px solid ${leagueColor.hex}` }}
                          >
                            <p className="font-medium text-zinc-900 truncate">{event.summary}</p>
                            <p className="text-zinc-500 truncate">{event.venue_name || (event as any).venue}</p>
                            <p className="text-zinc-600 truncate">{(event as any).time}</p>
                            {(event as any).assigned_techs && (
                              <p className="text-zinc-500 truncate mt-0.5" title={(event as any).assigned_techs}>
                                {(event as any).assigned_techs}
                              </p>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // List view rendering
  const ListView = () => (
    <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        {loading ? (
          <TableSkeleton rows={10} cols={6} />
        ) : events.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-zinc-500 text-sm">No events found</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E8E8E8] bg-zinc-50">
                <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Date</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Time</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Event</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Venue</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">League</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Assigned</th>
                <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {filterByVenue(events).filter(e => {
                const q = search.toLowerCase()
                return !q || e.summary.toLowerCase().includes(q) || e.venue_name.toLowerCase().includes(q) || (e.league || '').toLowerCase().includes(q) || ((e as any).assigned_techs || '').toLowerCase().includes(q)
              }).map((event) => {
                const leagueColor = getLeagueBadge(event.league)
                const statusColor = getWorkflowStatus(event.workflow_status)
                return (
                  <tr
                    key={event.id}
                    className="border-b border-[#E8E8E8] hover:bg-zinc-50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/events/${event.id}`)}
                  >
                    <td className="py-3 px-6 text-zinc-600 text-xs">{formatDate(event.event_date)}</td>
                    <td className="py-3 px-6 text-zinc-500 font-mono text-xs">{formatTime(event.start_time)}</td>
                    <td className="py-3 px-6 font-medium text-zinc-900">{event.summary}</td>
                    <td className="py-3 px-6 text-zinc-600">{event.venue_name}</td>
                    <td className="py-3 px-6">
                      <span className={`inline-block px-2.5 py-1 rounded text-xs font-medium ${leagueColor.bg} ${leagueColor.text}`}>
                        {event.league}
                      </span>
                    </td>
                    <td className="py-3 px-6 text-zinc-600 text-xs max-w-48 truncate">
                      {(event as any).assigned_techs || <span className="text-zinc-400">Unassigned</span>}
                    </td>
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-2">
                        <span className={`inline-block w-2 h-2 rounded-full ${statusColor.dot}`}></span>
                        <span className="text-zinc-700 text-xs">{statusColor.label}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <h1 className="text-2xl font-semibold text-zinc-900">Events</h1>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium hover:bg-[#0840C0] transition-colors"
            >
              {showCreate ? 'Cancel' : '+ Create Event'}
            </button>
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search events, venues..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-4 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900 w-48"
              />
            </div>
            <div className="bg-zinc-100 rounded p-1 flex gap-1">
              <button
                onClick={() => saveViewPreference('calendar')}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${view === 'calendar' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'}`}
              >
                Calendar
              </button>
              <button
                onClick={() => saveViewPreference('list')}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${view === 'list' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'}`}
              >
                List
              </button>
            </div>
            <div className="flex gap-2">
              {(['today', 'week', 'month', 'all', 'pending_workflow'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded font-medium text-sm transition-colors ${
                    filter === f ? 'bg-[#0A52EF] text-white' : 'bg-white text-zinc-600 border border-[#E8E8E8] hover:border-zinc-300'
                  }`}
                >
                  {f === 'today' && 'Today'}
                  {f === 'week' && 'Week'}
                  {f === 'month' && 'Month'}
                  {f === 'all' && 'All'}
                  {f === 'pending_workflow' && 'Pending Workflow'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Create Event Form */}
        {showCreate && (
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">Create Event / Shift</h3>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Type</label>
                <div className="flex gap-2">
                  {[{ value: 'event', label: 'Event' }, { value: 'shift', label: 'Shift' }].map(opt => (
                    <button key={opt.value} type="button"
                      onClick={() => setNewEvent(prev => ({ ...prev, event_type: opt.value }))}
                      className={`flex-1 px-3 py-2 rounded text-sm font-medium border transition-colors ${
                        newEvent.event_type === opt.value
                          ? 'bg-[#0A52EF] text-white border-[#0A52EF]'
                          : 'bg-white text-zinc-600 border-[#E8E8E8] hover:border-zinc-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2 lg:col-span-2">
                <label className="block text-xs font-medium text-zinc-500 mb-1">
                  {newEvent.event_type === 'shift' ? 'Shift Name' : 'Event Name'} *
                </label>
                <input type="text" value={newEvent.summary}
                  onChange={e => setNewEvent(prev => ({ ...prev, summary: e.target.value }))}
                  placeholder={newEvent.event_type === 'shift' ? 'e.g., Morning Setup Shift' : 'e.g., Celtics vs Lakers'}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Date *</label>
                <input type="date" value={newEvent.event_date}
                  onChange={e => setNewEvent(prev => ({ ...prev, event_date: e.target.value }))}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Start Time</label>
                <input type="time" value={newEvent.start_time}
                  onChange={e => setNewEvent(prev => ({ ...prev, start_time: e.target.value }))}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">End Time</label>
                <input type="time" value={newEvent.end_time}
                  onChange={e => setNewEvent(prev => ({ ...prev, end_time: e.target.value }))}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Venue *</label>
                <select value={newEvent.venue_id}
                  onChange={e => setNewEvent(prev => ({ ...prev, venue_id: e.target.value }))}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" required>
                  <option value="">Select venue...</option>
                  {venueOptions.map(v => (
                    <option key={v.id} value={v.id}>{v.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">League</label>
                <select value={newEvent.league}
                  onChange={e => setNewEvent(prev => ({ ...prev, league: e.target.value }))}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none">
                  <option value="">None</option>
                  {Object.keys(leagueColors).map(l => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Assign Staff</label>
                <div className="border border-[#E8E8E8] rounded max-h-32 overflow-y-auto">
                  {staffOptions.map(s => (
                    <label key={s.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-50 cursor-pointer text-sm">
                      <input type="checkbox" checked={newEvent.staff_ids.includes(s.id)}
                        onChange={() => toggleStaffSelection(s.id)}
                        className="rounded border-zinc-300 text-[#0A52EF] focus:ring-[#0A52EF]" />
                      <span className="text-zinc-700 text-xs">{s.full_name}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="col-span-2 lg:col-span-3">
                <button onClick={createEvent} disabled={creating || !newEvent.summary || !newEvent.event_date || !newEvent.venue_id}
                  className="px-6 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium hover:bg-[#0840C0] disabled:opacity-50 transition-colors">
                  {creating ? 'Creating...' : `Create ${newEvent.event_type === 'shift' ? 'Shift' : 'Event'}`}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Venue multi-select filter */}
        <div className="relative">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setShowVenueFilter(!showVenueFilter)}
              className={`px-3 py-2 rounded text-sm font-medium border transition-colors flex items-center gap-1.5 ${
                selectedVenues.size > 0
                  ? 'bg-[#0A52EF] text-white border-[#0A52EF]'
                  : 'bg-white text-zinc-600 border-[#E8E8E8] hover:border-zinc-300'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Venues {selectedVenues.size > 0 && `(${selectedVenues.size})`}
            </button>
            {selectedVenues.size > 0 && (
              <>
                {venueOptions.filter(v => selectedVenues.has(v.id)).map(v => (
                  <span key={v.id} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                    {v.name}
                    <button onClick={() => toggleVenue(v.id)} className="hover:text-blue-900">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
                <button onClick={clearVenueFilter} className="text-xs text-zinc-400 hover:text-zinc-600 underline">
                  Clear all
                </button>
              </>
            )}
          </div>
          {showVenueFilter && (
            <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-[#E8E8E8] rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
              <div className="p-2 border-b border-[#E8E8E8]">
                <p className="text-xs font-medium text-zinc-500 px-2">Select venues to filter</p>
              </div>
              {venueOptions.map(v => (
                <label key={v.id} className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={selectedVenues.has(v.id)}
                    onChange={() => toggleVenue(v.id)}
                    className="rounded border-zinc-300 text-[#0A52EF] focus:ring-[#0A52EF]"
                  />
                  <span className="text-zinc-700">{v.name}</span>
                </label>
              ))}
              <div className="p-2 border-t border-[#E8E8E8]">
                <button onClick={() => setShowVenueFilter(false)} className="w-full text-center text-xs text-[#0A52EF] font-medium py-1 hover:underline">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {view === 'calendar' ? <CalendarView /> : <ListView />}
      </div>
    </DashboardLayout>
  )
}
