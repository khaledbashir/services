'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

interface Venue {
  id: string
  name: string
  address: string
  market: string
  primary_contact_name: string | null
  primary_contact_email: string | null
}

interface Event {
  id: string
  summary: string
  league: string
  event_date: string
  start_time: string
  workflow_status: string
  staff_count?: number
}

interface Ticket {
  id: string
  ticket_number: number
  title: string
  category: string
  priority: string
  status: string
  created_at: string
  resolved_at: string | null
}

interface Service {
  name: string
  description: string | null
  enabled: boolean
}

interface Stats {
  upcomingEvents: number
  pastMonthEvents: number
  completedEvents: number
  openTickets: number
}

const leagueColors: Record<string, string> = {
  NBA: '#f97316', NHL: '#3b82f6', NCAAM: '#7c3aed', NCAAW: '#ec4899',
  MLB: '#dc2626', AHL: '#14b8a6', 'NBA G League': '#f97316', MiLB: '#10b981',
}

const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Scheduled', color: '#64748b', bg: '#f1f5f9' },
  checked_in: { label: 'Staff On Site', color: '#d97706', bg: '#fffbeb' },
  game_ready: { label: 'Game Ready', color: '#059669', bg: '#ecfdf5' },
  post_game_submitted: { label: 'Completed', color: '#2563eb', bg: '#eff6ff' },
}

const priorityColors: Record<string, { color: string; bg: string }> = {
  low: { color: '#64748b', bg: '#f1f5f9' },
  medium: { color: '#d97706', bg: '#fffbeb' },
  high: { color: '#ea580c', bg: '#fff7ed' },
  critical: { color: '#dc2626', bg: '#fef2f2' },
}

const ticketStatusColors: Record<string, { color: string; bg: string }> = {
  open: { color: '#dc2626', bg: '#fef2f2' },
  in_progress: { color: '#d97706', bg: '#fffbeb' },
  resolved: { color: '#059669', bg: '#ecfdf5' },
  closed: { color: '#64748b', bg: '#f1f5f9' },
}

