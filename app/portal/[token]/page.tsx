'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Venue { id: string; name: string; address: string; market: string; primary_contact_name: string | null; primary_contact_email: string | null }
interface Event { id: string; summary: string; league: string; event_date: string; start_time: string; workflow_status: string; staff_count?: number }
interface Ticket { id: string; ticket_number: number; title: string; description: string; category: string; priority: string; status: string; resolution_notes: string | null; created_at: string; resolved_at: string | null }
interface Service { name: string; description: string | null; enabled: boolean }
interface WorkflowStep { type: string; submitted_at: string }
interface Stats { upcomingEvents: number; pastMonthEvents: number; completedEvents: number; completionRate: number; openTickets: number; avgResolutionHours: number | null }

const leagueColors: Record<string, string> = { NBA: '#f97316', NHL: '#3b82f6', NCAAM: '#7c3aed', NCAAW: '#ec4899', MLB: '#dc2626', AHL: '#14b8a6', 'NBA G League': '#f97316', MiLB: '#10b981' }
const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Scheduled', color: '#64748b', bg: '#f1f5f9' },
  checked_in: { label: 'Staff On Site', color: '#d97706', bg: '#fffbeb' },
  game_ready: { label: 'Game Ready', color: '#059669', bg: '#ecfdf5' },
  post_game_submitted: { label: 'Completed', color: '#2563eb', bg: '#eff6ff' },
}
const priorityColors: Record<string, { color: string; bg: string }> = { low: { color: '#64748b', bg: '#f1f5f9' }, medium: { color: '#d97706', bg: '#fffbeb' }, high: { color: '#ea580c', bg: '#fff7ed' }, critical: { color: '#dc2626', bg: '#fef2f2' } }
const ticketStatusColors: Record<string, { color: string; bg: string }> = { open: { color: '#dc2626', bg: '#fef2f2' }, in_progress: { color: '#d97706', bg: '#fffbeb' }, resolved: { color: '#059669', bg: '#ecfdf5' }, closed: { color: '#64748b', bg: '#f1f5f9' } }
const workflowLabels: Record<string, string> = { check_in: 'Staff checked in on site', game_ready: 'Game readiness confirmed', post_game_report: 'Post-game report submitted' }

