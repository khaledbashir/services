'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { DiscoveryLoader } from '@/components/discovery-loader'
import { DiscoveryReviewCard } from '@/components/discovery-review-card'
import { Skeleton, TableSkeleton } from '@/components/skeleton'

interface Event {
  id: string
  summary: string
  venue_name: string
  league: string
  source?: string | null
  start_time: string
  event_date: string
  venue_timezone?: string
  workflow_status: string
  date?: string
  time?: string
  event_requires_staffing?: boolean | null
  venue_requires_assignment?: boolean
  assigned_count?: number
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

interface DiscoveryEventRow {
  venue_id: string
  venue_name: string
  summary: string
  event_date: string
  start_time: string | null
  end_time: string | null
  event_type: string
  league: string | null
  home_team: string | null
  away_team: string | null
  source: string
  source_label: string | null
  source_url: string | null
  source_domain?: string | null
  match_type?: 'official_source' | 'ai_inferred'
  matched_query?: string | null
  evidence_snippet?: string | null
  confidence: number
  trust_score?: number
  trust_reasons?: string[]
  duplicate: boolean
  duplicate_reason: string | null
  requires_staffing: boolean
  status: 'discovered' | 'confirmed' | 'imported'
  auto_importable: boolean
  selected: boolean
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
  const [staffingFilter, setStaffingFilter] = useState<'all' | 'needs_staffing' | 'warranty_only'>('all')
  const [aiFilter, setAiFilter] = useState<'all' | 'ai_only'>('all')
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([])
  const [creating, setCreating] = useState(false)
  const [discovering, setDiscovering] = useState(false)
  const [importingDiscovery, setImportingDiscovery] = useState(false)
  const [showDiscoveryModal, setShowDiscoveryModal] = useState(false)
  const [discoveryRows, setDiscoveryRows] = useState<DiscoveryEventRow[]>([])
  const [discoverySummary, setDiscoverySummary] = useState<{ venues: number; total_found: number; duplicates_skipped: number } | null>(null)
  const [discoveryHint, setDiscoveryHint] = useState('')
  const [activeDiscoveryHint, setActiveDiscoveryHint] = useState<string | null>(null)
  const [includeExistingDiscovery, setIncludeExistingDiscovery] = useState(false)
  const [showDiscoverySummaryCard, setShowDiscoverySummaryCard] = useState(false)
  const [discoverySearch, setDiscoverySearch] = useState('')
  const [discoveryTypeFilter, setDiscoveryTypeFilter] = useState<'all' | 'game' | 'concert' | 'other'>('all')
  const [discoveryConfidenceFilter, setDiscoveryConfidenceFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all')
  const [discoveryVenueFilter, setDiscoveryVenueFilter] = useState<'all' | string>('all')
  const [showDiscoveryDuplicates, setShowDiscoveryDuplicates] = useState(true)
  const [collapsedDiscoveryVenues, setCollapsedDiscoveryVenues] = useState<Set<string>>(new Set())
  const [newEvent, setNewEvent] = useState({
    summary: '', event_date: '', start_time: '', end_time: '',
    venue_id: '', league: '', staff_ids: [] as string[], event_type: 'event',
  })
  const router = useRouter()

  const refreshEvents = async () => {
    const res = await fetch(`/api/events?filter=${filter}`)
    if (res.ok) {
      const data = await res.json()
      const sorted = (data.events || []).sort((a: Event, b: Event) => {
        return new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
      })
      setEvents(sorted)
    }

    if (view === 'calendar') {
      const [start, end] = getDateRange(filter, currentWeekStart)
      const startStr = start.toISOString().split('T')[0]
      const endStr = end.toISOString().split('T')[0]
      const calRes = await fetch(`/api/events/calendar?start=${startStr}&end=${endStr}`)
      if (calRes.ok) {
        setCalendarEvents(await calRes.json())
      }
    }
  }

  function getWeekStart(date: Date): Date {
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - (day === 0 ? 6 : day - 1)
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
        await refreshEvents()
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

  // Determine if an event effectively requires staffing (event override > venue default)
  const eventNeedsStaffing = (e: Event): boolean => {
    if (e.event_requires_staffing !== null && e.event_requires_staffing !== undefined) return e.event_requires_staffing
    return e.venue_requires_assignment !== false
  }

  const isAiImportedEvent = (e: Event): boolean => {
    return ['ai_discovery', 'ticketmaster', 'league_schedule', 'venue_calendar', 'team_website'].includes(e.source || '')
  }

  // Filter events by selected venues and staffing filter (client-side)
  const filterByVenue = (list: Event[]) => {
    let filtered = list
    if (selectedVenues.size > 0) {
      filtered = filtered.filter(e => {
        const venueName = e.venue_name || (e as any).venue || ''
        return venueOptions.some(v => selectedVenues.has(v.id) && v.name === venueName)
      })
    }
    if (aiFilter === 'ai_only') {
      filtered = filtered.filter((e) => isAiImportedEvent(e))
    }
    if (staffingFilter === 'needs_staffing') {
      filtered = filtered.filter(e => eventNeedsStaffing(e) && (Number((e as any).assigned_count) || 0) === 0)
    } else if (staffingFilter === 'warranty_only') {
      filtered = filtered.filter(e => !eventNeedsStaffing(e))
    }
    return filtered
  }

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        setLoading(true)
        await refreshEvents()
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

  const formatTime = (dateTimeStr: string, timeZone?: string) => {
    const date = new Date(dateTimeStr)
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: timeZone || 'America/New_York',
    })
  }