export default function PortalPage() {
  const params = useParams()
  const token = params?.token as string

  const [venue, setVenue] = useState<Venue | null>(null)
  const [upcomingEvents, setUpcomingEvents] = useState<Event[]>([])
  const [pastEvents, setPastEvents] = useState<Event[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'events' | 'tickets' | 'services'>('overview')
  const [showNewTicket, setShowNewTicket] = useState(false)
  const [newTicket, setNewTicket] = useState({ title: '', description: '', category: 'general', priority: 'medium' })
  const [submittingTicket, setSubmittingTicket] = useState(false)

  useEffect(() => {
    if (!token) return
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/portal/${token}`)
        if (!res.ok) {
          setError('This portal link is invalid or has expired.')
          return
        }
        const data = await res.json()
        setVenue(data.venue)
        setUpcomingEvents(data.upcomingEvents || [])
        setPastEvents(data.pastEvents || [])
        setTickets(data.tickets || [])
        setServices(data.services || [])
        setStats(data.stats)
      } catch {
        setError('Unable to load portal. Please try again later.')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [token])

  const submitTicket = async () => {
    if (!newTicket.title.trim()) return
    setSubmittingTicket(true)
    try {
      const res = await fetch(`/api/portal/${token}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTicket),
      })
      if (res.ok) {
        const data = await res.json()
        setTickets([{ ...data.ticket, category: newTicket.category, priority: newTicket.priority, created_at: 'Just now', resolved_at: null }, ...tickets])
        setNewTicket({ title: '', description: '', category: 'general', priority: 'medium' })
        setShowNewTicket(false)
      }
    } catch {}
    setSubmittingTicket(false)
  }

  const formatDate = (d: string) => {
    const date = new Date(d)
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center">
        <div className="text-center">
          <img src="/ANC_Logo_2023_blue.png" alt="ANC" className="h-10 mx-auto mb-4" />
          <p className="text-zinc-400 text-sm">Loading your portal...</p>
        </div>
      </div>
    )
  }

  if (error || !venue) {
    return (
      <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center">
        <div className="text-center max-w-md">
          <img src="/ANC_Logo_2023_blue.png" alt="ANC" className="h-10 mx-auto mb-6" />
          <h1 className="text-xl font-semibold text-zinc-900 mb-2">Portal Unavailable</h1>
          <p className="text-zinc-500 text-sm">{error || 'Venue not found.'}</p>
        </div>
      </div>
    )
  }

  const openTickets = tickets.filter(t => t.status === 'open' || t.status === 'in_progress')
  const closedTickets = tickets.filter(t => t.status === 'resolved' || t.status === 'closed')

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
          {venue.primary_contact_name && (
            <p className="text-xs text-zinc-400">Welcome, {venue.primary_contact_name}</p>
          )}
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-zinc-200">
        <div className="max-w-6xl mx-auto px-6 flex gap-0">
          {(['overview', 'events', 'tickets', 'services'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-[#0A52EF] text-[#0A52EF]'
                  : 'border-transparent text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {tab === 'overview' && 'Overview'}
              {tab === 'events' && `Events`}
              {tab === 'tickets' && `Tickets${openTickets.length > 0 ? ` (${openTickets.length})` : ''}`}
              {tab === 'services' && 'Services'}
            </button>
          ))}
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && stats && (
          <div className="space-y-8">
            {/* Stat Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg border border-zinc-200 p-6">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Upcoming Events</p>
                <p className="text-3xl font-semibold text-zinc-900 mt-2">{stats.upcomingEvents}</p>
                <p className="text-xs text-zinc-400 mt-1">next 30 days</p>
              </div>
              <div className="bg-white rounded-lg border border-zinc-200 p-6">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Events Last Month</p>
                <p className="text-3xl font-semibold text-zinc-900 mt-2">{stats.pastMonthEvents}</p>
                <p className="text-xs text-zinc-400 mt-1">{stats.completedEvents} completed</p>
              </div>
              <div className="bg-white rounded-lg border border-zinc-200 p-6">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Open Tickets</p>
                <p className={`text-3xl font-semibold mt-2 ${stats.openTickets > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{stats.openTickets}</p>
                <p className="text-xs text-zinc-400 mt-1">{stats.openTickets === 0 ? 'all clear' : 'in progress'}</p>
              </div>
              <div className="bg-white rounded-lg border border-zinc-200 p-6">
                <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Active Services</p>
                <p className="text-3xl font-semibold text-zinc-900 mt-2">{services.length}</p>
                <p className="text-xs text-zinc-400 mt-1">contracted</p>
              </div>
            </div>

            {/* Quick Glance */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Next Events */}
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
                      const st = statusLabels[event.workflow_status] || statusLabels.pending
                      return (
                        <div key={event.id} className="px-6 py-3 flex items-center justify-between">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: leagueColors[event.league] || '#94a3b8' }}></div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-zinc-900 truncate">{event.summary}</p>
                              <p className="text-xs text-zinc-500">{formatDate(event.event_date)} • {event.start_time}</p>
                            </div>
                          </div>
                          <span className="text-xs font-medium px-2 py-1 rounded flex-shrink-0 ml-3" style={{ color: st.color, backgroundColor: st.bg }}>
                            {st.label}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Open Tickets */}
              <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-zinc-100 flex justify-between items-center">
                  <h2 className="text-sm font-semibold text-zinc-900">Open Tickets</h2>
                  <button onClick={() => { setActiveTab('tickets'); setShowNewTicket(true) }} className="text-xs text-[#0A52EF] font-medium">+ New Ticket</button>
                </div>
                {openTickets.length === 0 ? (
                  <div className="p-8 text-center">
                    <p className="text-emerald-600 font-medium text-sm">All clear</p>
                    <p className="text-zinc-400 text-xs mt-1">No open tickets</p>
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-100">
                    {openTickets.slice(0, 5).map(ticket => {
                      const pc = priorityColors[ticket.priority] || priorityColors.medium
                      return (
                        <div key={ticket.id} className="px-6 py-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-zinc-900">{ticket.title}</p>
                            <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ color: pc.color, backgroundColor: pc.bg }}>{ticket.priority}</span>
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
        )}

        {/* EVENTS TAB */}
        {activeTab === 'events' && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-zinc-900">Upcoming Events</h2>
            {upcomingEvents.length === 0 ? (
              <div className="bg-white rounded-lg border border-zinc-200 p-12 text-center text-zinc-400">No upcoming events scheduled</div>
            ) : (
              <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50">
                      <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Date</th>
                      <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Event</th>
                      <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">League</th>
                      <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Time</th>
                      <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Staff</th>
                      <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingEvents.map(event => {
                      const st = statusLabels[event.workflow_status] || statusLabels.pending
                      return (
                        <tr key={event.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                          <td className="py-3 px-6 text-zinc-600 text-xs whitespace-nowrap">{formatDate(event.event_date)}</td>
                          <td className="py-3 px-6 font-medium text-zinc-900">{event.summary}</td>
                          <td className="py-3 px-6">
                            <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ backgroundColor: (leagueColors[event.league] || '#94a3b8') + '15', color: leagueColors[event.league] || '#64748b' }}>{event.league}</span>
                          </td>
                          <td className="py-3 px-6 text-zinc-600 text-xs">{event.start_time}</td>
                          <td className="py-3 px-6">
                            {Number(event.staff_count) > 0 ? (
                              <span className="text-xs text-emerald-600 font-medium">{event.staff_count} assigned</span>
                            ) : (
                              <span className="text-xs text-zinc-400">Pending</span>
                            )}
                          </td>
                          <td className="py-3 px-6">
                            <span className="text-xs font-medium px-2 py-1 rounded" style={{ color: st.color, backgroundColor: st.bg }}>{st.label}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {pastEvents.length > 0 && (
              <>
                <h2 className="text-lg font-semibold text-zinc-900 mt-8">Recent Events</h2>
                <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-200 bg-zinc-50">
                        <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Date</th>
                        <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Event</th>
                        <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">League</th>
                        <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pastEvents.map(event => {
                        const st = statusLabels[event.workflow_status] || statusLabels.pending
                        return (
                          <tr key={event.id} className="border-b border-zinc-100">
                            <td className="py-3 px-6 text-zinc-500 text-xs">{formatDate(event.event_date)}</td>
                            <td className="py-3 px-6 text-zinc-700">{event.summary}</td>
                            <td className="py-3 px-6 text-xs text-zinc-500">{event.league}</td>
                            <td className="py-3 px-6">
                              <span className="text-xs font-medium px-2 py-1 rounded" style={{ color: st.color, backgroundColor: st.bg }}>{st.label}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}

        {/* TICKETS TAB */}
        {activeTab === 'tickets' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold text-zinc-900">Support Tickets</h2>
              <button
                onClick={() => setShowNewTicket(!showNewTicket)}
                className="px-4 py-2 bg-[#0A52EF] text-white rounded-lg text-sm font-medium hover:bg-[#0840C0] transition-colors"
              >
                {showNewTicket ? 'Cancel' : '+ New Ticket'}
              </button>
            </div>

            {showNewTicket && (
              <div className="bg-white rounded-lg border border-zinc-200 p-6 space-y-4">
                <h3 className="text-sm font-semibold text-zinc-900">Submit a Support Request</h3>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Subject *</label>
                  <input type="text" value={newTicket.title} onChange={e => setNewTicket({ ...newTicket, title: e.target.value })}
                    className="w-full px-4 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
                    placeholder="Brief description of the issue" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Details</label>
                  <textarea value={newTicket.description} onChange={e => setNewTicket({ ...newTicket, description: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900 resize-none"
                    placeholder="Provide as much detail as possible..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 mb-1">Category</label>
                    <select value={newTicket.category} onChange={e => setNewTicket({ ...newTicket, category: e.target.value })}
                      className="w-full px-4 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900">
                      <option value="general">General</option>
                      <option value="hardware">Hardware</option>
                      <option value="software">Software</option>
                      <option value="content">Content</option>
                      <option value="operational">Operational</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-600 mb-1">Priority</label>
                    <select value={newTicket.priority} onChange={e => setNewTicket({ ...newTicket, priority: e.target.value })}
                      className="w-full px-4 py-2.5 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>
                <button onClick={submitTicket} disabled={submittingTicket || !newTicket.title.trim()}
                  className="px-6 py-2.5 bg-[#0A52EF] text-white rounded-lg text-sm font-medium hover:bg-[#0840C0] transition-colors disabled:opacity-50">
                  {submittingTicket ? 'Submitting...' : 'Submit Ticket'}
                </button>
              </div>
            )}

            {tickets.length === 0 ? (
              <div className="bg-white rounded-lg border border-zinc-200 p-12 text-center">
                <p className="text-emerald-600 font-medium">No tickets</p>
                <p className="text-zinc-400 text-sm mt-1">Submit a ticket if you need support</p>
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
                      <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map(ticket => {
                      const pc = priorityColors[ticket.priority] || priorityColors.medium
                      const sc = ticketStatusColors[ticket.status] || ticketStatusColors.open
                      return (
                        <tr key={ticket.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                          <td className="py-3 px-6 text-zinc-400 text-xs font-mono">{ticket.ticket_number}</td>
                          <td className="py-3 px-6 font-medium text-zinc-900">{ticket.title}</td>
                          <td className="py-3 px-6 text-zinc-600 text-xs capitalize">{ticket.category}</td>
                          <td className="py-3 px-6">
                            <span className="text-xs font-medium px-2 py-0.5 rounded capitalize" style={{ color: pc.color, backgroundColor: pc.bg }}>{ticket.priority}</span>
                          </td>
                          <td className="py-3 px-6">
                            <span className="text-xs font-medium px-2 py-0.5 rounded capitalize" style={{ color: sc.color, backgroundColor: sc.bg }}>{ticket.status.replace('_', ' ')}</span>
                          </td>
                          <td className="py-3 px-6 text-zinc-500 text-xs">{ticket.created_at}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SERVICES TAB */}
        {activeTab === 'services' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Contracted Services</h2>
              <p className="text-sm text-zinc-500 mt-1">Services included in your venue's agreement with ANC</p>
            </div>

            {services.length === 0 ? (
              <div className="bg-white rounded-lg border border-zinc-200 p-12 text-center text-zinc-400 text-sm">
                No services configured for this venue
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {services.map(svc => (
                  <div key={svc.name} className="bg-white rounded-lg border border-zinc-200 p-6">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      <h3 className="text-sm font-semibold text-zinc-900">{svc.name}</h3>
                    </div>
                    {svc.description && <p className="text-xs text-zinc-500 mt-2 ml-5">{svc.description}</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Venue Info */}
            <div className="bg-white rounded-lg border border-zinc-200 p-6 mt-8">
              <h3 className="text-sm font-semibold text-zinc-900 mb-4">Venue Information</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs font-medium text-zinc-500">Venue</p>
                  <p className="text-zinc-900 mt-1">{venue.name}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500">Market</p>
                  <p className="text-zinc-900 mt-1">{venue.market}</p>
                </div>
                {venue.address && (
                  <div>
                    <p className="text-xs font-medium text-zinc-500">Address</p>
                    <p className="text-zinc-900 mt-1">{venue.address}</p>
                  </div>
                )}
                {venue.primary_contact_name && (
                  <div>
                    <p className="text-xs font-medium text-zinc-500">Primary Contact</p>
                    <p className="text-zinc-900 mt-1">{venue.primary_contact_name}</p>
                    {venue.primary_contact_email && <p className="text-zinc-500 text-xs">{venue.primary_contact_email}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 mt-16">
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/ANC_Logo_2023_blue.png" alt="ANC" className="h-5 opacity-40" />
            <span className="text-xs text-zinc-400">ANC Sports — Operations & Venue Services</span>
          </div>
          <span className="text-xs text-zinc-400">Need help? Contact support@anc.com</span>
        </div>
      </footer>
    </div>
  )
}
