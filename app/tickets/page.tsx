'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { useDictation, MicChip } from '@/components/dictation'

interface Ticket {
  id: string
  ticket_number: number
  title: string
  description: string
  status: string
  priority: string
  category: string
  venue_id?: string
  venue_name: string
  event_name?: string
  assigned_to?: string | null
  created_by_name: string
  assigned_to_name: string | null
  created_at?: string
  created_date: string
  created_time: string
  source?: string
  contact_phone?: string | null
  contact_name?: string | null
  venue_type?: string | null
}

type SortField = 'ticket_number' | 'title' | 'venue_name' | 'category' | 'priority' | 'status' | 'assigned_to_name' | 'created_at'
type SortDir = 'asc' | 'desc'
type TicketBucket = 'all' | 'sports' | 'wmata' | 'ooh'

// Custom orderings — alphabetical sort doesn't make sense for these.
const priorityRank: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 }
const statusRank: Record<string, number> = { closed: 0, on_hold: 1, in_progress: 2, escalated: 3, new: 4 }

interface Venue { id: string; name: string; aliases?: string[] }
interface Event { id: string; summary: string; event_date: string; venue_id: string }
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
  voicemail: 'Voicemail',
}

const ticketBucketTabs: Array<{ key: TicketBucket; label: string }> = [
  { key: 'all', label: 'All Work' },
  { key: 'sports', label: 'Sports' },
  { key: 'wmata', label: 'WMATA' },
  { key: 'ooh', label: 'Out of Home' },
]

function ticketBucket(ticket: Ticket): Exclude<TicketBucket, 'all'> | 'other' {
  const haystack = `${ticket.venue_name || ''} ${ticket.title || ''} ${ticket.description || ''}`.toLowerCase()
  if (haystack.includes('wmata') || haystack.includes('washington metropolitan')) return 'wmata'
  if ((ticket.venue_type || '').toLowerCase() === 'ooh') return 'ooh'
  if ((ticket.venue_type || 'sports').toLowerCase() === 'sports') return 'sports'
  return 'other'
}