  const getLeagueBadge = (league: string) => {
    return leagueColors[league] || { bg: 'bg-zinc-100', text: 'text-zinc-500', hex: '#71717a' }
  }

  const getWorkflowStatus = (status: string) => {
    return workflowStatusColors[status] || workflowStatusColors.pending
  }

  const runBulkDiscovery = async () => {
    setDiscovering(true)
    setDiscoveryRows([])
    setDiscoverySummary(null)
    setShowDiscoverySummaryCard(false)
    setDiscoverySearch('')
    setDiscoveryTypeFilter('all')
    setDiscoveryConfidenceFilter('all')
    setDiscoveryVenueFilter('all')
    setShowDiscoveryDuplicates(true)
    setCollapsedDiscoveryVenues(new Set())
    try {
      const res = await fetch('/api/events/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          all_active: true,
          discovery_hint: discoveryHint.trim() || undefined,
          include_existing: includeExistingDiscovery,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const rows = (data.discovered || []).map((event: Omit<DiscoveryEventRow, 'selected'>) => ({
          ...event,
          selected: !event.duplicate,
        }))
        setDiscoveryRows(rows)
        setDiscoverySummary({
          venues: (data.venues || []).length,
          total_found: data.total_found || 0,
          duplicates_skipped: data.duplicates_skipped || 0,
        })
        setActiveDiscoveryHint(data.discovery_hint || discoveryHint.trim() || null)
        setShowDiscoverySummaryCard(true)
        setShowDiscoveryModal(true)
      }
    } catch (err) {
      console.error('Bulk discovery failed:', err)
    } finally {
      setDiscovering(false)
    }
  }

