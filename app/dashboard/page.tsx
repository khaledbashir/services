'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { DashboardLayoutSettings, applyLayoutPrefs, loadLayoutPrefs, DEFAULT_LAYOUT_PREFS, type DashboardLayoutPrefs } from '@/components/dashboard-layout-settings'
import { Skeleton, CardSkeleton } from '@/components/skeleton'
import { useAuth } from '@/lib/useAuth'
import { EventDetailBody } from '@/components/event-detail'
import { TicketDetail } from '@/components/ticket-detail'
import { ResizableSidePanel } from '@/components/resizable-side-panel'

interface DashboardStats {
  todaysEvents: number
  assignedStaff: number
  openTickets: number
  pendingWorkflows: number
  estimatedLaborHours: number
  autoSyncingVenues: number
  venuesNeedingFeedUrls: number
  inactiveVenues: number
  laborByStaff: Array<{ id: string; full_name: string; total_hours: number; event_count: number }>
}

interface Event {
  id: string
  summary: string
  venue_name: string
  market?: string
  league: string
  start_time: string
  event_date: string
  venue_timezone?: string
  workflow_status: string
  assigned_techs?: string | null
}

interface Activity {
  source: string
  type: string
  type_display: string
  created_at: string
  staff_name: string
  entity_name: string | null
  venue_name: string | null
  details?: {
    assigned_to?: string
    old_status?: string
    new_status?: string
    from?: string
  } | null
}

interface ChartData {
  workflow: { completed: number; in_progress: number; pending: number }
  eventsByMarket: Array<{ market: string; count: number }>
  eventsByLeague: Array<{ league: string; count: number }>
}

type DashboardListKind = 'staff' | 'tickets' | 'workflows' | 'labor' | 'market'
type DashboardPanel =
  | { kind: 'event'; id: string }
  | { kind: 'ticket'; id: string }
  | { kind: 'list'; listKind: DashboardListKind; title: string; items: any[] }

const leagueColors: Record<string, { bg: string; text: string }> = {
  NBA: { bg: 'bg-orange-50', text: 'text-orange-600' },
  NHL: { bg: 'bg-blue-50', text: 'text-blue-600' },
  NCAAM: { bg: 'bg-violet-50', text: 'text-violet-600' },
  NCAAW: { bg: 'bg-pink-50', text: 'text-pink-600' },
  MLB: { bg: 'bg-red-50', text: 'text-red-600' },
  AHL: { bg: 'bg-teal-50', text: 'text-teal-600' },
  'NBA G League': { bg: 'bg-orange-50', text: 'text-orange-500' },
  MiLB: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
}

const workflowStatusColors: Record<string, { dot: string; bg: string; text: string; label: string; border: string }> = {
  pending: { dot: 'bg-rose-500', bg: 'bg-rose-50 dark:bg-rose-500/10', text: 'text-rose-700', label: 'Pending', border: '#f43f5e' },
  checked_in: { dot: 'bg-amber-500', bg: 'bg-amber-50 dark:bg-amber-500/10', text: 'text-amber-700', label: 'Checked In', border: '#f59e0b' },
  game_ready: { dot: 'bg-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10', text: 'text-emerald-700', label: 'Game Ready', border: '#10b981' },
  post_game_submitted: { dot: 'bg-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10', text: 'text-blue-700', label: 'Submitted', border: '#3b82f6' },
}

const DASHBOARD_CARD_OPTIONS = [
  { key: 'events', label: "Today's Events" },
  { key: 'staff', label: 'Staff' },
  { key: 'tickets', label: 'Open Tickets' },
  { key: 'workflows', label: 'Pending Workflows' },
  { key: 'labor-hours', label: 'Est. Labor Hours' },
]

const DASHBOARD_SECTION_OPTIONS = [
  { key: 'cards', label: 'Top Cards' },
  { key: 'automation', label: 'Automation Coverage' },
  { key: 'alerts', label: 'Alerts' },
  { key: 'operations', label: 'Operations Panels' },
  { key: 'markets', label: 'Markets This Week' },
]