function SortHeader({
  field, sortField, sortDir, onClick, children,
}: {
  field: SortField
  sortField: SortField
  sortDir: SortDir
  onClick: (f: SortField) => void
  children: React.ReactNode
}) {
  const active = sortField === field
  return (
    <th className="text-left py-2.5 px-4 text-xs font-medium text-zinc-500">
      <button
        type="button"
        onClick={() => onClick(field)}
        className={`group inline-flex items-center gap-1 hover:text-zinc-900 transition-colors ${active ? 'text-zinc-900' : ''}`}
      >
        <span>{children}</span>
        <span className={`text-[9px] leading-none ${active ? 'text-zinc-700' : 'text-zinc-300 group-hover:text-zinc-500'}`}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  )
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [events, setEvents] = useState<Event[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'cards' | 'list'>('list')
  const [viewHydrated, setViewHydrated] = useState(false)
  const [sortField, setSortField] = useState<SortField>('created_at')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set())
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    try { setIsAdmin(localStorage.getItem('userRole') === 'admin') } catch {}
  }, [])
  const [bulkBusy, setBulkBusy] = useState(false)
  // URL drill-down params (assigned_to, venue_id, status, from, to) hydrate
  // on mount from window.location so the report → tickets-list jump works.
  // Using window instead of useSearchParams() to avoid the Suspense-boundary
  // requirement that breaks the Next.js build for this page.
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [bucketFilter, setBucketFilter] = useState<TicketBucket>('all')
  const [assignedToFilter, setAssignedToFilter] = useState<string>('')
  const [venueFilter, setVenueFilter] = useState<string>('')
  const [fromFilter, setFromFilter] = useState<string>('')
  const [toFilter, setToFilter] = useState<string>('')
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search)
      if (sp.get('assigned_to')) setAssignedToFilter(sp.get('assigned_to')!)
      if (sp.get('venue_id')) setVenueFilter(sp.get('venue_id')!)
      if (sp.get('status')) setStatusFilter(sp.get('status')!)
      if (sp.get('from')) setFromFilter(sp.get('from')!)
      if (sp.get('to')) setToFilter(sp.get('to')!)
    } catch {}
  }, [])
  const [showForm, setShowForm] = useState(false)
  const [selectedVenueId, setSelectedVenueId] = useState('')
  const [venueQuery, setVenueQuery] = useState('')
  const [venueMenuOpen, setVenueMenuOpen] = useState(false)
  const [formData, setFormData] = useState({
    venue_id: '', event_id: '', title: '', description: '',
    category: 'general', priority: 'medium', assigned_to: '', status: 'new'
  })
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()
  const dictation = useDictation()
  const appendTitle = (t: string) => setFormData(prev => ({ ...prev, title: (prev.title ? prev.title + ' ' : '') + t }))
  const appendDescription = (t: string) => setFormData(prev => ({ ...prev, description: (prev.description ? prev.description + ' ' : '') + t }))

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

    // Load saved view preference from DB (overrides default 'list' if user picked otherwise).
    fetch('/api/preferences?key=tickets_view')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.value === 'cards' || d?.value === 'list') setView(d.value)
      })
      .finally(() => setViewHydrated(true))

    // Chris D's 2026-04-29 ask: sortable column headers (e.g. click "Assigned"
    // to cluster all of Steve's tickets). Persisted per-user so a sort survives
    // reload — same pattern as the view toggle.
    fetch('/api/preferences?key=tickets_sort')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (typeof d?.value === 'string') {
          const [f, dir] = d.value.split(':')
          const validFields: SortField[] = ['ticket_number', 'title', 'venue_name', 'category', 'priority', 'status', 'assigned_to_name', 'created_at']
          if (validFields.includes(f as SortField) && (dir === 'asc' || dir === 'desc')) {
            setSortField(f as SortField)
            setSortDir(dir)
          }
        }
      })
      .catch(() => {})
  }, [])

  // Chris D's 2026-04-23 ask: auto-refresh the tickets page so voicemails /
  // new tickets surface without a manual reload. Poll every 30s while the
  // tab is visible; pause when hidden (don't nag the server when nobody's
  // looking). Mid-action states (loading, bulk busy) are skipped so the
  // refetch doesn't stomp on a user's in-flight work.
  useEffect(() => {
    const REFRESH_MS = 30_000
    let timer: ReturnType<typeof setInterval> | null = null

    const poll = async () => {
      if (document.hidden) return
      if (loading || bulkBusy) return
      try {
        const res = await fetch('/api/tickets', { cache: 'no-store' })
        if (!res.ok) return
        const d = await res.json()
        setTickets(d.tickets || [])
      } catch {
        // Silent — don't spam the user with transient fetch errors.
      }
    }

    const start = () => {
      if (timer) return
      timer = setInterval(poll, REFRESH_MS)
    }
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null }
    }
    const onVis = () => { document.hidden ? stop() : (poll(), start()) }

    start()
    document.addEventListener('visibilitychange', onVis)
    return () => { stop(); document.removeEventListener('visibilitychange', onVis) }
  }, [loading, bulkBusy])

  // Persist view choice once the user has toggled (not on initial hydration).
  const setViewPersisted = (v: 'cards' | 'list') => {
    setView(v)
    fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'tickets_view', value: v }),
    }).catch(() => {})
  }

  const toggleSort = (field: SortField) => {
    let nextDir: SortDir
    if (sortField === field) {
      nextDir = sortDir === 'asc' ? 'desc' : 'asc'
    } else {
      // Numbers and dates feel natural newest-first; text columns ascending.
      nextDir = (field === 'ticket_number' || field === 'created_at') ? 'desc' : 'asc'
    }
    setSortField(field)
    setSortDir(nextDir)
    fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'tickets_sort', value: `${field}:${nextDir}` }),
    }).catch(() => {})
  }

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const bulkClose = async () => {
    if (bulkBusy || selectedIds.size === 0) return
    if (!confirm(`Close ${selectedIds.size} ticket${selectedIds.size === 1 ? '' : 's'}?`)) return
    setBulkBusy(true)
    try {
      await Promise.all(Array.from(selectedIds).map(id =>
        fetch(`/api/tickets/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'closed' }),
        })
      ))
      const fresh = await fetch('/api/tickets').then(r => r.json())
      setTickets(fresh.tickets || [])
      clearSelection()
    } finally {
      setBulkBusy(false)
    }
  }

  const bulkDelete = async () => {
    if (bulkBusy || selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} ticket${selectedIds.size === 1 ? '' : 's'}? This can't be undone — spam only.`)) return
    setBulkBusy(true)
    try {
      const failures: string[] = []
      await Promise.all(Array.from(selectedIds).map(async (id) => {
        const res = await fetch(`/api/tickets/${id}`, { method: 'DELETE' })
        if (!res.ok) failures.push(id)
      }))
      const fresh = await fetch('/api/tickets').then(r => r.json())
      setTickets(fresh.tickets || [])
      clearSelection()
      if (failures.length > 0) alert(`${failures.length} ticket(s) could not be deleted.`)
    } finally {
      setBulkBusy(false)
    }
  }

  const bulkMerge = async () => {
    if (bulkBusy || selectedIds.size < 2) return
    const ids = Array.from(selectedIds)
    const chosen = tickets.filter(t => ids.includes(t.id))
    const options = chosen.map((t, i) => `${i + 1}. T-${String(t.ticket_number).padStart(5,'0')} — ${t.title}`).join('\n')
    const raw = prompt(`Which ticket should remain as the primary?\nEverything else will be merged into it.\n\n${options}\n\nEnter the number (1-${chosen.length}):`)
    if (!raw) return
    const idx = parseInt(raw, 10) - 1
    if (isNaN(idx) || idx < 0 || idx >= chosen.length) { alert('Invalid choice.'); return }
    const targetId = chosen[idx].id
    const sourceIds = ids.filter(id => id !== targetId)
    setBulkBusy(true)
    try {
      for (const sid of sourceIds) {
        await fetch(`/api/tickets/${sid}/merge`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ target_ticket_id: targetId }),
        })
      }
      clearSelection()
      router.push(`/tickets/${targetId}`)
    } finally {
      setBulkBusy(false)
    }
  }

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
        setFormData({ venue_id: '', event_id: '', title: '', description: '', category: 'general', priority: 'medium', assigned_to: '', status: 'new' })
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
      || (t.description || '').toLowerCase().includes(q)
      || (t.venue_name || '').toLowerCase().includes(q)
      || (t.assigned_to_name || '').toLowerCase().includes(q)
      || (t.category || '').toLowerCase().includes(q)
      || String(t.ticket_number || '').includes(q)
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' && t.status !== 'closed') || t.status === statusFilter
    // URL-param drill-down filters — used by /reports/tickets-by-tech and
    // /reports/tickets-by-venue drill-down links. Each is no-op when empty.
    const matchesAssignee = !assignedToFilter || (t as any).assigned_to === assignedToFilter
    const matchesVenue = !venueFilter || (t as any).venue_id === venueFilter
    const created = (t as any).created_at ? String((t as any).created_at).slice(0, 10) : ''
    const matchesFrom = !fromFilter || created >= fromFilter
    const matchesTo = !toFilter || created <= toFilter
    const bucket = ticketBucket(t)
    const matchesBucket = bucketFilter === 'all' || bucket === bucketFilter
    return matchesSearch && matchesStatus && matchesBucket && matchesAssignee && matchesVenue && matchesFrom && matchesTo
  })

  const sortedTickets = [...filteredTickets].sort((a, b) => {
    const dirMul = sortDir === 'asc' ? 1 : -1
    let av: string | number
    let bv: string | number
    switch (sortField) {
      case 'ticket_number':
        av = a.ticket_number; bv = b.ticket_number; break
      case 'title':
        av = (a.title || '').toLowerCase(); bv = (b.title || '').toLowerCase(); break
      case 'venue_name':
        av = (a.venue_name || '').toLowerCase(); bv = (b.venue_name || '').toLowerCase(); break
      case 'category':
        av = (a.category || '').toLowerCase(); bv = (b.category || '').toLowerCase(); break
      case 'priority':
        av = priorityRank[a.priority] ?? -1; bv = priorityRank[b.priority] ?? -1; break
      case 'status':
        av = statusRank[a.status] ?? -1; bv = statusRank[b.status] ?? -1; break
      case 'assigned_to_name':
        // Unassigned always sinks to the bottom regardless of direction.
        av = a.assigned_to_name ? a.assigned_to_name.toLowerCase() : '￿'
        bv = b.assigned_to_name ? b.assigned_to_name.toLowerCase() : '￿'
        break
      case 'created_at':
      default:
        av = a.created_at || `${a.created_date} ${a.created_time}`
        bv = b.created_at || `${b.created_date} ${b.created_time}`
        break
    }
    if (av < bv) return -1 * dirMul
    if (av > bv) return 1 * dirMul
    return 0
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

  const statusScopedTickets = tickets.filter(t => {
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' && t.status !== 'closed') || t.status === statusFilter
    const matchesAssignee = !assignedToFilter || (t as any).assigned_to === assignedToFilter
    const matchesVenue = !venueFilter || (t as any).venue_id === venueFilter
    const created = (t as any).created_at ? String((t as any).created_at).slice(0, 10) : ''
    const matchesFrom = !fromFilter || created >= fromFilter
    const matchesTo = !toFilter || created <= toFilter
    return matchesStatus && matchesAssignee && matchesVenue && matchesFrom && matchesTo
  })

  const bucketCounts: Record<TicketBucket, number> = {
    all: statusScopedTickets.length,
    sports: statusScopedTickets.filter(t => ticketBucket(t) === 'sports').length,
    wmata: statusScopedTickets.filter(t => ticketBucket(t) === 'wmata').length,
    ooh: statusScopedTickets.filter(t => ticketBucket(t) === 'ooh').length,
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
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-zinc-600">Title *</label>
                  <MicChip id="ticket-title" dictation={dictation} append={appendTitle} />
                </div>
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
                  {venueMenuOpen && (() => {
                    // Joe 2026-05-04: search both venue name and team aliases.
                    // ("Philadelphia Flyers" → Xfinity Mobile Arena).
                    const q = venueQuery.toLowerCase().trim()
                    const matchedAlias = (v: Venue) =>
                      q ? (v.aliases || []).find(a => a.toLowerCase().includes(q)) : null
                    const matched = venues.filter(v => {
                      const nameHit = v.name.toLowerCase().includes(q)
                      return nameHit || (q ? Boolean(matchedAlias(v)) : true)
                    }).slice(0, 50)
                    return (
                      <div className="absolute z-10 left-0 right-0 mt-1 max-h-60 overflow-auto border border-zinc-200 bg-white shadow-lg rounded">
                        {matched.map(v => {
                          const alias = q && !v.name.toLowerCase().includes(q) ? matchedAlias(v) : null
                          return (
                            <button
                              type="button"
                              key={v.id}
                              onMouseDown={(e) => { e.preventDefault(); setFormData(prev => ({ ...prev, venue_id: v.id, event_id: '' })); setSelectedVenueId(v.id); setVenueQuery(v.name); setVenueMenuOpen(false) }}
                              className={`w-full text-left px-3 py-2 text-sm hover:bg-zinc-50 ${formData.venue_id === v.id ? 'bg-[#0A52EF]/10 text-[#0A52EF]' : 'text-zinc-700'}`}
                            >
                              {v.name}
                              {alias && <span className="ml-2 text-[11px] text-zinc-400">match: &ldquo;{alias}&rdquo;</span>}
                            </button>
                          )
                        })}
                        {matched.length === 0 && (
                          <div className="px-3 py-2 text-sm text-zinc-400">No venues match &ldquo;{venueQuery}&rdquo;</div>
                        )}
                      </div>
                    )
                  })()}
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Event (optional)</label>
                  <select value={formData.event_id} onChange={e => setFormData(prev => ({ ...prev, event_id: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white" disabled={!selectedVenueId}>
                    <option value="">No event</option>
                    {events
                      .filter(e => !selectedVenueId || e.venue_id === selectedVenueId)
                      .map(e => <option key={e.id} value={e.id}>{e.summary}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Status</label>
                  <select value={formData.status} onChange={e => setFormData(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white">
                    <option value="new">New</option>
                    <option value="on_hold">On Hold</option>
                    <option value="in_progress">In Progress</option>
                    <option value="escalated">Escalated</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>
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
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-zinc-600">Description</label>
                  <MicChip id="ticket-description" dictation={dictation} append={appendDescription} />
                </div>
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

        {/* URL-param drill-down banner — shows when arriving here from a
            report like "click a tech's name to see the tickets they closed." */}
        {(assignedToFilter || venueFilter || fromFilter || toFilter) && (
          <div className="rounded-lg bg-blue-50 ring-1 ring-blue-200 px-4 py-2.5 flex items-center gap-3 text-sm">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-700">Filtered view</span>
            <span className="text-blue-900">
              {assignedToFilter && tickets.find(t => (t as any).assigned_to === assignedToFilter)?.assigned_to_name
                ? <>Assigned to <b>{tickets.find(t => (t as any).assigned_to === assignedToFilter)?.assigned_to_name}</b>{' · '}</>
                : null}
              {venueFilter && tickets.find(t => (t as any).venue_id === venueFilter)?.venue_name
                ? <>Venue <b>{tickets.find(t => (t as any).venue_id === venueFilter)?.venue_name}</b>{' · '}</>
                : null}
              {fromFilter && <>From <b>{fromFilter}</b>{' · '}</>}
              {toFilter && <>To <b>{toFilter}</b>{' · '}</>}
              Showing {sortedTickets.length} of {tickets.length}
            </span>
            <a href="/tickets" className="ml-auto text-xs text-blue-700 hover:underline">Clear filters</a>
          </div>
        )}

        {/* Filters bar */}
        <div className="space-y-3 border-b border-zinc-200 pb-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-0 -mb-px overflow-x-auto">
              {filterTabs.map(tab => {
                const isActive = statusFilter === tab.key
                return (
                  <button key={tab.key} onClick={() => { setStatusFilter(tab.key); clearSelection() }}
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
            <div className="flex items-center gap-2">
              <div className="relative">
                <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" placeholder="Search..."
                  value={search} onChange={e => setSearch(e.target.value)}
                  className="w-52 pl-8 pr-3 py-1.5 border border-zinc-200 text-sm focus:outline-none focus:border-zinc-400 text-zinc-900 placeholder:text-zinc-400 bg-white" />
              </div>
              <div className="flex border border-zinc-200">
                <button onClick={() => setViewPersisted('cards')}
                  className={`px-2.5 py-1.5 transition-colors ${view === 'cards' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-500 hover:text-zinc-700'}`}
                  title="Card view">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button onClick={() => setViewPersisted('list')}
                  className={`px-2.5 py-1.5 transition-colors border-l border-zinc-200 ${view === 'list' ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-500 hover:text-zinc-700'}`}
                  title="List view">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {ticketBucketTabs.map(tab => {
                const isActive = bucketFilter === tab.key
                return (
                  <button
                    key={tab.key}
                    onClick={() => { setBucketFilter(tab.key); clearSelection() }}
                    className={`px-3 py-1.5 text-xs font-semibold whitespace-nowrap border transition-colors ${
                      isActive
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-200 bg-white text-zinc-500 hover:text-zinc-800 hover:border-zinc-300'
                    }`}
                  >
                    {tab.label}
                    <span className={`ml-1.5 tabular-nums ${isActive ? 'text-zinc-200' : 'text-zinc-400'}`}>
                      {bucketCounts[tab.key]}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
          </div>
        ) : sortedTickets.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-sm text-zinc-500">{tickets.length === 0 ? 'No tickets yet.' : 'No tickets match your filter.'}</p>
            <p className="text-xs text-zinc-400 mt-1">{tickets.length === 0 ? 'Create your first ticket to get started.' : 'Try adjusting your search or filter.'}</p>
          </div>
        ) : view === 'cards' ? (
          /* CARD VIEW */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-zinc-200 border border-zinc-200">
            {sortedTickets.map(ticket => {
              const pri = priorityConfig[ticket.priority] || priorityConfig.medium
              const st = statusConfig[ticket.status] || statusConfig.new
              return (
                <div key={ticket.id} onClick={() => window.open(`/tickets/${ticket.id}`, '_blank', 'noopener,noreferrer')}
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
                  <h3 className="text-sm font-medium text-zinc-900 mb-1 leading-snug group-hover:text-zinc-700">
                    {ticket.title}
                  </h3>

                  {/* Full note inline — Tech ask 2026-05-02: read without clicking through.
                      Chris 2026-05-27: long email bodies were pushing rows to ~1500px tall.
                      Default to a 6-line clamp with a per-row Show more / Show less toggle. */}
                  {ticket.description && ticket.description.trim() && (() => {
                    const desc = ticket.description.trim()
                    const expanded = expandedDescriptions.has(ticket.id)
                    const isLong = desc.length > 400 || desc.split('\n').length > 6
                    const toggle = (e: React.MouseEvent) => {
                      e.preventDefault(); e.stopPropagation()
                      setExpandedDescriptions(prev => {
                        const next = new Set(prev)
                        if (next.has(ticket.id)) next.delete(ticket.id)
                        else next.add(ticket.id)
                        return next
                      })
                    }
                    return (
                      <div className="mb-2">
                        <p
                          className={`text-xs text-zinc-600 whitespace-pre-wrap break-words leading-relaxed ${
                            isLong && !expanded ? 'max-h-28 overflow-hidden' : ''
                          }`}
                        >
                          {desc}
                        </p>
                        {isLong && (
                          <button
                            type="button"
                            onClick={toggle}
                            className="mt-1 text-[11px] font-medium text-[#0A52EF] hover:text-[#0840C0]"
                          >
                            {expanded ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </div>
                    )
                  })()}

                  {/* Voicemail phone number */}
                  {ticket.source === 'voicemail' && ticket.contact_phone && (
                    <div className="text-xs text-blue-600 font-mono mb-2 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.21l-2.26 1.13a11 11 0 005.52 5.52l1.13-2.26a1 1 0 011.21-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z" /></svg>
                      {ticket.contact_phone}
                    </div>
                  )}

                  {/* Meta row */}
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 mb-3">
                    <span className="truncate max-w-[140px]">{ticket.venue_name || 'No venue'}</span>
                    <span className="text-zinc-300">·</span>
                    <span>{categoryLabels[ticket.category] || ticket.category}</span>
                    {ticket.source === 'voicemail' && (
                      <>
                        <span className="text-zinc-300">·</span>
                        <span className="text-blue-600 font-medium">Voicemail</span>
                      </>
                    )}
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
                    <span className="text-xs text-zinc-400 tabular-nums">{formatDate(ticket.created_date)} · {ticket.created_time}</span>
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
                  <th className="w-10 text-center py-2.5 px-2 text-xs font-medium text-zinc-500">
                    <input
                      type="checkbox"
                      checked={sortedTickets.length > 0 && sortedTickets.every(t => selectedIds.has(t.id))}
                      onChange={(e) => {
                        e.stopPropagation()
                        if (sortedTickets.every(t => selectedIds.has(t.id))) {
                          clearSelection()
                        } else {
                          setSelectedIds(new Set(sortedTickets.map(t => t.id)))
                        }
                      }}
                      className="cursor-pointer"
                    />
                  </th>
                  <SortHeader field="ticket_number" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>#</SortHeader>
                  <SortHeader field="title" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>Title</SortHeader>
                  <SortHeader field="venue_name" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>Venue</SortHeader>
                  <SortHeader field="category" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>Category</SortHeader>
                  <SortHeader field="priority" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>Priority</SortHeader>
                  <SortHeader field="status" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>Status</SortHeader>
                  <SortHeader field="assigned_to_name" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>Assigned</SortHeader>
                  <th className="text-left py-2.5 px-4 text-xs font-medium text-zinc-500">Time</th>
                  <SortHeader field="created_at" sortField={sortField} sortDir={sortDir} onClick={toggleSort}>Created</SortHeader>
                </tr>
              </thead>
              <tbody>
                {sortedTickets.map(ticket => {
                  const pri = priorityConfig[ticket.priority] || priorityConfig.medium
                  const st = statusConfig[ticket.status] || statusConfig.new
                  return (
                    <tr key={ticket.id} onClick={() => window.open(`/tickets/${ticket.id}`, '_blank', 'noopener,noreferrer')}
                      className={`border-b border-zinc-100 last:border-0 hover:bg-zinc-50 cursor-pointer transition-colors ${selectedIds.has(ticket.id) ? 'bg-blue-50/50' : ''}`}>
                      <td className="w-10 text-center py-2.5 px-2" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(ticket.id)}
                          onChange={() => toggleSelection(ticket.id)}
                          className="cursor-pointer"
                        />
                      </td>
                      <td className="py-2.5 px-4 text-zinc-400 font-mono text-xs">{String(ticket.ticket_number).padStart(5, '0')}</td>
                      <td className="py-2.5 px-4 font-medium text-zinc-900 max-w-md align-top">
                        <div className="font-medium">{ticket.title}</div>
                        {ticket.description && ticket.description.trim() && (() => {
                          const desc = ticket.description.trim()
                          const expanded = expandedDescriptions.has(ticket.id)
                          const isLong = desc.length > 280 || desc.split('\n').length > 4
                          return (
                            <div className="mt-1">
                              <div className={`text-[11px] text-zinc-500 whitespace-pre-wrap break-words leading-relaxed ${isLong && !expanded ? 'max-h-16 overflow-hidden' : ''}`}>
                                {desc}
                              </div>
                              {isLong && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault(); e.stopPropagation()
                                    setExpandedDescriptions(prev => {
                                      const next = new Set(prev)
                                      if (next.has(ticket.id)) next.delete(ticket.id)
                                      else next.add(ticket.id)
                                      return next
                                    })
                                  }}
                                  className="mt-0.5 text-[11px] font-medium text-[#0A52EF] hover:text-[#0840C0]"
                                >
                                  {expanded ? 'Show less' : 'Show more'}
                                </button>
                              )}
                            </div>
                          )
                        })()}
                        {ticket.source === 'voicemail' && ticket.contact_phone && (
                          <div className="text-[11px] text-blue-600 font-mono mt-0.5">📞 {ticket.contact_phone}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-zinc-600 text-xs">{ticket.venue_name || '—'}</td>
                      <td className="py-2.5 px-4 text-zinc-600 text-xs">{categoryLabels[ticket.category] || ticket.category}</td>
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
                      <td className="py-2.5 px-4 text-xs text-zinc-500 whitespace-nowrap tabular-nums">{ticket.created_time}</td>
                      <td className="py-2.5 px-4 text-xs text-zinc-400 whitespace-nowrap tabular-nums">{formatDate(ticket.created_date)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-zinc-900 text-white rounded-full shadow-xl flex items-center gap-2 pl-4 pr-2 py-2">
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <span className="text-zinc-500">·</span>
          <button
            onClick={clearSelection}
            disabled={bulkBusy}
            className="text-xs text-zinc-300 hover:text-white px-2"
          >
            Clear
          </button>
          <button
            onClick={bulkClose}
            disabled={bulkBusy}
            className="text-xs font-medium bg-emerald-500 hover:bg-emerald-600 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
          >
            {bulkBusy ? 'Closing…' : 'Close all'}
          </button>
          <button
            onClick={bulkMerge}
            disabled={bulkBusy || selectedIds.size < 2}
            className="text-xs font-medium bg-[#0A52EF] hover:bg-[#0840C0] px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
            title={selectedIds.size < 2 ? 'Select at least 2 tickets to merge' : ''}
          >
            {bulkBusy ? 'Merging…' : `Merge ${selectedIds.size}`}
          </button>
          {isAdmin && (
            <button
              onClick={bulkDelete}
              disabled={bulkBusy}
              className="text-xs font-medium bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
              title="Admin-only — use for spam"
            >
              {bulkBusy ? 'Deleting…' : `Delete ${selectedIds.size}`}
            </button>
          )}
        </div>
      )}
    </DashboardLayout>
  )
}