  const selectedDiscoveryCount = discoveryRows.filter(row => row.selected && !row.duplicate).length
  const filteredDiscoveryRows = discoveryRows.filter((row) => {
    if (!showDiscoveryDuplicates && row.duplicate) return false
    if (discoveryTypeFilter !== 'all' && row.event_type !== discoveryTypeFilter) return false
    if (discoveryVenueFilter !== 'all' && row.venue_id !== discoveryVenueFilter) return false
    if (discoveryConfidenceFilter === 'high' && (row.trust_score || 0) < 0.85) return false
    if (discoveryConfidenceFilter === 'medium' && ((row.trust_score || 0) < 0.7 || (row.trust_score || 0) >= 0.85)) return false
    if (discoveryConfidenceFilter === 'low' && (row.trust_score || 0) >= 0.7) return false

    const searchValue = discoverySearch.trim().toLowerCase()
    if (!searchValue) return true

    return [
      row.summary,
      row.venue_name,
      row.league || '',
      row.source_label || '',
      row.source || '',
      row.home_team || '',
      row.away_team || '',
    ].some((value) => value.toLowerCase().includes(searchValue))
  })
  const visibleSelectableCount = filteredDiscoveryRows.filter((row) => !row.duplicate).length
  const visibleSelectedCount = filteredDiscoveryRows.filter((row) => row.selected && !row.duplicate).length
  const visibleDuplicateCount = filteredDiscoveryRows.filter((row) => row.duplicate).length
  const visibleHighConfidenceCount = filteredDiscoveryRows.filter((row) => row.auto_importable && !row.duplicate).length
  const totalDiscoveryImportableCount = discoveryRows.filter((row) => !row.duplicate).length
  const totalDiscoveryHighConfidenceCount = discoveryRows.filter((row) => row.auto_importable && !row.duplicate).length
  const discoveryVenueOptions = discoveryRows
    .map((row) => ({ id: row.venue_id, name: row.venue_name }))
    .filter((option, index, arr) => arr.findIndex((candidate) => candidate.id === option.id) === index)
    .sort((a, b) => a.name.localeCompare(b.name))
  const discoveryVenueGroups: Array<{
    venueId: string
    venueName: string
    rows: DiscoveryEventRow[]
    selectedCount: number
    duplicateCount: number
    selectableCount: number
    highConfidenceCount: number
  }> = []
  for (const row of filteredDiscoveryRows) {
    let group = discoveryVenueGroups.find((entry) => entry.venueId === row.venue_id)
    if (!group) {
      group = {
        venueId: row.venue_id,
        venueName: row.venue_name,
        rows: [],
        selectedCount: 0,
        duplicateCount: 0,
        selectableCount: 0,
        highConfidenceCount: 0,
      }
      discoveryVenueGroups.push(group)
    }

    group.rows.push(row)
    if (row.duplicate) {
      group.duplicateCount += 1
    } else {
      group.selectableCount += 1
      if (row.selected) group.selectedCount += 1
      if (row.auto_importable) group.highConfidenceCount += 1
    }
  }
  discoveryVenueGroups.sort((a, b) => a.venueName.localeCompare(b.venueName))

  const selectVisibleDiscoveryRows = (mode: 'all' | 'high' | 'none') => {
    setDiscoveryRows((prev) => prev.map((row) => {
      const isVisible = filteredDiscoveryRows.some((visibleRow) =>
        visibleRow.venue_id === row.venue_id &&
        visibleRow.summary === row.summary &&
        visibleRow.event_date === row.event_date &&
        visibleRow.start_time === row.start_time
      )

      if (!isVisible || row.duplicate) return row
      if (mode === 'none') return { ...row, selected: false }
      if (mode === 'high') return { ...row, selected: row.auto_importable }
      return { ...row, selected: true }
    }))
  }

  const toggleDiscoveryVenueCollapse = (venueId: string) => {
    setCollapsedDiscoveryVenues((prev) => {
      const next = new Set(prev)
      if (next.has(venueId)) next.delete(venueId)
      else next.add(venueId)
      return next
    })
  }

  const setDiscoveryVenueSelection = (venueId: string, selected: boolean) => {
    setDiscoveryRows((prev) => prev.map((row) => (
      row.venue_id === venueId && !row.duplicate ? { ...row, selected } : row
    )))
  }

