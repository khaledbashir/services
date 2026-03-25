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

const categoryConfig: Record<string, { bg: string; text: string }> = {
  hardware: { bg: 'bg-red-50', text: 'text-red-700' },
  software: { bg: 'bg-violet-50', text: 'text-violet-700' },
  content: { bg: 'bg-amber-50', text: 'text-amber-700' },
  operational: { bg: 'bg-blue-50', text: 'text-blue-700' },
  general: { bg: 'bg-zinc-100', text: 'text-zinc-700' },
}

const priorityConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  low: { bg: 'bg-zinc-100', text: 'text-zinc-700', dot: 'bg-zinc-400', label: 'Low' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-800', dot: 'bg-amber-500', label: 'Medium' },
  high: { bg: 'bg-orange-50', text: 'text-orange-800', dot: 'bg-orange-500', label: 'High' },
  critical: { bg: 'bg-red-50', text: 'text-red-800', dot: 'bg-red-500', label: 'Critical' },
}

const statusConfig: Record<string, { bg: string; text: string; dot: string; label: string; activeBg: string }> = {
  new: { bg: 'bg-red-50', text: 'text-red-800', dot: 'bg-red-500', label: 'New', activeBg: 'bg-red-500' },
  on_hold: { bg: 'bg-violet-50', text: 'text-violet-800', dot: 'bg-violet-500', label: 'On Hold', activeBg: 'bg-violet-500' },
  in_progress: { bg: 'bg-amber-50', text: 'text-amber-800', dot: 'bg-amber-500', label: 'In Progress', activeBg: 'bg-amber-500' },
  escalated: { bg: 'bg-orange-50', text: 'text-orange-800', dot: 'bg-orange-500', label: 'Escalated', activeBg: 'bg-orange-500' },
  closed: { bg: 'bg-zinc-100', text: 'text-zinc-600', dot: 'bg-zinc-400', label: 'Closed', activeBg: 'bg-zinc-600' },
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
        setShowForm(false)
      }
    } catch (err) { console.error(err) }
    finally { setSubmitting(false) }
  }

  const filteredTickets = tickets.filter(t => {
    const q = search.toLowerCase()
    const matchesSearch = !q || t.title.toLowerCase().includes(q) || t.venue_name.toLowerCase().includes(q) || (t.assigned_to_name || '').toLowerCase().includes(q) || t.category.toLowerCase().includes(q)
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

  const filterButtons = [
    { key: 'active', label: 'Active', color: 'bg-[#0A52EF]' },
    { key: 'new', label: 'New', color: 'bg-red-500' },
    { key: 'on_hold', label: 'On Hold', color: 'bg-violet-500' },
    { key: 'in_progress', label: 'In Progress', color: 'bg-amber-500' },
    { key: 'escalated', label: 'Escalated', color: 'bg-orange-500' },
    { key: 'closed', label: 'Closed', color: 'bg-zinc-500' },
    { key: 'all', label: 'All', color: 'bg-zinc-700' },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-zinc-900">Tickets</h1>
          <button onClick={() => setShowForm(!showForm)}
            className="px-5 py-2.5 bg-[#0A52EF] text-white rounded-lg text-sm font-semibold hover:bg-[#0840C0] transition-colors shadow-sm">
            {showForm ? 'Cancel' : '+ New Ticket'}
          </button>
        </div>

        {/* Status filter pills */}
        <div className="flex gap-2 flex-wrap">
          {filterButtons.map(btn => {
            const isActive = statusFilter === btn.key
            return (
              <button key={btn.key} onClick={() => setStatusFilter(btn.key)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${
                  isActive
                    ? `${btn.color} text-white shadow-sm`
                    : 'bg-white border border-zinc-200 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50'
                }`}>
                {btn.label}
                <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${
                  isActive ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-500'
                }`}>
                  {counts[btn.key]}
                </span>
              </button>
            )
          })}
        </div>

        {/* Search + View toggle */}
        <div className="flex gap-3 items-center">
          <div className="flex-1 relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Search tickets, venues, assignees..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] text-zinc-900 placeholder:text-zinc-400" />
          </div>
          <div className="bg-zinc-100 rounded-lg p-1 flex gap-0.5 border border-zinc-200">
            <button onClick={() => setView('cards')}
              className={`px-3.5 py-2 rounded-md text-sm font-semibold transition-all ${view === 'cards' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>
              Cards
            </button>
            <button onClick={() => setView('list')}
              className={`px-3.5 py-2 rounded-md text-sm font-semibold transition-all ${view === 'list' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>
              List
            </button>
          </div>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
            <h3 className="text-sm font-bold text-zinc-900 mb-4">New Ticket</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Title *</label>
                <input type="text" value={formData.title} onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Brief description of the issue"
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Venue *</label>
                  <select value={formData.venue_id} onChange={e => { setFormData(prev => ({ ...prev, venue_id: e.target.value, event_id: '' })); setSelectedVenueId(e.target.value) }}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" required>
                    <option value="">Select venue...</option>
                    {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Event (optional)</label>
                  <select value={formData.event_id} onChange={e => setFormData(prev => ({ ...prev, event_id: e.target.value }))}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" disabled={!selectedVenueId}>
                    <option value="">No event</option>
                    {events.map(e => <option key={e.id} value={e.id}>{e.summary}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Category</label>
                  <select value={formData.category} onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none">
                    <option value="hardware">Hardware</option>
                    <option value="software">Software</option>
                    <option value="content">Content</option>
                    <option value="operational">Operational</option>
                    <option value="general">General</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Priority</label>
                  <select value={formData.priority} onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Assign To</label>
                  <select value={formData.assigned_to} onChange={e => setFormData(prev => ({ ...prev, assigned_to: e.target.value }))}
                    className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none">
                    <option value="">Unassigned</option>
                    {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Description</label>
                <textarea value={formData.description} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Provide details..."
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none resize-none" rows={3} />
              </div>
              <button type="submit" disabled={submitting}
                className="px-6 py-2.5 bg-[#0A52EF] text-white rounded-lg text-sm font-semibold hover:bg-[#0840C0] transition-colors disabled:opacity-50 shadow-sm">
                {submitting ? 'Creating...' : 'Create Ticket'}
              </button>
            </form>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="bg-white rounded-xl border border-zinc-200 p-16 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto text-zinc-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm font-medium text-zinc-500">{tickets.length === 0 ? 'No tickets yet' : 'No tickets match your filter'}</p>
            <p className="text-xs text-zinc-400 mt-1">{tickets.length === 0 ? 'Click "+ New Ticket" to create your first one.' : 'Try adjusting your search or filter.'}</p>
          </div>
        ) : view === 'cards' ? (
          /* CARD VIEW */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredTickets.map(ticket => {
              const cat = categoryConfig[ticket.category] || categoryConfig.general
              const pri = priorityConfig[ticket.priority] || priorityConfig.medium
              const st = statusConfig[ticket.status] || statusConfig.new
              const caseNum = String(ticket.ticket_number).padStart(8, '0')
              return (
                <div key={ticket.id} onClick={() => router.push(`/tickets/${ticket.id}`)}
                  className="bg-white rounded-lg border border-zinc-200 hover:border-[#0A52EF]/40 hover:shadow-md transition-all cursor-pointer group">
                  <div className="p-4">
                    {/* Row 1: Status + Priority + Ticket # */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1 ${st.bg} ${st.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`}></span>
                        {st.label}
                      </span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${pri.bg} ${pri.text}`}>{pri.label}</span>
                      <span className="text-[10px] font-mono text-zinc-400 ml-auto">{caseNum}</span>
                    </div>

                    {/* Row 2: Title */}
                    <h3 className="text-[13px] font-bold text-zinc-900 mb-1.5 line-clamp-1 group-hover:text-[#0A52EF] transition-colors">{ticket.title}</h3>

                    {/* Row 3: Venue + Category */}
                    <div className="flex items-center gap-1.5 mb-3">
                      <span className="text-[11px] font-medium text-zinc-500 truncate">{ticket.venue_name}</span>
                      <span className="text-zinc-300">&middot;</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize ${cat.bg} ${cat.text}`}>{ticket.category}</span>
                    </div>

                    {/* Row 4: Assignee + Date */}
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                      {ticket.assigned_to_name ? (
                        <div className="flex items-center gap-1.5">
                          <div className="w-5 h-5 rounded-full bg-[#0A52EF] flex items-center justify-center text-[9px] font-bold text-white">
                            {getInitials(ticket.assigned_to_name)}
                          </div>
                          <span className="text-[11px] font-medium text-zinc-700">{ticket.assigned_to_name.split(' ')[0]}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-zinc-400">Unassigned</span>
                      )}
                      <span className="text-[10px] text-zinc-400">{ticket.created_date}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* LIST VIEW */
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50">
                  <th className="text-left py-3 px-5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">#</th>
                  <th className="text-left py-3 px-5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Title</th>
                  <th className="text-left py-3 px-5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Venue</th>
                  <th className="text-left py-3 px-5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Category</th>
                  <th className="text-left py-3 px-5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Priority</th>
                  <th className="text-left py-3 px-5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Status</th>
                  <th className="text-left py-3 px-5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Assigned</th>
                  <th className="text-left py-3 px-5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Created</th>
                </tr>
              </thead>
              <tbody>
                {filteredTickets.map(ticket => {
                  const cat = categoryConfig[ticket.category] || categoryConfig.general
                  const pri = priorityConfig[ticket.priority] || priorityConfig.medium
                  const st = statusConfig[ticket.status] || statusConfig.new
                  return (
                    <tr key={ticket.id} onClick={() => router.push(`/tickets/${ticket.id}`)}
                      className="border-b border-zinc-100 hover:bg-blue-50/40 cursor-pointer transition-colors group">
                      <td className="py-3.5 px-5 text-zinc-500 font-mono text-xs font-semibold">{String(ticket.ticket_number).padStart(8, '0')}</td>
                      <td className="py-3.5 px-5 font-semibold text-zinc-900 max-w-xs truncate group-hover:text-[#0A52EF] transition-colors">{ticket.title}</td>
                      <td className="py-3.5 px-5 text-zinc-600 text-xs font-medium">{ticket.venue_name}</td>
                      <td className="py-3.5 px-5">
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md capitalize ${cat.bg} ${cat.text}`}>{ticket.category}</span>
                      </td>
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${pri.dot}`}></span>
                          <span className="text-xs font-medium text-zinc-700">{pri.label}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-5">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-md ${st.bg} ${st.text}`}>{st.label}</span>
                      </td>
                      <td className="py-3.5 px-5 text-zinc-700 text-xs font-medium">{ticket.assigned_to_name || <span className="text-zinc-400 italic">—</span>}</td>
                      <td className="py-3.5 px-5 text-zinc-500 text-xs whitespace-nowrap">{ticket.created_date}</td>
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
