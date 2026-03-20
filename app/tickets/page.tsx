'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'

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

const categoryColors: Record<string, string> = {
  hardware: 'bg-red-50 text-red-600',
  software: 'bg-violet-50 text-violet-600',
  content: 'bg-amber-50 text-amber-600',
  operational: 'bg-blue-50 text-blue-600',
  general: 'bg-zinc-100 text-zinc-600',
}

const priorityColors: Record<string, string> = {
  low: 'bg-zinc-100 text-zinc-600',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-orange-50 text-orange-700',
  critical: 'bg-red-50 text-red-700',
}

const statusColors: Record<string, string> = {
  open: 'bg-red-50 text-red-700',
  in_progress: 'bg-amber-50 text-amber-700',
  resolved: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-zinc-100 text-zinc-500',
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [selectedVenueId, setSelectedVenueId] = useState('')
  const [formData, setFormData] = useState({
    venue_id: '',
    event_id: '',
    title: '',
    description: '',
    category: 'general',
    priority: 'medium',
    assigned_to: ''
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
        body: JSON.stringify({
          ...formData,
          event_id: formData.event_id || null,
        })
      })
      if (res.ok) {
        const fresh = await fetch('/api/tickets').then(r => r.json())
        setTickets(fresh.tickets || [])
        setFormData({
          venue_id: '',
          event_id: '',
          title: '',
          description: '',
          category: 'general',
          priority: 'medium',
          assigned_to: ''
        })
        setShowForm(false)
      }
    } catch (err) { console.error(err) }
    finally { setSubmitting(false) }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-screen">
          <p className="text-zinc-500">Loading...</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-900">Tickets</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-[#0A52EF] text-white px-4 py-2 rounded text-sm font-medium hover:bg-[#0840C0] transition-colors"
          >
            {showForm ? 'Cancel' : 'Create Ticket'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">New Ticket</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Venue *</label>
                  <select
                    value={formData.venue_id}
                    onChange={e => {
                      setFormData({ ...formData, venue_id: e.target.value, event_id: '' })
                      setSelectedVenueId(e.target.value)
                    }}
                    className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none"
                    required
                  >
                    <option value="">Select venue...</option>
                    {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Category *</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value })}
                    className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none"
                    required
                  >
                    <option value="hardware">Hardware</option>
                    <option value="software">Software</option>
                    <option value="content">Content</option>
                    <option value="operational">Operational</option>
                    <option value="general">General</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Event (optional)</label>
                  <select
                    value={formData.event_id}
                    onChange={e => setFormData({ ...formData, event_id: e.target.value })}
                    className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none"
                    disabled={!selectedVenueId}
                  >
                    <option value="">No event</option>
                    {events.map(e => <option key={e.id} value={e.id}>{e.summary} ({e.event_date})</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={e => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Title *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Brief title"
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Details..."
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Assign To</label>
                <select
                  value={formData.assigned_to}
                  onChange={e => setFormData({ ...formData, assigned_to: e.target.value })}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none"
                >
                  <option value="">Unassigned</option>
                  {staffList.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>

              <div className="flex gap-2 pt-4">
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-[#0A52EF] text-white px-4 py-2 rounded text-sm font-medium hover:bg-[#0840C0] transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        )}

        {tickets.length === 0 ? (
          <div className="bg-white rounded border border-[#E8E8E8] p-8 text-center">
            <p className="text-zinc-500">No tickets yet</p>
          </div>
        ) : (
          <div className="bg-white rounded border border-[#E8E8E8] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E8E8] bg-zinc-50">
                  <th className="px-4 py-3 text-left font-semibold text-zinc-900">#</th>
                  <th className="px-4 py-3 text-left font-semibold text-zinc-900">Title</th>
                  <th className="px-4 py-3 text-left font-semibold text-zinc-900">Category</th>
                  <th className="px-4 py-3 text-left font-semibold text-zinc-900">Venue</th>
                  <th className="px-4 py-3 text-left font-semibold text-zinc-900">Event</th>
                  <th className="px-4 py-3 text-left font-semibold text-zinc-900">Priority</th>
                  <th className="px-4 py-3 text-left font-semibold text-zinc-900">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-zinc-900">Created By</th>
                  <th className="px-4 py-3 text-left font-semibold text-zinc-900">Created</th>
                  <th className="px-4 py-3 text-left font-semibold text-zinc-900">Assigned To</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => router.push(`/tickets/${ticket.id}`)}
                    className="border-b border-[#E8E8E8] hover:bg-zinc-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-zinc-600 font-mono">#{ticket.ticket_number}</td>
                    <td className="px-4 py-3 font-medium text-zinc-900">{ticket.title}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded ${categoryColors[ticket.category] || 'bg-zinc-100 text-zinc-600'}`}>
                        {ticket.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{ticket.venue_name}</td>
                    <td className="px-4 py-3 text-zinc-600">{ticket.event_name || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded ${priorityColors[ticket.priority]}`}>
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-1 rounded ${statusColors[ticket.status]}`}>
                        {ticket.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{ticket.created_by_name}</td>
                    <td className="px-4 py-3 text-zinc-600">{ticket.created_date}</td>
                    <td className="px-4 py-3 text-zinc-600">{ticket.assigned_to_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