  const importSelectedDiscovery = async () => {
    const selected = discoveryRows.filter(row => row.selected && !row.duplicate)
    if (selected.length === 0) return
    setImportingDiscovery(true)
    try {
      const res = await fetch('/api/events/discover/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'confirmed',
          events: selected.map(({ selected: _selected, ...event }) => event),
        }),
      })
      if (res.ok) {
        setShowDiscoveryModal(false)
        setDiscoveryRows([])
        await refreshEvents()
      }
    } catch (err) {
      console.error('Discovery import failed:', err)
    } finally {
      setImportingDiscovery(false)
    }
  }

  const formatDiscoveryDate = (dateStr: string) =>
    new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })

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
                    const raw = e.date || e.event_date
                    const eDateStr = typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)
                      ? raw
                      : new Date(new Date(raw).toLocaleString('en-US', { timeZone: 'America/New_York' })).toISOString().slice(0, 10)
                    const cellStr = `${cellDate.getFullYear()}-${String(cellDate.getMonth() + 1).padStart(2, '0')}-${String(cellDate.getDate()).padStart(2, '0')}`
                    if (eDateStr !== cellStr) return false
                    if (!search) return true
                    const q = search.toLowerCase()
                    return e.summary.toLowerCase().includes(q) || (e.venue_name || '').toLowerCase().includes(q) || (e.league || '').toLowerCase().includes(q) || ((e as any).assigned_techs || '').toLowerCase().includes(q)
                  })

                  return (
                    <div key={colIdx} className="border-r border-[#E8E8E8] last:border-r-0 p-2 min-h-64 bg-white" style={{ borderColor: '#E8E8E8' }}>
                      {cellEvents.map((event) => {
                        const leagueColor = getLeagueBadge(event.league)
                        const needsStaffing = eventNeedsStaffing(event)
                        const assignedCount = Number((event as any).assigned_count) || 0
                        const isStaffed = needsStaffing && assignedCount > 0
                        const isUnderstaffed = needsStaffing && assignedCount === 0
                        const isWarranty = !needsStaffing

                        // Border color: red=understaffed, green=staffed, gray=warranty
                        const borderColor = isUnderstaffed ? '#dc2626' : isStaffed ? '#16a34a' : '#a1a1aa'
                        const bgColor = isUnderstaffed ? '#fef2f2' : isStaffed ? '#f0fdf4' : '#fafafa'

                        return (
                          <button
                            key={event.id}
                            onClick={() => router.push(`/events/${event.id}`)}
                            className="w-full text-left p-2 rounded mb-1 transition-all hover:shadow-md text-xs"
                            style={{ backgroundColor: bgColor, borderLeft: `3px solid ${borderColor}` }}
                          >
                            <div className="flex items-center gap-1 mb-0.5">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isUnderstaffed ? 'bg-red-500' : isStaffed ? 'bg-green-500' : 'bg-zinc-400'}`} />
                              <span className={`text-[9px] font-semibold uppercase tracking-wide ${isUnderstaffed ? 'text-red-600' : isStaffed ? 'text-green-700' : 'text-zinc-400'}`}>
                                {isUnderstaffed ? 'Needs Staff' : isWarranty ? 'Warranty' : `${assignedCount} Assigned`}
                              </span>
                              {isAiImportedEvent(event) && (
                                <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">
                                  AI
                                </span>
                              )}
                              {event.league && (
                                <span className="text-[9px] font-medium px-1 rounded ml-auto" style={{ backgroundColor: leagueColor.hex + '20', color: leagueColor.hex }}>{event.league}</span>
                              )}
                            </div>
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
                <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Staffing</th>
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
                    <td className="py-3 px-6 text-zinc-500 font-mono text-xs">{formatTime(event.start_time, event.venue_timezone)}</td>
                    <td className="py-3 px-6 font-medium text-zinc-900">{event.summary}</td>
                    <td className="py-3 px-6 text-zinc-600">{event.venue_name}</td>
                    <td className="py-3 px-6">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`inline-block px-2.5 py-1 rounded text-xs font-medium ${leagueColor.bg} ${leagueColor.text}`}>
                          {event.league}
                        </span>
                        {isAiImportedEvent(event) && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                            AI Imported
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-6">
                      {(() => {
                        const needs = eventNeedsStaffing(event)
                        const count = Number((event as any).assigned_count) || 0
                        if (!needs) return <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500"><span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />Warranty</span>
                        if (count > 0) return <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200"><span className="w-1.5 h-1.5 rounded-full bg-green-500" />Staffed</span>
                        return <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200"><span className="w-1.5 h-1.5 rounded-full bg-red-500" />Needs Staff</span>
                      })()}
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
              onClick={() => router.push('/events/discovery-log')}
              className="px-4 py-2 border border-[#E8E8E8] bg-white text-zinc-700 rounded text-sm font-medium hover:border-zinc-300 transition-colors"
            >
              Discovery Log
            </button>
            <button
              onClick={runBulkDiscovery}
              disabled={discovering}
              className="px-4 py-2 border border-[#E8E8E8] bg-white text-zinc-700 rounded text-sm font-medium hover:border-zinc-300 transition-colors disabled:opacity-50"
            >
              {discovering ? 'Discovering...' : 'Discover Active Venues'}
            </button>
            <button
              onClick={async () => {
                if (!confirm('Delete ALL events across every venue? This cannot be undone. Tickets attached to events will remain but lose their event link.')) return
                const res = await fetch('/api/events/wipe', { method: 'POST' })
                if (res.ok) {
                  const data = await res.json()
                  alert(`Deleted ${data.deleted} events. Run Discover to repopulate.`)
                  window.location.reload()
                } else {
                  alert('Failed to delete. You may not have admin permissions.')
                }
              }}
              className="px-4 py-2 border border-red-200 bg-white text-red-600 rounded text-sm font-medium hover:bg-red-50 transition-colors"
            >
              Delete All Events
            </button>
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
            <div className="relative">
              <input
                type="text"
                value={discoveryHint}
                onChange={(e) => setDiscoveryHint(e.target.value)}
                placeholder="Optional discovery hint, e.g. focus on MLB and concerts"
                className="px-4 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900 w-80"
              />
            </div>
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-[#E8E8E8] rounded text-sm text-zinc-700 bg-white">
              <input
                type="checkbox"
                checked={includeExistingDiscovery}
                onChange={(e) => setIncludeExistingDiscovery(e.target.checked)}
                className="rounded border-zinc-300"
              />
              Demo mode
            </label>
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

        {discovering && (
          <DiscoveryLoader
            title="Discovering Across Active Venues"
            subtitle="Pulling live event candidates from public sources and shaping them into import-ready rows."
            hints={[
              'Ticketmaster',
              'Team Sites',
              'Venue Calendars',
              'AI Normalization',
            ]}
          />
        )}

        {!discovering && showDiscoverySummaryCard && discoverySummary && (
          <div className="rounded-2xl border border-[#E8E8E8] bg-white shadow-sm overflow-hidden">
            <div className="px-5 py-4 bg-[linear-gradient(180deg,#FFFFFF,#F8FAFC)] flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Discovery Complete</div>
                <h3 className="mt-1 text-lg font-semibold text-zinc-900">
                  {discoverySummary.total_found} results found across {discoverySummary.venues} venues
                </h3>
                <p className="mt-1 text-sm text-zinc-500">
                  {totalDiscoveryImportableCount} importable · {totalDiscoveryHighConfidenceCount} high confidence
                  {discoverySummary.duplicates_skipped > 0 && ` · ${discoverySummary.duplicates_skipped} duplicates`}
                </p>
                {activeDiscoveryHint && (
                  <p className="mt-2 text-xs text-zinc-500">
                    Discovery hint used: "{activeDiscoveryHint}"
                  </p>
                )}
                {includeExistingDiscovery && (
                  <p className="mt-1 text-xs text-zinc-500">
                    Demo mode included events that already exist so they can appear as duplicates for review.
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowDiscoveryModal(true)}
                  className="px-4 py-2 rounded-xl bg-[#0A52EF] text-white text-sm font-medium hover:bg-[#0840C0] transition-colors"
                >
                  Open Discovery Center
                </button>
                <button
                  onClick={() => setShowDiscoverySummaryCard(false)}
                  className="px-3 py-2 rounded-xl border border-[#E8E8E8] text-sm text-zinc-500 hover:text-zinc-700 hover:border-zinc-300 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

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

        {/* Staffing + Venue filters */}
        <div className="relative">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Staffing filter */}
            {(['all', 'needs_staffing', 'warranty_only'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setStaffingFilter(f)}
                className={`px-3 py-2 rounded text-sm font-medium border transition-colors flex items-center gap-1.5 ${
                  staffingFilter === f
                    ? f === 'needs_staffing' ? 'bg-red-600 text-white border-red-600'
                      : f === 'warranty_only' ? 'bg-zinc-600 text-white border-zinc-600'
                      : 'bg-[#0A52EF] text-white border-[#0A52EF]'
                    : 'bg-white text-zinc-600 border-[#E8E8E8] hover:border-zinc-300'
                }`}
              >
                {f === 'all' && (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
                    Show All
                  </>
                )}
                {f === 'needs_staffing' && (
                  <>
                    <span className={`w-1.5 h-1.5 rounded-full ${staffingFilter === f ? 'bg-white' : 'bg-red-500'}`} />
                    Needs Staffing
                  </>
                )}
                {f === 'warranty_only' && (
                  <>
                    <span className={`w-1.5 h-1.5 rounded-full ${staffingFilter === f ? 'bg-white' : 'bg-zinc-400'}`} />
                    Warranty Only
                  </>
                )}
              </button>
            ))}
            <button
              onClick={() => setAiFilter(aiFilter === 'ai_only' ? 'all' : 'ai_only')}
              className={`px-3 py-2 rounded text-sm font-medium border transition-colors flex items-center gap-1.5 ${
                aiFilter === 'ai_only'
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white text-zinc-600 border-[#E8E8E8] hover:border-zinc-300'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${aiFilter === 'ai_only' ? 'bg-white' : 'bg-sky-500'}`} />
              AI Imported
            </button>
            <span className="w-px h-6 bg-zinc-200" />
          </div>
          <div className="flex items-center gap-2 flex-wrap mt-2">
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

        {showDiscoveryModal && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowDiscoveryModal(false)}>
            <div className="bg-[#F8FAFC] rounded-2xl shadow-xl w-full max-w-[92rem] max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-6 border-b border-[#E8E8E8] bg-white">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-semibold text-zinc-900">Discovery Center</h3>
                    {discoverySummary && (
                      <p className="text-sm text-zinc-500 mt-1">
                        Searched {discoverySummary.venues} active venues · found {discoverySummary.total_found} results in the next 60 days
                        {discoverySummary.duplicates_skipped > 0 && ` · ${discoverySummary.duplicates_skipped} duplicates already in the system`}
                      </p>
                    )}
                    <p className="text-xs text-zinc-400 mt-2">
                      Discovery checks Ticketmaster, venue calendars, team sites, and league schedules, then normalizes anything it finds into import-ready rows.
                    </p>
                    {activeDiscoveryHint && (
                      <p className="text-xs text-zinc-500 mt-2">
                        Discovery hint: "{activeDiscoveryHint}"
                      </p>
                    )}
                    {includeExistingDiscovery && (
                      <p className="text-xs text-zinc-500 mt-1">
                        Demo mode is on, so existing events may appear here as duplicates.
                      </p>
                    )}
                  </div>
                  <button onClick={() => setShowDiscoveryModal(false)} className="text-zinc-400 hover:text-zinc-600 text-sm">Close</button>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
                  <div className="rounded-2xl border border-[#E8E8E8] bg-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Visible Results</div>
                    <div className="mt-2 text-2xl font-semibold text-zinc-900">{filteredDiscoveryRows.length}</div>
                    <div className="mt-1 text-xs text-zinc-500">{visibleDuplicateCount} duplicates in the current view</div>
                  </div>
                  <div className="rounded-2xl border border-[#E8E8E8] bg-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Selected</div>
                    <div className="mt-2 text-2xl font-semibold text-zinc-900">{visibleSelectedCount}</div>
                    <div className="mt-1 text-xs text-zinc-500">of {visibleSelectableCount} importable rows in this view</div>
                  </div>
                  <div className="rounded-2xl border border-[#E8E8E8] bg-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">High Confidence</div>
                    <div className="mt-2 text-2xl font-semibold text-emerald-700">{visibleHighConfidenceCount}</div>
                    <div className="mt-1 text-xs text-zinc-500">ideal for quick selection</div>
                  </div>
                  <div className="rounded-2xl border border-[#E8E8E8] bg-white p-4">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Venue Groups</div>
                    <div className="mt-2 text-2xl font-semibold text-zinc-900">{discoveryVenueGroups.length}</div>
                    <div className="mt-1 text-xs text-zinc-500">review venue by venue from one dashboard</div>
                  </div>
                </div>
              </div>

              <div className="px-6 py-4 border-b border-[#E8E8E8] bg-white flex flex-wrap items-center gap-3">
                <div className="relative min-w-[16rem] flex-1 max-w-md">
                  <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={discoverySearch}
                    onChange={(e) => setDiscoverySearch(e.target.value)}
                    placeholder="Search events, teams, venues, or sources..."
                    className="w-full pl-10 pr-4 py-2.5 border border-[#E8E8E8] rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
                  />
                </div>
                <select
                  value={discoveryTypeFilter}
                  onChange={(e) => setDiscoveryTypeFilter(e.target.value as 'all' | 'game' | 'concert' | 'other')}
                  className="px-3 py-2.5 border border-[#E8E8E8] rounded-xl text-sm bg-white text-zinc-700"
                >
                  <option value="all">All Types</option>
                  <option value="game">Games</option>
                  <option value="concert">Concerts</option>
                  <option value="other">Other</option>
                </select>
                <select
                  value={discoveryConfidenceFilter}
                  onChange={(e) => setDiscoveryConfidenceFilter(e.target.value as 'all' | 'high' | 'medium' | 'low')}
                  className="px-3 py-2.5 border border-[#E8E8E8] rounded-xl text-sm bg-white text-zinc-700"
                >
                  <option value="all">All Trust</option>
                  <option value="high">High Trust</option>
                  <option value="medium">Medium Trust</option>
                  <option value="low">Low Trust</option>
                </select>
                <select
                  value={discoveryVenueFilter}
                  onChange={(e) => setDiscoveryVenueFilter(e.target.value)}
                  className="px-3 py-2.5 border border-[#E8E8E8] rounded-xl text-sm bg-white text-zinc-700"
                >
                  <option value="all">All Venues</option>
                  {discoveryVenueOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
                <label className="inline-flex items-center gap-2 px-3 py-2.5 border border-[#E8E8E8] rounded-xl text-sm text-zinc-700 bg-white">
                  <input
                    type="checkbox"
                    checked={showDiscoveryDuplicates}
                    onChange={(e) => setShowDiscoveryDuplicates(e.target.checked)}
                    className="rounded border-zinc-300"
                  />
                  Show duplicates
                </label>
              </div>

              <div className="px-6 py-3 border-b border-[#E8E8E8] bg-zinc-50 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => selectVisibleDiscoveryRows('all')}
                    className="px-3 py-1.5 rounded-full bg-white border border-[#E8E8E8] text-sm text-[#0A52EF] hover:border-[#0A52EF]/30"
                  >
                    Select visible
                  </button>
                  <button
                    onClick={() => selectVisibleDiscoveryRows('high')}
                    className="px-3 py-1.5 rounded-full bg-white border border-[#E8E8E8] text-sm text-emerald-700 hover:border-emerald-300"
                  >
                    Select high confidence
                  </button>
                  <button
                    onClick={() => selectVisibleDiscoveryRows('none')}
                    className="px-3 py-1.5 rounded-full bg-white border border-[#E8E8E8] text-sm text-zinc-600 hover:border-zinc-300"
                  >
                    Clear visible
                  </button>
                </div>
                <span className="text-sm text-zinc-500">{selectedDiscoveryCount} total rows selected for import</span>
              </div>

              <div className="overflow-auto flex-1 px-6 py-6">
                {discoveryRows.length === 0 ? (
                  <div className="p-12 text-center text-zinc-400 text-sm">
                    No discovery results were found in the next 60 days for the active venues that were searched.
                  </div>
                ) : discoveryVenueGroups.length === 0 ? (
                  <div className="p-12 text-center text-zinc-400 text-sm">No results match the current filters.</div>
                ) : (
                  <div className="space-y-4">
                    {discoveryVenueGroups.map((group) => {
                      const isCollapsed = collapsedDiscoveryVenues.has(group.venueId)
                      const fullySelected = group.selectableCount > 0 && group.selectedCount === group.selectableCount

                      return (
                        <section key={group.venueId} className="rounded-2xl border border-[#E8E8E8] bg-white shadow-sm overflow-hidden">
                          <div className="px-5 py-4 border-b border-[#E8E8E8] bg-[linear-gradient(180deg,#FFFFFF,#F8FAFC)] flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => toggleDiscoveryVenueCollapse(group.venueId)}
                                className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-[#E8E8E8] text-zinc-500 hover:text-zinc-700 hover:border-zinc-300"
                                aria-label={isCollapsed ? `Expand ${group.venueName}` : `Collapse ${group.venueName}`}
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 transition-transform ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                              </button>
                              <div>
                                <h4 className="text-base font-semibold text-zinc-900">{group.venueName}</h4>
                                <p className="text-xs text-zinc-500 mt-1">
                                  {group.rows.length} results · {group.selectedCount}/{group.selectableCount} selected · {group.highConfidenceCount} high confidence
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {group.duplicateCount > 0 && (
                                <span className="inline-flex px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-100 text-amber-700">
                                  {group.duplicateCount} duplicates
                                </span>
                              )}
                              <span className="inline-flex px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-100 text-emerald-700">
                                {group.highConfidenceCount} high confidence
                              </span>
                              <button
                                onClick={() => setDiscoveryVenueSelection(group.venueId, !fullySelected)}
                                disabled={group.selectableCount === 0}
                                className="px-3 py-1.5 rounded-full border border-[#E8E8E8] text-sm text-[#0A52EF] disabled:opacity-40"
                              >
                                {fullySelected ? 'Deselect Venue' : 'Select Venue'}
                              </button>
                            </div>
                          </div>

                          {!isCollapsed && (
                            <div className="divide-y divide-[#E8E8E8]">
                              {group.rows.map((row, idx) => (
                                <div
                                  key={`${row.venue_id}-${row.summary}-${row.event_date}-${row.start_time || 'na'}-${idx}`}
                                  className={`px-5 py-4 ${row.duplicate ? 'bg-amber-50/40' : 'bg-white'}`}
                                >
                                  <DiscoveryReviewCard
                                    summary={row.summary}
                                    eventDate={row.event_date}
                                    startTime={row.start_time}
                                    endTime={row.end_time}
                                    eventType={row.event_type}
                                    league={row.league}
                                    sourceLabel={row.source_label || row.source}
                                    sourceUrl={row.source_url}
                                    trustScore={row.trust_score}
                                    confidence={row.confidence}
                                    duplicate={row.duplicate}
                                    duplicateReason={row.duplicate_reason}
                                    selected={row.selected}
                                    disabled={row.duplicate}
                                    subtitle={[
                                      row.match_type === 'official_source' ? 'Official source' : 'AI inferred',
                                      (row.home_team || row.away_team) ? [row.home_team, row.away_team].filter(Boolean).join(' vs ') : null,
                                      row.matched_query ? `Query: ${row.matched_query}` : null,
                                      row.evidence_snippet || null,
                                      row.trust_reasons?.length ? `Why: ${row.trust_reasons.slice(0, 2).join(' · ')}` : null,
                                    ].filter(Boolean).join(' · ')}
                                    onToggle={() => setDiscoveryRows(prev => prev.map((event) => (
                                      event.venue_id === row.venue_id &&
                                      event.summary === row.summary &&
                                      event.event_date === row.event_date &&
                                      event.start_time === row.start_time
                                        ? { ...event, selected: !event.selected }
                                        : event
                                    )))}
                                  />
                                </div>
                              ))}
                            </div>
                          )}
                        </section>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-[#E8E8E8] bg-white flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-zinc-500">Imported rows will be created with workflow status "pending".</span>
                <button
                  onClick={importSelectedDiscovery}
                  disabled={importingDiscovery || selectedDiscoveryCount === 0}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#0A52EF] rounded-xl hover:bg-[#0840C0] transition-colors disabled:opacity-50"
                >
                  {importingDiscovery ? 'Importing...' : `Import Selected (${selectedDiscoveryCount})`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