export default function PortalPage() {
  const params = useParams()
  const token = params?.token as string

  const [venue, setVenue] = useState<Venue | null>(null)
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([])
  const [pastEvents, setPastEvents] = useState<Event[]>([])
  const [workflowsByEvent, setWorkflowsByEvent] = useState<Record<string, WorkflowStep[]>>({})
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [screens, setScreens] = useState<any[]>([])
  const [todayEvents, setTodayEvents] = useState<any[]>([])
  const [todayWorkflow, setTodayWorkflow] = useState<any[]>([])
  const [team, setTeam] = useState<any[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'events' | 'tickets' | 'services'>('overview')
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)

  // AI ticket
  const [aiMessage, setAiMessage] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<any>(null)

  // Follow-up flow
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<number, string>>({})
  const [followUpSubmitting, setFollowUpSubmitting] = useState(false)
  const [followUpDone, setFollowUpDone] = useState(false)

  // Ticket reply
  const [viewingTicket, setViewingTicket] = useState<string | null>(null)
  const [ticketComments, setTicketComments] = useState<any[]>([])
  const [newReply, setNewReply] = useState('')
  const [replyLoading, setReplyLoading] = useState(false)

  useEffect(() => {
    if (!token) return
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/portal/${token}`)
        if (!res.ok) { setError('This portal link is invalid or has expired.'); return }
        const data = await res.json()
        setVenue(data.venue)
        setUpcomingEvents(data.upcomingEvents || [])
        setPastEvents(data.pastEvents || [])
        setWorkflowsByEvent(data.workflowsByEvent || {})
        setTickets(data.tickets || [])
        setServices(data.services || [])
        setScreens(data.screens || [])
        setTodayEvents(data.todayEvents || [])
        setTodayWorkflow(data.todayWorkflow || [])
        setTeam(data.team || [])
        setStats(data.stats)
      } catch { setError('Unable to load portal.') }
      finally { setLoading(false) }
    }
    fetchData()
  }, [token])

  const submitAiTicket = async () => {
    if (!aiMessage.trim()) return
    setAiLoading(true)
    try {
      const res = await fetch(`/api/portal/${token}/tickets/ai`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: aiMessage }),
      })
      if (res.ok) {
        const data = await res.json()
        setAiResult(data)
        setTickets([{ ...data.ticket, description: data.parsed?.description || aiMessage, created_at: 'Just now', resolved_at: null }, ...tickets])
        setAiMessage('')
      }
    } catch {}
    setAiLoading(false)
  }

  const viewTicket = async (ticketId: string) => {
    setViewingTicket(ticketId)
    try {
      const res = await fetch(`/api/portal/${token}/tickets?id=${ticketId}`)
      if (res.ok) {
        const data = await res.json()
        setTicketComments(data.comments || [])
      }
    } catch {}
  }

  const submitFollowUp = async () => {
    if (!aiResult?.ticket?.id || !aiResult?.parsed?.follow_up) return
    setFollowUpSubmitting(true)
    const answers = aiResult.parsed.follow_up.map((q: string, i: number) => `Q: ${q}\nA: ${followUpAnswers[i] || 'No answer provided'}`).join('\n\n')
    try {
      // Add as a comment on the existing ticket, not a new ticket
      await fetch(`/api/portal/${token}/tickets/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: aiResult.ticket.id, body: answers }),
      })
      setFollowUpDone(true)
    } catch {}
    setFollowUpSubmitting(false)
  }

  const submitReply = async () => {
    if (!newReply.trim() || !viewingTicket) return
    setReplyLoading(true)
    try {
      const res = await fetch(`/api/portal/${token}/tickets`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Reply on ticket`, description: newReply }),
      })
      if (res.ok) { setNewReply(''); viewTicket(viewingTicket) }
    } catch {}
    setReplyLoading(false)
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  if (loading) return (
    <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center">
      <div className="text-center"><img src="/ANC_Logo_2023_blue.png" alt="ANC" className="h-10 mx-auto mb-4" /><p className="text-zinc-400 text-sm">Loading your portal...</p></div>
    </div>
  )

  if (error || !venue) return (
    <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center">
      <div className="text-center max-w-md"><img src="/ANC_Logo_2023_blue.png" alt="ANC" className="h-10 mx-auto mb-6" /><h1 className="text-xl font-semibold text-zinc-900 mb-2">Portal Unavailable</h1><p className="text-zinc-500 text-sm">{error}</p></div>
    </div>
  )

  const openTickets = tickets.filter(t => t.status === 'open' || t.status === 'in_progress')

  return (
    <div className="min-h-screen bg-[#fafbfc]">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/ANC_Logo_2023_blue.png" alt="ANC" className="h-8" />
            <div className="h-6 w-px bg-zinc-200"></div>
            <div>
              <h1 className="text-sm font-semibold text-zinc-900">{venue.name}</h1>
              <p className="text-xs text-zinc-500">{venue.market}</p>
            </div>
          </div>
          {venue.primary_contact_name && <p className="text-xs text-zinc-400">Welcome, {venue.primary_contact_name}</p>}
        </div>
      </header>

      {/* Nav */}
      <nav className="bg-white border-b border-zinc-200">
        <div className="max-w-6xl mx-auto px-6 flex gap-0">
          {(['overview', 'events', 'tickets', 'services'] as const).map(tab => (
            <button key={tab} onClick={() => { setActiveTab(tab); setViewingTicket(null); setAiResult(null) }}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-[#0A52EF] text-[#0A52EF]' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}>
              {tab === 'overview' && 'Overview'}
              {tab === 'events' && 'Events'}
              {tab === 'tickets' && `Tickets${openTickets.length > 0 ? ` (${openTickets.length})` : ''}`}
              {tab === 'services' && 'Services & Specs'}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-6 py-8">

        {/* OVERVIEW */}
        {activeTab === 'overview' && stats && (
          <div className="space-y-8">
            {/* Service Level Banner */}
            <div className="bg-gradient-to-r from-[#002C73] to-[#0A52EF] rounded-xl p-8 text-white relative overflow-hidden">
              {/* Brand slashes */}
              <div className="absolute top-[-20px] right-[-10px] opacity-[0.06]">
                <div className="inline-block w-[60px] h-[140px] bg-white transform skew-x-[-35deg] ml-3"></div>
                <div className="inline-block w-[60px] h-[140px] bg-white transform skew-x-[-35deg] ml-3"></div>
                <div className="inline-block w-[60px] h-[140px] bg-white transform skew-x-[-35deg] ml-3"></div>
                <div className="inline-block w-[60px] h-[140px] bg-white transform skew-x-[-35deg] ml-3"></div>
              </div>
              <div className="flex items-start justify-between relative z-10">
                <p className="text-xs font-medium uppercase tracking-wider opacity-75">Service Level — Last 30 Days</p>
                <a href={`/api/portal/${token}/report`} download
                  className="text-xs font-medium bg-white/15 hover:bg-white/25 px-4 py-2 rounded-lg transition-colors">
                  Download Monthly Report
                </a>
              </div>
              <div className="flex items-end gap-12 mt-4 relative z-10">
                <div>
                  <p className="text-5xl font-bold">{stats.completionRate}%</p>
                  <p className="text-sm opacity-75 mt-1">Workflow Completion</p>
                </div>
                <div>
                  <p className="text-3xl font-bold">{stats.pastMonthEvents}</p>
                  <p className="text-sm opacity-75 mt-1">Events Covered</p>
                </div>
                <div>
                  <p className="text-3xl font-bold">{stats.completedEvents}</p>
                  <p className="text-sm opacity-75 mt-1">Reports Filed</p>
                </div>
                {stats.avgResolutionHours !== null && (
                  <div>
                    <p className="text-3xl font-bold">{stats.avgResolutionHours}h</p>
                    <p className="text-sm opacity-75 mt-1">Avg Resolution</p>
                  </div>
                )}
              </div>
            </div>

            {/* LIVE GAME DAY VIEW */}
            {todayEvents.length > 0 && (
              <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                    <h2 className="text-sm font-semibold text-zinc-900">Live — Today's Events</h2>
                  </div>
                  <span className="text-xs text-zinc-400">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                </div>
                <div className="divide-y divide-zinc-100">
                  {todayEvents.map((event: any) => {
                    const st = statusConfig[event.workflow_status] || statusConfig.pending
                    const eventWf = todayWorkflow.filter((w: any) => w.event_id === event.id)
                    return (
                      <div key={event.id} className="px-6 py-5">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-1.5 h-8 rounded-full" style={{ backgroundColor: leagueColors[event.league] || '#94a3b8' }}></div>
                            <div>
                              <p className="text-sm font-semibold text-zinc-900">{event.summary}</p>
                              <p className="text-xs text-zinc-500">{event.start_time} ET • {event.league}</p>
                            </div>
                          </div>
                          <span className="text-xs font-medium px-3 py-1.5 rounded-full" style={{ color: st.color, backgroundColor: st.bg }}>{st.label}</span>
                        </div>
                        {/* Timeline */}
                        <div className="ml-6 pl-4 border-l-2 border-zinc-100 space-y-3">
                          {eventWf.length > 0 ? eventWf.map((step: any, i: number) => (
                            <div key={i} className="flex items-center gap-3 relative">
                              <div className="absolute -left-[21px] w-3 h-3 rounded-full bg-emerald-500 border-2 border-white"></div>
                              <div className="flex-1">
                                <p className="text-sm text-zinc-900">{workflowLabels[step.type] || step.type}</p>
                                <p className="text-xs text-zinc-500">{step.staff_name} — {step.time} ET</p>
                              </div>
                            </div>
                          )) : (
                            <div className="flex items-center gap-3 relative">
                              <div className="absolute -left-[21px] w-3 h-3 rounded-full bg-zinc-300 border-2 border-white"></div>
                              <p className="text-xs text-zinc-400">Awaiting staff check-in...</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* YOUR ANC TEAM */}
            {team.length > 0 && (
              <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-100">
                  <h2 className="text-sm font-semibold text-zinc-900">Your ANC Team</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">Technicians assigned to your upcoming events</p>
                </div>
                <div className="px-6 py-4">
                  <div className="flex flex-wrap gap-4">
                    {team.map((member: any) => (
                      <div key={member.id} className="flex items-center gap-3 bg-zinc-50 rounded-lg px-4 py-3 min-w-48">
                        {member.profile_image ? (
                          <img src={member.profile_image} alt={member.full_name} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#0A52EF]/10 flex items-center justify-center text-sm font-semibold text-[#0A52EF]">
                            {member.full_name.split(' ').map((n: string) => n[0]).join('').substring(0, 2)}
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-zinc-900">{member.full_name}</p>
                          <p className="text-xs text-zinc-500">{member.title || member.role}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Quick Glance */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Upcoming Events with Live Status */}
              <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center">
                  <h2 className="text-sm font-semibold text-zinc-900">Upcoming Events</h2>
                  <button onClick={() => setActiveTab('events')} className="text-xs text-[#0A52EF] font-medium">View all →</button>
                </div>
                {upcomingEvents.length === 0 ? (
                  <div className="p-8 text-center text-zinc-400 text-sm">No upcoming events</div>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {upcomingEvents.slice(0, 5).map(event => {
                      const st = statusConfig[event.workflow_status] || statusConfig.pending
                      const wf = workflowsByEvent[event.id] || []
                      const isExpanded = expandedEvent === event.id
                      return (
                        <div key={event.id}>
                          <div className="px-6 py-3 flex items-center justify-between cursor-pointer hover:bg-zinc-50" onClick={() => setExpandedEvent(isExpanded ? null : event.id)}>
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: leagueColors[event.league] || '#94a3b8' }}></div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-zinc-900 truncate">{event.summary}</p>
                                <p className="text-xs text-zinc-500">{formatDate(event.event_date)} • {event.start_time}</p>
                              </div>
                            </div>
                            <span className="text-xs font-medium px-2 py-1 rounded flex-shrink-0 ml-3" style={{ color: st.color, backgroundColor: st.bg }}>{st.label}</span>
                          </div>
                          {/* Expanded workflow timeline */}
                          {isExpanded && wf.length > 0 && (
                            <div className="px-6 pb-3 pl-12">
                              <div className="border-l-2 border-zinc-200 pl-4 space-y-2">
                                {wf.map((step, i) => (
                                  <div key={i} className="flex items-center gap-2 text-xs">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 -ml-5"></div>
                                    <span className="text-zinc-700">{workflowLabels[step.type] || step.type}</span>
                                    <span className="text-zinc-400">{step.submitted_at}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {isExpanded && wf.length === 0 && (
                            <div className="px-6 pb-3 pl-12">
                              <p className="text-xs text-zinc-400">No workflow activity yet</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* AI Ticket + Open Tickets */}
              <div className="space-y-6">
                {/* AI Ticket Creator */}
                <div className="bg-white rounded-lg border border-zinc-200 p-6">
                  <h2 className="text-sm font-semibold text-zinc-900 mb-1">Need Help?</h2>
                  <p className="text-xs text-zinc-500 mb-4">Describe your issue and we'll create a support ticket for you</p>
                  {aiResult ? (
                    <div className="space-y-3">
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                        <p className="text-sm font-medium text-emerald-900">Ticket #{aiResult.ticket.ticket_number} created</p>
                        <p className="text-xs text-emerald-700 mt-1">{aiResult.parsed?.title || aiResult.ticket.title}</p>
                        <div className="flex gap-2 mt-2">
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 capitalize">{aiResult.ticket.category}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 capitalize">{aiResult.ticket.priority} priority</span>
                        </div>
                      </div>

                      {/* Follow-up questions */}
                      {aiResult.parsed?.follow_up && aiResult.parsed.follow_up.length > 0 && !followUpDone && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <p className="text-xs font-semibold text-blue-900 mb-3">To help us resolve this faster:</p>
                          <div className="space-y-3">
                            {aiResult.parsed.follow_up.map((q: string, i: number) => (
                              <div key={i}>
                                <p className="text-xs font-medium text-blue-800 mb-1">{q}</p>
                                <input
                                  type="text"
                                  value={followUpAnswers[i] || ''}
                                  onChange={e => setFollowUpAnswers({ ...followUpAnswers, [i]: e.target.value })}
                                  placeholder="Your answer..."
                                  className="w-full px-3 py-2 border border-blue-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30 bg-white text-zinc-900"
                                />
                              </div>
                            ))}
                          </div>
                          <div className="flex gap-2 mt-3">
                            <button onClick={submitFollowUp} disabled={followUpSubmitting}
                              className="text-xs font-medium px-4 py-2 bg-[#0A52EF] text-white rounded-lg hover:bg-[#0840C0] disabled:opacity-50 transition-colors">
                              {followUpSubmitting ? 'Sending...' : 'Send Details'}
                            </button>
                            <button onClick={() => setFollowUpDone(true)} className="text-xs text-zinc-500 px-3 py-2 hover:text-zinc-700">
                              Skip
                            </button>
                          </div>
                        </div>
                      )}

                      {followUpDone && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
                          <p className="text-xs text-emerald-700">Thanks! Our team has been notified and will follow up shortly.</p>
                        </div>
                      )}

                      <button onClick={() => { setAiResult(null); setFollowUpAnswers({}); setFollowUpDone(false) }} className="text-xs text-zinc-500 hover:underline">
                        Submit another issue
                      </button>
                    </div>
                  ) : (
                    <div>
                      <textarea
                        value={aiMessage}
                        onChange={e => setAiMessage(e.target.value)}
                        placeholder='e.g., "The left LED panel on the scoreboard went dark during the third quarter"'
                        className="w-full border border-zinc-200 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900 resize-none"
                        rows={3}
                      />
                      <button onClick={submitAiTicket} disabled={aiLoading || !aiMessage.trim()}
                        className="mt-3 w-full py-2.5 bg-[#0A52EF] text-white rounded-lg text-sm font-medium hover:bg-[#0840C0] disabled:opacity-50 transition-colors">
                        {aiLoading ? 'Creating ticket...' : 'Submit Issue'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Open Tickets */}
                <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
                  <div className="px-6 py-4 border-b border-zinc-100">
                    <h2 className="text-sm font-semibold text-zinc-900">Open Tickets</h2>
                  </div>
                  {openTickets.length === 0 ? (
                    <div className="p-6 text-center"><p className="text-emerald-600 font-medium text-sm">All clear</p></div>
                  ) : (
                    <div className="divide-y divide-zinc-100">
                      {openTickets.slice(0, 5).map(ticket => {
                        const pc = priorityColors[ticket.priority] || priorityColors.medium
                        return (
                          <div key={ticket.id} className="px-6 py-3 hover:bg-zinc-50 cursor-pointer" onClick={() => { setActiveTab('tickets'); viewTicket(ticket.id) }}>
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium text-zinc-900">{ticket.title}</p>
                              <span className="text-xs font-medium px-2 py-0.5 rounded capitalize" style={{ color: pc.color, backgroundColor: pc.bg }}>{ticket.priority}</span>
                            </div>
                            <p className="text-xs text-zinc-400 mt-1">#{ticket.ticket_number} • {ticket.category} • {ticket.created_at}</p>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* EVENTS */}
        {activeTab === 'events' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-zinc-900">Upcoming Events</h2>
            {upcomingEvents.length === 0 ? (
              <div className="bg-white rounded-lg border border-zinc-200 p-12 text-center text-zinc-400">No upcoming events</div>
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map(event => {
                  const st = statusConfig[event.workflow_status] || statusConfig.pending
                  const wf = workflowsByEvent[event.id] || []
                  const isExpanded = expandedEvent === event.id
                  return (
                    <div key={event.id} className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
                      <div className="p-5 flex items-center justify-between cursor-pointer hover:bg-zinc-50" onClick={() => setExpandedEvent(isExpanded ? null : event.id)}>
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="w-1.5 h-12 rounded-full flex-shrink-0" style={{ backgroundColor: leagueColors[event.league] || '#94a3b8' }}></div>
                          <div>
                            <p className="text-sm font-medium text-zinc-900">{event.summary}</p>
                            <p className="text-xs text-zinc-500 mt-0.5">{formatDate(event.event_date)} • {event.start_time} • {event.league}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {Number(event.staff_count) > 0 && <span className="text-xs text-zinc-500">{event.staff_count} staff</span>}
                          <span className="text-xs font-medium px-3 py-1.5 rounded-full" style={{ color: st.color, backgroundColor: st.bg }}>{st.label}</span>
                          <span className="text-xs text-zinc-400">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="px-5 pb-5 pt-0 border-t border-zinc-100">
                          <div className="mt-4 ml-6">
                            {wf.length > 0 ? (
                              <div className="space-y-3">
                                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Live Updates</p>
                                {wf.map((step, i) => (
                                  <div key={i} className="flex items-center gap-3">
                                    <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                    </div>
                                    <div>
                                      <p className="text-sm text-zinc-900">{workflowLabels[step.type] || step.type}</p>
                                      <p className="text-xs text-zinc-500">{step.submitted_at}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-zinc-400">No updates yet — workflow begins when staff arrive on site</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {pastEvents.length > 0 && (
              <>
                <h2 className="text-lg font-semibold text-zinc-900 mt-8">Recent Events</h2>
                <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
                  <div className="divide-y divide-zinc-100">
                    {pastEvents.map(event => {
                      const st = statusConfig[event.workflow_status] || statusConfig.pending
                      return (
                        <div key={event.id} className="px-6 py-3 flex items-center justify-between">
                          <div>
                            <p className="text-sm text-zinc-700">{event.summary}</p>
                            <p className="text-xs text-zinc-400">{formatDate(event.event_date)} • {event.league}</p>
                          </div>
                          <span className="text-xs font-medium px-2 py-1 rounded" style={{ color: st.color, backgroundColor: st.bg }}>{st.label}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* TICKETS */}
        {activeTab === 'tickets' && (
          <div className="space-y-6">
            {/* AI Ticket Creator */}
            <div className="bg-gradient-to-r from-[#002C73] to-[#0A52EF] rounded-xl p-6 text-white">
              <h2 className="text-sm font-semibold mb-1">Report an Issue</h2>
              <p className="text-xs opacity-75 mb-4">Describe your problem in plain English — AI will categorize and create your ticket</p>
              {aiResult ? (
                <div className="bg-white/10 rounded-lg p-4">
                  <p className="text-sm font-medium">Ticket #{aiResult.ticket.ticket_number} created</p>
                  <p className="text-xs opacity-75 mt-1">{aiResult.parsed?.title}</p>
                  <div className="flex gap-2 mt-2">
                    <span className="text-xs px-2 py-0.5 rounded bg-white/20 capitalize">{aiResult.ticket.category}</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-white/20 capitalize">{aiResult.ticket.priority}</span>
                  </div>
                  {aiResult.parsed?.follow_up && aiResult.parsed.follow_up.length > 0 && !followUpDone && (
                    <div className="mt-3 pt-3 border-t border-white/20 space-y-2">
                      <p className="text-xs font-medium opacity-90">Quick follow-up:</p>
                      {aiResult.parsed.follow_up.map((q: string, i: number) => (
                        <div key={i}>
                          <p className="text-xs opacity-75 mb-1">{q}</p>
                          <input type="text" value={followUpAnswers[i] || ''} onChange={e => setFollowUpAnswers({ ...followUpAnswers, [i]: e.target.value })}
                            placeholder="Your answer..."
                            className="w-full px-3 py-1.5 bg-white/10 border border-white/20 rounded text-xs text-white placeholder-white/40 focus:outline-none" />
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <button onClick={submitFollowUp} disabled={followUpSubmitting}
                          className="text-xs font-medium px-4 py-1.5 bg-white text-[#0A52EF] rounded hover:bg-white/90 disabled:opacity-50">
                          {followUpSubmitting ? 'Sending...' : 'Send'}
                        </button>
                        <button onClick={() => setFollowUpDone(true)} className="text-xs opacity-50 hover:opacity-75 px-3">Skip</button>
                      </div>
                    </div>
                  )}
                  {followUpDone && <p className="text-xs opacity-75 mt-3">Thanks! Our team is on it.</p>}
                  <button onClick={() => { setAiResult(null); setFollowUpAnswers({}); setFollowUpDone(false) }} className="text-xs opacity-75 hover:opacity-100 mt-3">Submit another →</button>
                </div>
              ) : (
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={aiMessage}
                    onChange={e => setAiMessage(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') submitAiTicket() }}
                    placeholder='e.g., "Scoreboard display is flickering on the right side"'
                    className="flex-1 px-4 py-2.5 bg-white/10 border border-white/20 rounded-lg text-sm text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-white/30"
                  />
                  <button onClick={submitAiTicket} disabled={aiLoading || !aiMessage.trim()}
                    className="px-6 py-2.5 bg-white text-[#0A52EF] rounded-lg text-sm font-medium hover:bg-white/90 disabled:opacity-50 transition-colors flex-shrink-0">
                    {aiLoading ? 'Creating...' : 'Submit'}
                  </button>
                </div>
              )}
            </div>

            {/* Ticket Detail View */}
            {viewingTicket && (
              <div className="bg-white rounded-lg border border-zinc-200 p-6">
                <button onClick={() => setViewingTicket(null)} className="text-xs text-zinc-500 hover:text-zinc-700 mb-4">← Back to tickets</button>
                {(() => {
                  const t = tickets.find(t => t.id === viewingTicket)
                  if (!t) return null
                  const sc = ticketStatusColors[t.status] || ticketStatusColors.open
                  return (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-mono text-zinc-400">#{t.ticket_number}</span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded capitalize" style={{ color: sc.color, backgroundColor: sc.bg }}>{t.status.replace('_', ' ')}</span>
                      </div>
                      <h3 className="text-lg font-semibold text-zinc-900">{t.title}</h3>
                      {t.description && <p className="text-sm text-zinc-600 mt-2">{t.description}</p>}
                      {t.resolution_notes && (
                        <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                          <p className="text-xs font-medium text-emerald-900">Resolution</p>
                          <p className="text-sm text-emerald-800 mt-1">{t.resolution_notes}</p>
                        </div>
                      )}

                      {/* Comments */}
                      <div className="mt-6 border-t border-zinc-200 pt-4">
                        <h4 className="text-sm font-semibold text-zinc-900 mb-3">Updates</h4>
                        {ticketComments.length === 0 ? (
                          <p className="text-xs text-zinc-400">No updates yet</p>
                        ) : (
                          <div className="space-y-3">
                            {ticketComments.map((c: any, i: number) => (
                              <div key={i} className="bg-zinc-50 rounded-lg p-3">
                                <div className="flex justify-between">
                                  <span className="text-xs font-medium text-zinc-900">{c.author}</span>
                                  <span className="text-xs text-zinc-400">{new Date(c.created_at).toLocaleString()}</span>
                                </div>
                                <p className="text-sm text-zinc-700 mt-1">{c.body}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Tickets List */}
            {!viewingTicket && (
              <>
                {tickets.length === 0 ? (
                  <div className="bg-white rounded-lg border border-zinc-200 p-12 text-center">
                    <p className="text-emerald-600 font-medium">No tickets</p>
                    <p className="text-zinc-400 text-sm mt-1">Use the form above to report any issues</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-zinc-200 bg-zinc-50">
                          <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">#</th>
                          <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Subject</th>
                          <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Category</th>
                          <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Priority</th>
                          <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Status</th>
                          <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tickets.map(ticket => {
                          const pc = priorityColors[ticket.priority] || priorityColors.medium
                          const sc = ticketStatusColors[ticket.status] || ticketStatusColors.open
                          return (
                            <tr key={ticket.id} onClick={() => viewTicket(ticket.id)} className="border-b border-zinc-100 hover:bg-zinc-50 cursor-pointer">
                              <td className="py-3 px-6 text-zinc-400 text-xs font-mono">{ticket.ticket_number}</td>
                              <td className="py-3 px-6 font-medium text-zinc-900">{ticket.title}</td>
                              <td className="py-3 px-6 text-zinc-600 text-xs capitalize">{ticket.category}</td>
                              <td className="py-3 px-6"><span className="text-xs font-medium px-2 py-0.5 rounded capitalize" style={{ color: pc.color, backgroundColor: pc.bg }}>{ticket.priority}</span></td>
                              <td className="py-3 px-6"><span className="text-xs font-medium px-2 py-0.5 rounded capitalize" style={{ color: sc.color, backgroundColor: sc.bg }}>{ticket.status.replace('_', ' ')}</span></td>
                              <td className="py-3 px-6 text-zinc-500 text-xs">{ticket.created_at}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* SERVICES */}
        {activeTab === 'services' && (
          <div className="space-y-6">
            <div><h2 className="text-lg font-semibold text-zinc-900">Contracted Services</h2><p className="text-sm text-zinc-500 mt-1">Services included in your venue's agreement with ANC</p></div>
            {services.length === 0 ? (
              <div className="bg-white rounded-lg border border-zinc-200 p-12 text-center text-zinc-400 text-sm">No services configured</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {services.map(svc => (
                  <div key={svc.name} className="bg-white rounded-lg border border-zinc-200 p-6">
                    <div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-emerald-500"></div><h3 className="text-sm font-semibold text-zinc-900">{svc.name}</h3></div>
                    {svc.description && <p className="text-xs text-zinc-500 mt-2 ml-5">{svc.description}</p>}
                  </div>
                ))}
              </div>
            )}
            {/* Installed Displays */}
            {screens.length > 0 && (
              <>
                <div className="mt-8"><h2 className="text-lg font-semibold text-zinc-900">Installed Displays</h2><p className="text-sm text-zinc-500 mt-1">LED displays and specifications at your venue</p></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  {screens.map((screen: any, i: number) => (
                    <div key={i} className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
                      <div className="h-1 bg-[#0A52EF]"></div>
                      <div className="p-5">
                        <h3 className="text-sm font-semibold text-zinc-900 mb-3">{screen.display_name}</h3>
                        {screen.location_zone && <p className="text-xs text-zinc-500 mb-3 capitalize">{screen.location_zone}</p>}
                        <div className="grid grid-cols-2 gap-3 text-xs">
                          {screen.manufacturer && <div><p className="text-zinc-500 font-medium">Manufacturer</p><p className="text-zinc-900 mt-0.5">{screen.manufacturer}</p></div>}
                          {screen.model && <div><p className="text-zinc-500 font-medium">Model</p><p className="text-zinc-900 mt-0.5">{screen.model}</p></div>}
                          {screen.pixel_pitch && <div><p className="text-zinc-500 font-medium">Pixel Pitch</p><p className="text-zinc-900 mt-0.5">{screen.pixel_pitch}mm</p></div>}
                          {(screen.width_ft || screen.height_ft) && <div><p className="text-zinc-500 font-medium">Dimensions</p><p className="text-zinc-900 mt-0.5">{screen.width_ft}' x {screen.height_ft}'</p></div>}
                          {screen.brightness_nits && <div><p className="text-zinc-500 font-medium">Brightness</p><p className="text-zinc-900 mt-0.5">{Number(screen.brightness_nits).toLocaleString()} nits</p></div>}
                          {screen.environment && <div><p className="text-zinc-500 font-medium">Environment</p><p className="text-zinc-900 mt-0.5 capitalize">{screen.environment}</p></div>}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="bg-white rounded-lg border border-zinc-200 p-6 mt-8">
              <h3 className="text-sm font-semibold text-zinc-900 mb-4">Venue Information</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><p className="text-xs font-medium text-zinc-500">Venue</p><p className="text-zinc-900 mt-1">{venue.name}</p></div>
                <div><p className="text-xs font-medium text-zinc-500">Market</p><p className="text-zinc-900 mt-1">{venue.market}</p></div>
                {venue.address && <div><p className="text-xs font-medium text-zinc-500">Address</p><p className="text-zinc-900 mt-1">{venue.address}</p></div>}
                {venue.primary_contact_name && <div><p className="text-xs font-medium text-zinc-500">Contact</p><p className="text-zinc-900 mt-1">{venue.primary_contact_name}</p></div>}
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-200 mt-16">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3"><img src="/ANC_Logo_2023_blue.png" alt="ANC" className="h-5 opacity-40" /><span className="text-xs text-zinc-400">ANC Sports — Operations & Venue Services</span></div>
          <span className="text-xs text-zinc-400">Need help? Contact support@anc.com</span>
        </div>
      </footer>

      {/* ANC AI Assistant Chat Widget */}
      <script
        data-embed-id="8c3aad8f-edf0-43e5-b249-6b9cce51287e"
        data-base-api-url="https://ancservices-anything-llm.izcgmb.easypanel.host/api/embed"
        data-brand-image-url="/ANC_Logo_2023_white.png"
        data-greeting="Hi! I'm your ANC assistant. Ask me anything about our services, technology, or your venue."
        data-button-color="#1B2A4A"
        data-user-bg-color="#3B82F6"
        data-assistant-bg-color="#1B2A4A"
        data-assistant-name="ANC Assistant"
        data-assistant-icon="/ANC_Logo_2023_white.png"
        data-window-title="ANC Support"
        data-no-sponsor="true"
        src="https://ancservices-anything-llm.izcgmb.easypanel.host/embed/anythingllm-chat-widget.min.js"
      />

      {/* Hide AnythingLLM branding from widget */}
      <style dangerouslySetInnerHTML={{ __html: `
        [data-anythingllm-footer], [class*="anythingllm"], a[href*="anythingllm.com"],
        #anything-llm-chat-widget a[href*="anythingllm"],
        #anything-llm-chat-widget [class*="powered"] {
          display: none !important;
        }
      `}} />
    </div>
  )
}
