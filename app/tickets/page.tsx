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

const categoryConfig: Record<string, { bg: string; text: string; icon: string }> = {
  hardware: { bg: 'bg-red-50', text: 'text-red-600', icon: '🔧' },
  software: { bg: 'bg-violet-50', text: 'text-violet-600', icon: '💻' },
  content: { bg: 'bg-amber-50', text: 'text-amber-600', icon: '📺' },
  operational: { bg: 'bg-blue-50', text: 'text-blue-600', icon: '⚙️' },
  general: { bg: 'bg-zinc-100', text: 'text-zinc-600', icon: '📋' },
}

const priorityConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  low: { bg: 'bg-zinc-50', text: 'text-zinc-600', dot: 'bg-zinc-400', label: 'Low' },
  medium: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: 'Medium' },
  high: { bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500', label: 'High' },
  critical: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', label: 'Critical' },
}

const statusConfig: Record<string, { bg: string; text: string; dot: string; label: string }> = {
  open: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', label: 'Open' },
  in_progress: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', label: 'In Progress' },
  resolved: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', label: 'Resolved' },
  closed: { bg: 'bg-zinc-100', text: 'text-zinc-500', dot: 'bg-zinc-400', label: 'Closed' },
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
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' && (t.status === 'open' || t.status === 'in_progress')) || t.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const openCount = tickets.filter(t => t.status === 'open').length
  const inProgressCount = tickets.filter(t => t.status === 'in_progress').length
  const resolvedCount = tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length

  const CardView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {filteredTickets.map(ticket => {
        const cat = categoryConfig[ticket.category] || categoryConfig.general
        const pri = priorityConfig[ticket.priority] || priorityConfig.medium
        const st = statusConfig[ticket.status] || statusConfig.open
        return (
          <div
            key={ticket.id}
            onClick={() => router.push(`/tickets/${ticket.id}`)}
            className="bg-white rounded border border-[#E8E8E8] shadow-sm hover:shadow-md transition-all cursor-pointer overflow-hidden"
          >
            {/* Priority strip */}
            <div className={`h-1 ${pri.dot}`}></div>
            <div className="p-5">
              {/* Header: ticket number + status */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-zinc-400">#{ticket.ticket_number}</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1.5 ${st.bg} ${st.text}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${st.dot}`}></span>
                  {st.label}
                </span>
              </div>

              {/* Title */}
              <h3 className="text-sm font-semibold text-zinc-900 mb-2 line-clamp-2">{ticket.title}</h3>

              {/* Venue + Category */}
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-zinc-500 truncate">{ticket.venue_name}</span>
                <span className="text-zinc-300">•</span>
                <span className={`text-xs font-medium px-2 py-0.5 rounded ${cat.bg} ${cat.text}`}>
                  {ticket.category}
                </span>
              </div>

              {/* Footer: priority + assigned + date */}
              <div className="flex items-center justify-between pt-3 border-t border-[#E8E8E8]">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${pri.bg} ${pri.text}`}>{pri.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {ticket.assigned_to_name ? (
                    <div className="flex items-center gap-1.5">
                      <div className="w-5 h-5 rounded-full bg-[#0A52EF]/15 flex items-center justify-center text-[9px] font-semibold text-[#0A52EF]">
                        {ticket.assigned_to_name.charAt(0)}
                      </div>
                      <span className="text-xs text-zinc-600 truncate max-w-20">{ticket.assigned_to_name.split(' ')[0]}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-400">Unassigned</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

  const ListView = () => (
    <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E8E8E8] bg-zinc-50">
            <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">#</th>
            <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Title</th>
            <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Venue</th>
            <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Category</th>
            <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Priority</th>
            <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
            <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Assigned</th>
            <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Created</th>
          </tr>
        </thead>
        <tbody>
          {filteredTickets.map(ticket => {
            const cat = categoryConfig[ticket.category] || categoryConfig.general
            const pri = priorityConfig[ticket.priority] || priorityConfig.medium
            const st = statusConfig[ticket.status] || statusConfig.open
            return (
              <tr key={ticket.id} onClick={() => router.push(`/tickets/${ticket.id}`)}
                className="border-b border-[#E8E8E8] hover:bg-zinc-50 cursor-pointer transition-colors">
                <td className="py-3 px-6 text-zinc-400 font-mono text-xs">#{ticket.ticket_number}</td>
                <td className="py-3 px-6 font-medium text-zinc-900 max-w-xs truncate">{ticket.title}</td>
                <td className="py-3 px-6 text-zinc-600 text-xs">{ticket.venue_name}</td>
                <td className="py-3 px-6">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${cat.bg} ${cat.text}`}>{ticket.category}</span>
                </td>
                <td className="py-3 px-6">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${pri.dot}`}></span>
                    <span className="text-xs text-zinc-700">{pri.label}</span>
                  </div>
                </td>
                <td className="py-3 px-6">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.bg} ${st.text}`}>{st.label}</span>
                </td>
                <td className="py-3 px-6 text-zinc-600 text-xs">{ticket.assigned_to_name || <span className="text-zinc-400">—</span>}</td>
                <td className="py-3 px-6 text-zinc-500 text-xs whitespace-nowrap">{ticket.created_date}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-zinc-900">Tickets</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium hover:bg-[#0840C0] transition-colors"
          >
            {showForm ? 'Cancel' : '+ New Ticket'}
          </button>
        </div>

        {/* Stat pills */}
        <div className="flex gap-3">
          <button onClick={() => setStatusFilter('active')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${statusFilter === 'active' ? 'bg-[#0A52EF] text-white' : 'bg-white border border-[#E8E8E8] text-zinc-600 hover:border-zinc-300'}`}>
            Active <span className="ml-1 opacity-75">{openCount + inProgressCount}</span>
          </button>
          <button onClick={() => setStatusFilter('open')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${statusFilter === 'open' ? 'bg-red-500 text-white' : 'bg-white border border-[#E8E8E8] text-zinc-600 hover:border-zinc-300'}`}>
            Open <span className="ml-1 opacity-75">{openCount}</span>
          </button>
          <button onClick={() => setStatusFilter('in_progress')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${statusFilter === 'in_progress' ? 'bg-amber-500 text-white' : 'bg-white border border-[#E8E8E8] text-zinc-600 hover:border-zinc-300'}`}>
            In Progress <span className="ml-1 opacity-75">{inProgressCount}</span>
          </button>
          <button onClick={() => setStatusFilter('resolved')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${statusFilter === 'resolved' ? 'bg-emerald-500 text-white' : 'bg-white border border-[#E8E8E8] text-zinc-600 hover:border-zinc-300'}`}>
            Resolved <span className="ml-1 opacity-75">{resolvedCount}</span>
          </button>
          <button onClick={() => setStatusFilter('all')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${statusFilter === 'all' ? 'bg-zinc-700 text-white' : 'bg-white border border-[#E8E8E8] text-zinc-600 hover:border-zinc-300'}`}>
            All <span className="ml-1 opacity-75">{tickets.length}</span>
          </button>
        </div>

        {/* Search + View toggle */}
        <div className="flex gap-3 items-center">
          <div className="flex-1 relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search tickets, venues, assignees..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
            />
          </div>
          <div className="bg-zinc-100 rounded p-1 flex gap-1">
            <button onClick={() => setView('cards')} className={`px-3 py-2 rounded text-sm font-medium transition-colors ${view === 'cards' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600'}`}>Cards</button>
            <button onClick={() => setView('list')} className={`px-3 py-2 rounded text-sm font-medium transition-colors ${view === 'list' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600'}`}>List</button>
          </div>
        </div>

        {/* Create form */}
        {showForm && (
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">New Ticket</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Title *</label>
                <input type="text" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Brief description of the issue"
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Venue *</label>
                  <select value={formData.venue_id} onChange={e => { setFormData({ ...formData, venue_id: e.target.value, event_id: '' }); setSelectedVenueId(e.target.value) }}
                    className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" required>
                    <option value="">Select venue...</option>
                    {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Event (optional)</label>
                  <select value={formData.event_id} onChange={e => setFormData({ ...formData, event_id: e.target.value })}
                    className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" disabled={!selectedVenueId}>
                    <option value="">No event</option>
                    {events.map(e => <option key={e.id} value={e.id}>{e.summary}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Category</label>
                  <select value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none">
                    <option value="hardware">Hardware</option>
                    <option value="software">Software</option>
                    <option value="content">Content</option>
                    <option value="operational">Operational</option>
                    <option value="general">General</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Priority</label>
                  <select value={formData.priority} onChange={e => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Assign To</label>
                  <select value={formData.assigned_to} onChange={e => setFormData({ ...formData, assigned_to: e.target.value })}
                    className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none">
                    <option value="">Unassigned</option>
                    {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Description</label>
                <textarea value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Provide details..."
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none resize-none" rows={3} />
              </div>
              <button type="submit" disabled={submitting}
                className="px-6 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium hover:bg-[#0840C0] transition-colors disabled:opacity-50">
                {submitting ? 'Creating...' : 'Create Ticket'}
              </button>
            </form>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
          </div>
        ) : filteredTickets.length === 0 ? (
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-12 text-center">
            <p className="text-zinc-500 text-sm">{tickets.length === 0 ? 'No tickets yet' : 'No tickets match your filter'}</p>
          </div>
        ) : view === 'cards' ? (
          <CardView />
        ) : (
          <ListView />
        )}
      </div>
    </DashboardLayout>
  )
}