export default function DashboardPage() {
  const auth = useAuth()
  const [stats, setStats] = useState<DashboardStats>({
    todaysEvents: 0,
    assignedStaff: 0,
    openTickets: 0,
    pendingWorkflows: 0,
    estimatedLaborHours: 0,
    autoSyncingVenues: 0,
    venuesNeedingFeedUrls: 0,
    inactiveVenues: 0,
    laborByStaff: [],
  })
  const [todaysEvents, setTodaysEvents] = useState<Event[]>([])
  const [weekEvents, setWeekEvents] = useState<Event[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [alerts, setAlerts] = useState<Array<{ type: string; severity: string; title: string; detail: string; count?: number }>>([])
  const [loading, setLoading] = useState(true)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const [cardPrefs, setCardPrefs] = useState<DashboardLayoutPrefs>(DEFAULT_LAYOUT_PREFS)
  const [sectionPrefs, setSectionPrefs] = useState<DashboardLayoutPrefs>(DEFAULT_LAYOUT_PREFS)
  const [panel, setPanel] = useState<DashboardPanel | null>(null)
  const [panelLoading, setPanelLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    loadLayoutPrefs('dashboard.cards').then(setCardPrefs)
    loadLayoutPrefs('dashboard.sections').then(setSectionPrefs)
  }, [])

  useEffect(() => {
    if (auth.loaded && !auth.isManager) {
      router.replace('/my-events')
    }
  }, [auth.loaded, auth.isManager, router])

  useEffect(() => {
    if (auth.loaded && !auth.isManager) return

    const fetchData = async () => {
      try {
        const [statsRes, todayRes, weekRes, activityRes, chartRes, alertsRes] = await Promise.all([
          fetch('/api/stats'),
          fetch('/api/events?filter=today'),
          fetch('/api/events?filter=week&limit=250'),
          fetch('/api/activity'),
          fetch('/api/stats/charts'),
          fetch('/api/stats/alerts'),
        ])

        if (statsRes.ok) setStats(await statsRes.json())
        if (todayRes.ok) {
          const data = await todayRes.json()
          setTodaysEvents(data.events || [])
        }
        if (weekRes.ok) {
          const data = await weekRes.json()
          setWeekEvents(data.events || [])
        }
        if (activityRes.ok) setActivity(await activityRes.json())
        if (chartRes.ok) setChartData(await chartRes.json())
        if (alertsRes.ok) {
          const data = await alertsRes.json()
          setAlerts(data.alerts || [])
        }
      } catch (err) {
        console.error('Failed to fetch data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [auth.loaded, auth.isManager])

  const formatTime = (dateTimeStr: string, timeZone?: string) => {
    const date = new Date(dateTimeStr)
    const tz = timeZone || 'America/New_York'
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: tz,
    })
  }

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return `${diffDays}d ago`
  }

  const getLeagueBadge = (league: string) => {
    return leagueColors[league] || { bg: 'bg-zinc-100', text: 'text-zinc-500' }
  }

  const getWorkflowStatus = (status: string) => {
    return workflowStatusColors[status] || workflowStatusColors.pending
  }

  const openListPanel = async (listKind: DashboardListKind, title: string, initialItems?: any[]) => {
    if (initialItems) {
      setPanel({ kind: 'list', listKind, title, items: initialItems })
      return
    }

    const endpoints: Partial<Record<DashboardListKind, string>> = {
      staff: '/api/stats/assigned-staff',
      tickets: '/api/stats/open-tickets',
      workflows: '/api/stats/pending-workflows',
    }
    const endpoint = endpoints[listKind]
    if (!endpoint) return

    setPanel({ kind: 'list', listKind, title, items: [] })
    setPanelLoading(true)
    try {
      const response = await fetch(endpoint)
      if (!response.ok) return
      const data = await response.json()
      const items = listKind === 'staff'
        ? data.assignedStaff
        : listKind === 'tickets'
          ? data.openTickets
          : data.pendingWorkflows
      setPanel({ kind: 'list', listKind, title, items: items || [] })
    } finally {
      setPanelLoading(false)
    }
  }

  const StatCard = ({ title, value, color, cardKey, onClick, href }: { title: string; value: number; color: string; cardKey: string; onClick?: () => void; href?: string }) => (
    <button
      type="button"
      onClick={() => onClick ? onClick() : href ? router.push(href) : setExpandedCard(expandedCard === cardKey ? null : cardKey)}
      className="h-full w-full bg-white rounded border border-[#E8E8E8] shadow-sm p-6 hover:shadow-md transition-all cursor-pointer text-left"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-semibold text-zinc-900 mt-3">{value}</p>
        </div>
        <div className="w-2 h-2 rounded-full mt-2" style={{ backgroundColor: color }}></div>
      </div>
    </button>
  )

  const today = new Date()
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][today.getDay()]
  const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][today.getMonth()]
  const todayFormatted = `${dayName}, ${monthName} ${today.getDate()}, ${today.getFullYear()}`
  const timelineEvents = todaysEvents.slice(0, 8)
  const upcomingEvents = weekEvents.slice(0, 10)
  const liveActivityItems = activity.slice(0, 5)
  const displayMarketLabel = (market: string) => {
    const label = market?.trim()
    if (!label || label.toLowerCase() === 'unknown') return 'Unassigned Market'
    return label
  }
  const visibleCards = applyLayoutPrefs(DASHBOARD_CARD_OPTIONS, cardPrefs).map((item) => item.key)
  const visibleSections = new Set(applyLayoutPrefs(DASHBOARD_SECTION_OPTIONS, sectionPrefs).map((item) => item.key))
  const sectionOrder = (key: string) => {
    const ordered = applyLayoutPrefs(DASHBOARD_SECTION_OPTIONS, sectionPrefs).map((item) => item.key)
    const idx = ordered.indexOf(key)
    return idx < 0 ? 99 : idx
  }
  const cardOrder = (key: string) => {
    const idx = visibleCards.indexOf(key)
    return idx < 0 ? 99 : idx
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-8">
        {/* SECTION 1: Welcome Header */}
        <div className="flex justify-between items-baseline">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Welcome back{auth.loaded && auth.userName ? `, ${auth.userName.split(' ')[0]}` : ''}</h1>
            <p className="text-zinc-500 text-sm mt-1">Here's your operations overview</p>
          </div>
          <div className="flex items-center gap-2">
            <DashboardLayoutSettings
              storageKey="dashboard.cards"
              columns={DASHBOARD_CARD_OPTIONS}
              prefs={cardPrefs}
              onChange={setCardPrefs}
            />
            <DashboardLayoutSettings
              storageKey="dashboard.sections"
              columns={DASHBOARD_SECTION_OPTIONS}
              prefs={sectionPrefs}
              onChange={setSectionPrefs}
            />
            <p className="text-xs text-zinc-400">{todayFormatted}</p>
          </div>
        </div>

        {/* SECTION 2: Stat Cards (5-column grid) */}
        {visibleSections.has('cards') && (
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${cardPrefs.layout === 'stacked' ? 'lg:grid-cols-1' : 'lg:grid-cols-5 2xl:grid-cols-5'}`} style={{ order: sectionOrder('cards') }}>
          {visibleCards.includes('events') && <div style={{ order: cardOrder('events') }}><StatCard cardKey="events" title="Today's Events" value={stats.todaysEvents} color="#0A52EF" href="/events?filter=today" /></div>}
          {visibleCards.includes('staff') && <div style={{ order: cardOrder('staff') }}><StatCard cardKey="staff" title="Staff" value={stats.assignedStaff} color="#10b981" onClick={() => void openListPanel('staff', 'Staff assigned today')} /></div>}
          {visibleCards.includes('tickets') && <div style={{ order: cardOrder('tickets') }}><StatCard cardKey="tickets" title="Open Tickets" value={stats.openTickets} color="#f59e0b" onClick={() => void openListPanel('tickets', 'Open tickets')} /></div>}
          {visibleCards.includes('workflows') && <div style={{ order: cardOrder('workflows') }}><StatCard cardKey="workflows" title="Pending Workflows" value={stats.pendingWorkflows} color="#f43f5e" onClick={() => void openListPanel('workflows', 'Pending workflows')} /></div>}
          {visibleCards.includes('labor-hours') && <button type="button" onClick={() => void openListPanel('labor', 'Estimated labor hours this week', stats.laborByStaff)} className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6 hover:shadow-md transition-all text-left cursor-pointer" style={{ order: cardOrder('labor-hours') }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Est. Labor Hours</p>
                <p className="text-3xl font-semibold text-zinc-900 mt-3">{stats.estimatedLaborHours}</p>
                <p className="text-xs text-zinc-400 mt-1">this week</p>
              </div>
              <div className="w-2 h-2 rounded-full mt-2" style={{ backgroundColor: '#8b5cf6' }}></div>
            </div>
          </button>}
        </div>
        )}

        {visibleSections.has('automation') && (
        <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6" style={{ order: sectionOrder('automation') }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Automation Coverage</p>
              <h2 className="text-lg font-semibold text-zinc-900 mt-2">Venue Sync Status</h2>
              <p className="text-sm text-zinc-500 mt-1">Sports venues only. OOH and facility venues don't run on event feeds and aren't counted here.</p>
            </div>
            <button
              onClick={() => router.push('/venues')}
              className="text-xs font-semibold text-[#0A52EF] hover:text-[#0840C0] transition-colors"
            >
              Manage venues →
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 dark:border-emerald-500/30 dark:bg-emerald-500/10">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Auto-Sync Active</div>
              <div className="mt-2 text-3xl font-semibold text-emerald-900 dark:text-emerald-100">{stats.autoSyncingVenues}</div>
              <div className="mt-1 text-xs text-emerald-700 dark:text-emerald-300/80">Sports venues with services and feed URLs</div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-500/30 dark:bg-amber-500/10">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-700 dark:text-amber-300">Need Feed URLs</div>
              <div className="mt-2 text-3xl font-semibold text-amber-900 dark:text-amber-100">{stats.venuesNeedingFeedUrls}</div>
              <div className="mt-1 text-xs text-amber-700 dark:text-amber-300/80">Sports venues with services on but no feed configured</div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Inactive Venues</div>
              <div className="mt-2 text-3xl font-semibold text-zinc-900">{stats.inactiveVenues}</div>
              <div className="mt-1 text-xs text-zinc-500">Excluded from all automation until reactivated</div>
            </div>
          </div>
        </div>
        )}

        {/* SECTION 2.5: Alerts */}
        {!loading && alerts.length > 0 && visibleSections.has('alerts') && (
          <div className="space-y-2" style={{ order: sectionOrder('alerts') }}>
            {alerts.map((alert, idx) => {
              const styles = {
                critical: { bg: 'bg-rose-50 dark:bg-rose-500/10', border: 'border-rose-200 dark:border-rose-500/30', text: 'text-rose-800 dark:text-rose-200', dot: 'bg-rose-500' },
                warning: { bg: 'bg-amber-50 dark:bg-amber-500/10', border: 'border-amber-200 dark:border-amber-500/30', text: 'text-amber-800 dark:text-amber-200', dot: 'bg-amber-500' },
                info: { bg: 'bg-blue-50 dark:bg-blue-500/10', border: 'border-blue-200 dark:border-blue-500/30', text: 'text-blue-800 dark:text-blue-200', dot: 'bg-blue-500' },
              }
              const s = styles[alert.severity as keyof typeof styles] || styles.info
              return (
                <div key={idx} className={`${s.bg} ${s.border} border rounded-lg px-4 py-3 flex items-start gap-3`}>
                  <div className={`w-2 h-2 rounded-full ${s.dot} mt-1.5 flex-shrink-0`}></div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${s.text}`}>{alert.title}</p>
                    <p className={`text-xs ${s.text} opacity-75 mt-0.5`}>{alert.detail}</p>
                  </div>
                  {alert.type === 'unassigned' && (
                    <button onClick={() => router.push('/events?filter=today')} className={`text-xs font-medium ${s.text} hover:underline flex-shrink-0`}>
                      View →
                    </button>
                  )}
                  {alert.type === 'upcoming_unassigned' && (
                    <button onClick={() => router.push('/events?filter=week')} className={`text-xs font-medium ${s.text} hover:underline flex-shrink-0`}>
                      View →
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* SECTION 3: Two-column layout */}
        {visibleSections.has('operations') && (
        <div className={`grid grid-cols-1 gap-6 ${sectionPrefs.layout === 'stacked' ? 'lg:grid-cols-1' : 'lg:grid-cols-3 2xl:grid-cols-4'}`} style={{ order: sectionOrder('operations') }}>
          {/* LEFT COLUMN (col-span-2) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Today's Timeline */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E8E8E8] flex items-center justify-between">
                <h2 className="text-lg font-semibold text-zinc-900">Today's Timeline</h2>
                {todaysEvents.length > timelineEvents.length && (
                  <button onClick={() => router.push('/events?filter=today')} className="text-xs font-medium text-[#0A52EF] hover:text-[#0840C0]">
                    View all →
                  </button>
                )}
              </div>
              <div className="px-6 py-4">
                {loading ? (
                  <Skeleton className="h-24 w-full" />
                ) : todaysEvents.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-zinc-500 text-sm">No events scheduled for today</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {timelineEvents.map((event) => {
                      const statusColor = getWorkflowStatus(event.workflow_status)
                      return (
                        <div
                          key={event.id}
                          onClick={() => setPanel({ kind: 'event', id: event.id })}
                          className={`flex items-center gap-3 p-3 rounded cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-white/5 border-l-4 ${statusColor.bg}`}
                          style={{ borderLeftColor: statusColor.border }}
                        >
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${statusColor.dot}`}></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-900 truncate">{event.summary}</p>
                            <p className="text-xs text-zinc-500">{event.venue_name}</p>
                          </div>
                          <div className="text-xs font-mono text-zinc-400 flex-shrink-0">{formatTime(event.start_time, event.venue_timezone)}</div>
                        </div>
                      )
                    })}
                    {todaysEvents.length > timelineEvents.length && (
                      <button
                        onClick={() => router.push('/events?filter=today')}
                        className="w-full rounded border border-dashed border-[#E8E8E8] py-2 text-xs font-medium text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-900"
                      >
                        Show {todaysEvents.length - timelineEvents.length} more today
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Upcoming Events Table */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E8E8E8] flex justify-between items-center">
                <h2 className="text-lg font-semibold text-zinc-900">Upcoming Events</h2>
                <a href="/events" className="text-xs text-[#0A52EF] hover:text-[#0840C0] font-medium">
                  View all →
                </a>
              </div>
              <div className="overflow-x-auto">
                {loading ? (
                  <div className="p-6">
                    <CardSkeleton />
                  </div>
                ) : upcomingEvents.length === 0 ? (
                  <div className="p-6 text-center text-zinc-500 text-sm">No upcoming events</div>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {upcomingEvents.map((event) => {
                        const leagueColor = getLeagueBadge(event.league)
                        const statusColor = getWorkflowStatus(event.workflow_status)
                        return (
                          <tr
                            key={event.id}
                            className="border-b border-[#E8E8E8] hover:bg-zinc-50 cursor-pointer transition-colors"
                            onClick={() => setPanel({ kind: 'event', id: event.id })}
                          >
                            <td className="py-3 px-6 text-zinc-500 font-mono text-xs">{formatTime(event.start_time, event.venue_timezone)}</td>
                            <td className="py-3 px-6 font-medium text-zinc-900">{event.summary}</td>
                            <td className="py-3 px-6 text-zinc-600 text-sm">{event.venue_name}</td>
                            <td className="py-3 px-6">
                              <span className={`inline-block px-2.5 py-1 rounded text-xs font-medium ${leagueColor.bg} ${leagueColor.text}`}>
                                {event.league}
                              </span>
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
          </div>

          {/* RIGHT COLUMN (col-span-1) */}
          <div className="space-y-6">
            {/* Workflow Status Donut Chart */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">Workflow Status</h2>
              {loading || !chartData ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <div className="flex flex-col items-center space-y-4">
                  <svg viewBox="0 0 100 100" className="w-32 h-32">
                    <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="10" className="text-zinc-200 dark:text-zinc-700" />
                    <circle
                      cx="50"
                      cy="50"
                      r="45"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="10"
                      strokeDasharray={`${(chartData.workflow.completed / (chartData.workflow.completed + chartData.workflow.in_progress + chartData.workflow.pending)) * 283} 283`}
                      strokeDashoffset="0"
                    />
                    <text x="50" y="50" textAnchor="middle" dy="0.3em" className="text-xl font-semibold fill-zinc-900 dark:fill-zinc-100">
                      {chartData.workflow.completed + chartData.workflow.in_progress + chartData.workflow.pending}
                    </text>
                  </svg>
                  <div className="space-y-2 w-full">
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                        <span className="text-zinc-600">Completed</span>
                      </div>
                      <span className="font-medium text-zinc-900">{chartData.workflow.completed}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                        <span className="text-zinc-600">In Progress</span>
                      </div>
                      <span className="font-medium text-zinc-900">{chartData.workflow.in_progress}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-zinc-400 rounded-full"></div>
                        <span className="text-zinc-600">Pending</span>
                      </div>
                      <span className="font-medium text-zinc-900">{chartData.workflow.pending}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Labor Budget */}
            {!loading && stats.laborByStaff.length > 0 && (
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
                <h2 className="text-lg font-semibold text-zinc-900 mb-4">Labor Budget</h2>
                <p className="text-xs text-zinc-400 mb-3">Estimated hours this week by staff</p>
                <div className="space-y-3">
                  {stats.laborByStaff.map((staff, idx) => {
                    const maxHours = stats.laborByStaff[0]?.total_hours || 1
                    const pct = (Number(staff.total_hours) / Number(maxHours)) * 100
                    return (
                      <div key={idx}>
                        <div className="flex justify-between items-center text-xs mb-1">
                          <span className="font-medium text-zinc-900 truncate">{staff.full_name}</span>
                          <span className="text-zinc-500 flex-shrink-0 ml-2">{Number(staff.total_hours)}h / {staff.event_count} events</span>
                        </div>
                        <div className="w-full h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }}></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Live Activity */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">Live Activity</h2>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : activity.length === 0 ? (
                <p className="text-zinc-500 text-sm">No recent activity</p>
              ) : (
                <div className="space-y-3">
                  {liveActivityItems.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 text-xs">
                      <div className="w-2 h-2 mt-1 flex-shrink-0 rounded-full bg-[#0A52EF]"></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-zinc-900">
                          <span className="font-medium">{item.staff_name}</span>
                          <span className="text-zinc-600"> {item.type_display}</span>
                          {item.entity_name && (
                            <span className="font-medium"> “{item.entity_name}”</span>
                          )}
                          {item.details?.assigned_to && (
                            <span className="text-zinc-600"> to {item.details.assigned_to}</span>
                          )}
                        </p>
                        {item.venue_name && <p className="truncate text-zinc-500">{item.venue_name}</p>}
                        <p className="text-zinc-400 text-xs">{formatRelativeTime(item.created_at)}</p>
                      </div>
                    </div>
                  ))}
                  {activity.length > liveActivityItems.length && (
                    <div className="border-t border-[#E8E8E8] pt-3 text-xs text-zinc-400">
                      Showing latest {liveActivityItems.length} of {activity.length}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        )}

        {/* SECTION 4: Markets Overview */}
        {!loading && chartData && chartData.eventsByMarket.length > 0 && visibleSections.has('markets') && (
          <div className="space-y-4" style={{ order: sectionOrder('markets') }}>
            <h2 className="text-lg font-semibold text-zinc-900">Markets This Week</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 2xl:grid-cols-6 gap-4">
              {chartData.eventsByMarket.map((market) => (
                <button
                  key={market.market}
                  onClick={() => {
                    const events = weekEvents.filter((event) => {
                      const eventMarket = event.market
                      return eventMarket === market.market
                    })
                    void openListPanel('market', `${displayMarketLabel(market.market)} events this week`, events)
                  }}
                  className="bg-white rounded border border-[#E8E8E8] shadow-sm p-4 hover:shadow-md hover:border-zinc-300 transition-all text-left"
                >
                  <p className="text-sm font-medium text-zinc-900">{displayMarketLabel(market.market)}</p>
                  <p className="text-2xl font-semibold text-zinc-900 mt-2">{market.count}</p>
                  <p className="text-xs text-zinc-500 mt-1">events this week</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <ResizableSidePanel
        open={panel !== null}
        onClose={() => setPanel(null)}
        preferenceKey="dashboard.detailPanelWidth"
        ariaLabel="Dashboard detail"
      >
        {panel?.kind === 'event' && (
          <EventDetailBody id={panel.id} embedded onClose={() => setPanel(null)} />
        )}
        {panel?.kind === 'ticket' && (
          <TicketDetail params={{ id: panel.id }} embedded onClose={() => setPanel(null)} />
        )}
        {panel?.kind === 'list' && (
          <div className="min-h-full bg-zinc-50">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Dashboard detail</p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-900">{panel.title}</h2>
              </div>
              <button
                type="button"
                onClick={() => setPanel(null)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 p-6">
              {panelLoading && <CardSkeleton />}
              {!panelLoading && panel.items.length === 0 && (
                <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500">
                  Nothing to show for this period.
                </div>
              )}
              {!panelLoading && panel.listKind === 'staff' && panel.items.map((item) => (
                <button
                  key={item.event_id}
                  type="button"
                  onClick={() => setPanel({ kind: 'event', id: item.event_id })}
                  className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-zinc-900">{item.event_name}</p>
                      <p className="mt-1 text-sm text-zinc-500">{item.venue_name}</p>
                    </div>
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
                      {item.technicians?.length || 0} assigned
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-zinc-700">
                    {item.technicians?.length ? item.technicians.join(', ') : 'No staff assigned'}
                  </p>
                </button>
              ))}
              {!panelLoading && panel.listKind === 'tickets' && panel.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPanel({ kind: 'ticket', id: item.id })}
                  className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-zinc-900">#{String(item.ticket_number).padStart(8, '0')} · {item.title}</p>
                      <p className="mt-1 text-sm text-zinc-500">{item.venue_name || 'No venue'}</p>
                    </div>
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium capitalize text-amber-700">
                      {String(item.priority || 'medium').replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="mt-3 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    {String(item.status || 'new').replace(/_/g, ' ')}
                  </p>
                </button>
              ))}
              {!panelLoading && panel.listKind === 'workflows' && panel.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPanel({ kind: 'event', id: item.id })}
                  className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow"
                >
                  <p className="font-semibold text-zinc-900">{item.event_name}</p>
                  <p className="mt-1 text-sm text-zinc-500">{item.venue_name}</p>
                  <p className="mt-3 text-xs font-medium uppercase tracking-wide text-rose-600">Workflow pending</p>
                </button>
              ))}
              {!panelLoading && panel.listKind === 'labor' && panel.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => router.push(`/staff/${item.id}`)}
                  className="flex w-full items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-violet-300 hover:shadow"
                >
                  <div>
                    <p className="font-semibold text-zinc-900">{item.full_name}</p>
                    <p className="mt-1 text-sm text-zinc-500">{item.event_count} event{Number(item.event_count) === 1 ? '' : 's'}</p>
                  </div>
                  <span className="text-lg font-semibold text-violet-700">{Number(item.total_hours)}h</span>
                </button>
              ))}
              {!panelLoading && panel.listKind === 'market' && panel.items.map((event: Event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => setPanel({ kind: 'event', id: event.id })}
                  className="w-full rounded-xl border border-zinc-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-zinc-900">{event.summary}</p>
                      <p className="mt-1 text-sm text-zinc-500">{event.venue_name}</p>
                    </div>
                    <span className="text-xs font-mono text-zinc-500">{formatTime(event.start_time, event.venue_timezone)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </ResizableSidePanel>
    </DashboardLayout>
  )
}
