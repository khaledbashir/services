'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface Ticket {
  id: string
  ticket_number: number
  title: string
  description: string
  status: string
  priority: string
  category: string
  venue_name: string
  event_name?: string
  created_by_name: string
  assigned_to_name: string | null
  created_date: string
}

interface Venue { id: string; name: string }
interface Event { id: string; summary: string; event_date: string }
interface Staff { id: string; full_name: string }

const priorityConfig: Record<string, { dot: string; label: string }> = {
  low: { dot: 'bg-zinc-400', label: 'Low' },
  medium: { dot: 'bg-amber-500', label: 'Medium' },
  high: { dot: 'bg-orange-500', label: 'High' },
  critical: { dot: 'bg-red-500', label: 'Critical' },
}

const statusConfig: Record<string, { label: string; color: string; bg: string; text: string }> = {
  new: { label: 'New', color: 'bg-red-500', bg: 'bg-red-50', text: 'text-red-700' },
  on_hold: { label: 'On Hold', color: 'bg-violet-500', bg: 'bg-violet-50', text: 'text-violet-700' },
  in_progress: { label: 'In Progress', color: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
  escalated: { label: 'Escalated', color: 'bg-orange-500', bg: 'bg-orange-50', text: 'text-orange-700' },
  closed: { label: 'Closed', color: 'bg-zinc-400', bg: 'bg-zinc-100', text: 'text-zinc-600' },
}

const categoryLabels: Record<string, string> = {
  hardware: 'Hardware',
  software: 'Software',
  content: 'Content',
  operational: 'Operational',
  general: 'General',
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'cards' | 'list'>('cards')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [showForm, setShowForm] = useState(false)
  const [selectedVenueId, setSelectedVenueId] = useState('')
  const [venueQuery, setVenueQuery] = useState('')
  const [venueMenuOpen, setVenueMenuOpen] = useState(false)
  const [formData, setFormData] = useState({
    venue_id: '', event_id: '', title: '', description: '',
    category: 'general', priority: 'medium', assigned_to: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    Promise.all([
      fetch('/api/tickets').then(r => r.json()),
      fetch('/api/venues').then(r => r.json()),
      fetch('/api/events?filter=week').then(r => r.json()),
      fetch('/api/staff').then(r => r.json()),
    ]).then(([td, vd, ed, sd]) => {
      setTickets(td.tickets || [])
      setVenues(vd.venues || [])
      setEvents(ed.events || [])
      setStaffList(sd.staff || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!formData.venue_id || !formData.title.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, event_id: formData.event_id || null })
      })
      if (res.ok) {
        const fresh = await fetch('/api/tickets').then(r => r.json())
        setTickets(fresh.tickets || [])
        setFormData({ venue_id: '', event_id: '', title: '', description: '', category: 'general', priority: 'medium', assigned_to: '' })
        setSelectedVenueId('')
        setVenueQuery('')
        setShowForm(false)
      }
    } catch (err) { console.error(err) }
    finally { setSubmitting(false) }
  }

  const filteredTickets = tickets.filter(t => {
    const q = search.toLowerCase()
    const matchesSearch = !q
      || (t.title || '').toLowerCase().includes(q)
      || (t.venue_name || '').toLowerCase().includes(q)
      || (t.assigned_to_name || '').toLowerCase().includes(q)
      || (t.category || '').toLowerCase().includes(q)
      || String(t.ticket_number || '').includes(q)
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' && t.status !== 'closed') || t.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const counts: Record<string, number> = {
    active: tickets.filter(t => t.status !== 'closed').length,
    new: tickets.filter(t => t.status === 'new').length,
    on_hold: tickets.filter(t => t.status === 'on_hold').length,
    in_progress: tickets.filter(t => t.status === 'in_progress').length,
    escalated: tickets.filter(t => t.status === 'escalated').length,
    closed: tickets.filter(t => t.status === 'closed').length,
    all: tickets.length,
  }

  const getInitials = (name: string) => {
    const p = (name || '').split(' ')
    return (p[0]?.[0] + (p[1]?.[0] || '')).toUpperCase()
  }

  const filterTabs = [
    { key: 'active', label: 'Active' },
    { key: 'new', label: 'New' },
    { key: 'on_hold', label: 'On Hold' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'escalated', label: 'Escalated' },
    { key: 'closed', label: 'Closed' },
    { key: 'all', label: 'All' },
  ]

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch {
      return dateStr
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Tickets</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {counts.active} open · {counts.all} total
            </p>
          </div>
          <button onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors">
            {showForm ? 'Cancel' : 'New Ticket'}
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="border border-zinc-200 bg-zinc-50 p-6">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">Create Ticket</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Title *</label>
                <input type="text" value={formData.title} onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Brief description of the issue"
                  className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400 outline-none bg-white" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Venue *</label>
                  <input
                    type="text"
                    value={venueQuery}
                    onChange={e => { setVenueQuery(e.target.value); setVenueMenuOpen(true); if (formData.venue_id) { setFormData(prev => ({ ...prev, venue_id: '', event_id: '' })); setSelectedVenueId('') } }}
                    onFocus={() => setVenueMenuOpen(true)}
                    onBlur={() => setTimeout(() => setVenueMenuOpen(false), 150)}
                    placeholder="Type to search venues..."
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                    required
                  />
                  {venueMenuOpen && (
                    <div className="absolute z-10 left-0 right-0 mt-1 max-h-60 overflow-auto border border-zinc-200 bg-white shadow-lg rounded">
                      {venues
                        .filter(v => v.name.toLowerCase().includes(venueQuery.toLowerCase().trim()))
                        .slice(0, 50)
                        .map(v => (
                          <button
                            type="button"
                            key={v.id}
                            onMouseDown={(e) => { e.preventDefault(); setFormData(prev => ({ ...prev, venue_id: v.id, event_id: '' })); setSelectedVenueId(v.id); setVenueQuery(v.name); setVenueMenuOpen(false) }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 ${formData.venue_id === v.id ? 'bg-[#0A52EF]/10 text-[#0A52EF]' : 'text-zinc-700'}`}
                          >
                            {v.name}
                          </button>
                        ))}
                      {venues.filter(v => v.name.toLowerCase().includes(venueQuery.toLowerCase().trim())).length === 0 && (
                        <div className="px-3 py-2 text-sm text-zinc-400">No venues match "{venueQuery}"</div>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Event (optional)</label>
                  <select value={formData.event_id} onChange={e => setFormData(prev => ({ ...prev, event_id: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white" disabled={!selectedVenueId}>
                    <option value="">No event</option>
                    {events.map(e => <option key={e.id} value={e.id}>{e.summary}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Category</label>
                  <select value={formData.category} onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white">
                    <option value="hardware">Hardware</option>
                    <option value="software">Software</option>
                    <option value="content">Content</option>
                    <option value="operational">Operational</option>
                    <option value="general">General</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Priority</label>
                  <select value={formData.priority} onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Assign To</label>
                  <select value={formData.assigned_to} onChange={e => setFormData(prev => ({ ...prev, assigned_to: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white">
                    <option value="">Unassigned</option>
                    {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Description</label>
                <textarea value={formData.description} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Provide details..."
                  className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none resize-none bg-white" rows={3} />
              </div>
              <button type="submit" disabled={submitting}
                className="px-5 py-2 bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50">
                {submitting ? 'Creating...' : 'Create Ticket'}
              </button>
            </form>
          </div>
        )}

        {/* Filters bar */}
        <div className="flex items-center justify-between gap-4 border-b border-zinc-200">
          <div className="flex items-center gap-0 -mb-px overflow-x-auto">
            {filterTabs.map(tab => {
              const isActive = statusFilter === tab.key
              return (
                <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'border-zinc-900 text-zinc-900'
                      : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
                  }`}>
                  {tab.label}
                  <span className={`ml-1.5 text-xs tabular-nums ${isActive ? 'text-zinc-900' : 'text-zinc-400'}`}>
                    {counts[tab.key]}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2 pb-2">
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input type="text" placeholder="Search..."
                value={search} onChange={e => setSearch(e.target.value)}
                className="w-52 pl-8 pr-3 py-1.5 border border-zinc-200 text-sm focus:outline-none focus:border-zinc-400 text-zinc-900 placeholder:text-zinc-400 bg-white" />
            </div>
            <div className="flex border border-zinc-200">
              <button onClick={() => setView('cards')}
                className={`px-2.5 py-1.5 transition-colors ${view === 'cards' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-500 hover:text-zinc-700'}`}
                title="Card view">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </button>
              <button onClick={() => setView('list')}
                className={`px-2.5 py-1.5 transition-colors border-l border-zinc-200 ${view === 'list' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-500 hover:text-zinc-700'}`}
                title="List view">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm text-zinc-500">{tickets.length === 0 ? 'No tickets yet.' : 'No tickets match your filter.'}</p>
            <p className="text-xs text-zinc-400 mt-1">{tickets.length === 0 ? 'Create your first ticket to get started.' : 'Try adjusting your search or filter.'}</p>
          </div>
        ) : view === 'cards' ? (
          /* CARD VIEW */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-zinc-200 border border-zinc-200">
            {filteredTickets.map(ticket => {
              const pri = priorityConfig[ticket.priority] || priorityConfig.medium
              const st = statusConfig[ticket.status] || statusConfig.new
              return (
                <div key={ticket.id} onClick={() => router.push(`/tickets/${ticket.id}`)}
                  className="bg-white p-4 hover:bg-zinc-50 transition-colors cursor-pointer group">
                  {/* Top: ticket number + priority indicator */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-mono text-zinc-400">
                      #{String(ticket.ticket_number).padStart(5, '0')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${pri.dot}`} title={pri.label}></span>
                      <span className={`inline-flex items-center text-xs font-medium px-1.5 py-0.5 ${st.bg} ${st.text}`}>
                        {st.label}
                      </span>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-medium text-zinc-900 mb-2 line-clamp-2 leading-snug group-hover:text-zinc-700">
                    {ticket.title}
                  </h3>

                  {/* Meta row */}
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-3">
                    <span className="truncate max-w-[140px]">{ticket.venue_name || 'No venue'}</span>
                    <span className="text-zinc-300">·</span>
                    <span>{categoryLabels[ticket.category] || ticket.category}</span>
                  </div>

                  {/* Footer: assignee + date */}
                  <div className="flex items-center justify-between pt-2.5 border-t border-zinc-100">
                    {ticket.assigned_to_name ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 rounded-full bg-zinc-200 flex items-center justify-center text-[10px] font-medium text-zinc-600">
                          {getInitials(ticket.assigned_to_name)}
                        </div>
                        <span className="text-xs text-zinc-600">{ticket.assigned_to_name.split(' ')[0]}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400">Unassigned</span>
                    )}
                    <span className="text-xs text-zinc-400 tabular-nums">{formatDate(ticket.created_date)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* LIST VIEW */
          <div className="border border-zinc-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-zinc-500">#</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-zinc-500">Title</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-zinc-500">Venue</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-zinc-500">Category</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-zinc-500">Priority</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-zinc-500">Status</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-zinc-500">Assigned</th>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-zinc-500">Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map(ticket => {
                  const pri = priorityConfig[ticket.priority] || priorityConfig.medium
                  const st = statusConfig[ticket.status] || statusConfig.new
                  return (
                    <tr key={ticket.id} onClick={() => router.push(`/tickets/${ticket.id}`)}
                      className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 cursor-pointer transition-colors">
                      <td className="py-2.5 px-4 text-zinc-400 font-mono text-xs">{String(ticket.ticket_number).padStart(5, '0')}</td>
                      <td className="py-2.5 px-4 font-medium text-zinc-900 max-w-xs truncate">{ticket.title}</td>
                      <td className="py-2.5 px-4 text-zinc-600 text-xs">{ticket.venue_name || '—'}</td>
                      <td className="py-2.5 px-4 text-zinc-600 text-xs capitalize">{ticket.category}</td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full ${pri.dot}`}></span>
                          <span className="text-xs text-zinc-700">{pri.label}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`text-xs font-medium px-1.5 py-0.5 ${st.bg} ${st.text}`}>{st.label}</span>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-zinc-600">{ticket.assigned_to_name || <span className="text-zinc-400">—</span>}</td>
                      <td className="py-2.5 px-4 text-xs text-zinc-400 whitespace-nowrap tabular-nums">{formatDate(ticket.created_date)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
