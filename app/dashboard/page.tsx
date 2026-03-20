'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton, CardSkeleton } from '@/components/skeleton'

interface DashboardStats {
  todaysEvents: number
  assignedStaff: number
  openTickets: number
  pendingWorkflows: number
}

interface Event {
  id: string
  summary: string
  venue_name: string
  league: string
  start_time: string
  event_date: string
  workflow_status: string
}

interface Activity {
  source: string
  type: string
  type_display: string
  created_at: string
  staff_name: string
  event_name: string
  venue_name: string | null
}

interface ChartData {
  workflow: { completed: number; in_progress: number; pending: number }
  eventsByMarket: Array<{ market: string; count: number }>
  eventsByLeague: Array<{ league: string; count: number }>
}

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

const workflowStatusColors: Record<string, { dot: string; bg: string; text: string }> = {
  pending: { dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-700' },
  checked_in: { dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
  game_ready: { dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  post_game_submitted: { dot: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    todaysEvents: 0,
    assignedStaff: 0,
    openTickets: 0,
    pendingWorkflows: 0,
  })
  const [todaysEvents, setTodaysEvents] = useState<Event[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [chartData, setChartData] = useState<ChartData | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedCard, setExpandedCard] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, todayRes, activityRes, chartRes] = await Promise.all([
          fetch('/api/stats'),
          fetch('/api/events?filter=today'),
          fetch('/api/activity'),
          fetch('/api/stats/charts'),
        ])

        if (statsRes.ok) setStats(await statsRes.json())
        if (todayRes.ok) {
          const data = await todayRes.json()
          setTodaysEvents(data.events || [])
        }
        if (activityRes.ok) setActivity(await activityRes.json())
        if (chartRes.ok) setChartData(await chartRes.json())
      } catch (err) {
        console.error('Failed to fetch data:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const formatTime = (dateTimeStr: string) => {
    const date = new Date(dateTimeStr)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
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

  const StatCard = ({ title, value, color, key: cardKey }: { title: string; value: number; color: string; key: string }) => (
    <div
      onClick={() => setExpandedCard(expandedCard === cardKey ? null : cardKey)}
      className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6 hover:shadow-md transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">{title}</p>
          <p className="text-3xl font-semibold text-zinc-900 mt-3">{value}</p>
        </div>
        <div className="w-2 h-2 rounded-full mt-2" style={{ backgroundColor: color }}></div>
      </div>
    </div>
  )

  const today = new Date()
  const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][today.getDay()]
  const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][today.getMonth()]
  const todayFormatted = `${dayName}, ${monthName} ${today.getDate()}, ${today.getFullYear()}`

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* SECTION 1: Welcome Header */}
        <div className="flex justify-between items-baseline">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Welcome back, Ahmad</h1>
            <p className="text-zinc-500 text-sm mt-1">Here's your operations overview</p>
          </div>
          <p className="text-xs text-zinc-400">{todayFormatted}</p>
        </div>

        {/* SECTION 2: Stat Cards (4-column grid) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard key="events" title="Today's Events" value={stats.todaysEvents} color="#0A52EF" />
          <StatCard key="staff" title="Staff Assigned" value={stats.assignedStaff} color="#10b981" />
          <StatCard key="tickets" title="Open Tickets" value={stats.openTickets} color="#f59e0b" />
          <StatCard key="workflows" title="Pending Workflows" value={stats.pendingWorkflows} color="#f43f5e" />
        </div>

        {/* SECTION 3: Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* LEFT COLUMN (col-span-2) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Today's Timeline */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-[#E8E8E8]">
                <h2 className="text-lg font-semibold text-zinc-900">Today's Timeline</h2>
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
                    {todaysEvents.map((event) => {
                      const statusColor = getWorkflowStatus(event.workflow_status)
                      return (
                        <div
                          key={event.id}
                          onClick={() => router.push(`/events/${event.id}`)}
                          className={`flex items-center gap-3 p-3 rounded cursor-pointer transition-colors hover:bg-zinc-50 border-l-4 ${statusColor.bg}`}
                          style={{ borderColor: statusColor.dot.replace('bg-', '').split('-')[0] }}
                        >
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: statusColor.dot }}></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-900 truncate">{event.summary}</p>
                            <p className="text-xs text-zinc-500">{event.venue_name}</p>
                          </div>
                          <div className="text-xs font-mono text-zinc-400 flex-shrink-0">{formatTime(event.start_time)}</div>
                        </div>
                      )
                    })}
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
                ) : todaysEvents.length === 0 ? (
                  <div className="p-6 text-center text-zinc-500 text-sm">No upcoming events</div>
                ) : (
                  <table className="w-full text-sm">
                    <tbody>
                      {todaysEvents.slice(0, 15).map((event) => {
                        const leagueColor = getLeagueBadge(event.league)
                        const statusColor = getWorkflowStatus(event.workflow_status)
                        return (
                          <tr
                            key={event.id}
                            className="border-b border-[#E8E8E8] hover:bg-zinc-50 cursor-pointer transition-colors"
                            onClick={() => router.push(`/events/${event.id}`)}
                          >
                            <td className="py-3 px-6 text-zinc-500 font-mono text-xs">{formatTime(event.start_time)}</td>
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
                                <span className="text-zinc-700 text-xs">{statusColor.dot.replace('bg-', '')}</span>
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
                    <circle cx="50" cy="50" r="45" fill="none" stroke="#e4e4e7" strokeWidth="10" />
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
                    <text x="50" y="50" textAnchor="middle" dy="0.3em" className="text-xl font-semibold fill-zinc-900">
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
                  {activity.slice(0, 8).map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 text-xs">
                      <div className="w-2 h-2 mt-1 flex-shrink-0 rounded-full bg-[#0A52EF]"></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-zinc-900">
                          <span className="font-medium">{item.staff_name}</span>
                          <span className="text-zinc-600"> {item.type_display}</span>
                        </p>
                        <p className="text-zinc-400 text-xs">{formatRelativeTime(item.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 4: Markets Overview */}
        {!loading && chartData && chartData.eventsByMarket.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-zinc-900">Markets This Week</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {chartData.eventsByMarket.map((market) => (
                <button
                  key={market.market}
                  onClick={() => router.push(`/events?market=${market.market}`)}
                  className="bg-white rounded border border-[#E8E8E8] shadow-sm p-4 hover:shadow-md hover:border-zinc-300 transition-all text-left"
                >
                  <p className="text-sm font-medium text-zinc-900">{market.market}</p>
                  <p className="text-2xl font-semibold text-zinc-900 mt-2">{market.count}</p>
                  <p className="text-xs text-zinc-500 mt-1">events this week</p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
