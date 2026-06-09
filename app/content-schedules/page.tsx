'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { formatDate } from '@/lib/format-date'

interface ContentSchedule {
  id: string
  company_name: string | null
  content_name: string
  launch_date: string | null
  end_date: string | null
  files_ready: boolean
  file_location: string | null
  status: string
  notes: string | null
  venue_name: string | null
  venue_id: string | null
  operator_name: string | null
  operator_id: string | null
  created_date: string
}

interface Venue { id: string; name: string }
interface Staff { id: string; full_name: string }

const statusColumns = [
  { key: 'ready', label: 'Ready' },
  { key: 'in_queue', label: 'In Queue' },
  { key: 'scheduled_to_launch', label: 'Scheduled To Launch' },
  { key: 'content_live', label: 'Content Live' },
  { key: 'confirmed_live', label: 'Confirmed Live with Client' },
  { key: 'content_removed', label: 'Content Removed' },
  { key: 'done', label: 'Done' },
] as const

const statusTone: Record<string, string> = {
  ready: 'bg-green-50 text-green-700',
  in_queue: 'bg-violet-50 text-violet-700',
  scheduled_to_launch: 'bg-amber-50 text-amber-700',
  content_live: 'bg-blue-50 text-blue-700',
  confirmed_live: 'bg-emerald-50 text-emerald-700',
  content_removed: 'bg-rose-50 text-rose-700',
  done: 'bg-zinc-100 text-zinc-600',
}

export default function ContentSchedulesPage() {
  const [items, setItems] = useState<ContentSchedule[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [venueFilter, setVenueFilter] = useState<string>('all')
  const [clientFilter, setClientFilter] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    venue_id: '',
    company_name: '',
    content_name: '',
    launch_date: '',
    end_date: '',
    operator_id: '',
    operator_ids: [] as string[],
    enterprise_contact_ids: [] as string[],
    files_ready: false,
    file_location: '',
    notes: '',
  })
  const staffById = useMemo(() => {
    const m = new Map<string, Staff>()
    staff.forEach((person) => m.set(person.id, person))
    return m
  }, [staff])

  const fetchData = async () => {
    try {
      const [cs, vd, sd] = await Promise.all([
        fetch('/api/content-schedules').then((r) => r.json()),
        fetch('/api/venues').then((r) => r.json()),
        fetch('/api/staff').then((r) => r.json()),
      ])
      setItems(cs.content_schedules || [])
      setVenues(vd.venues || [])
      setStaff(sd.staff || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!formData.content_name.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/content-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          venue_id: formData.venue_id || null,
          launch_date: formData.launch_date || null,
          end_date: formData.end_date || null,
          operator_id: formData.operator_ids[0] || null,
          operator_ids: formData.operator_ids,
          enterprise_contact_ids: formData.enterprise_contact_ids,
        }),
      })
      if (res.ok) {
        setFormData({
          venue_id: '',
          company_name: '',
          content_name: '',
          launch_date: '',
          end_date: '',
          operator_id: '',
          operator_ids: [],
          enterprise_contact_ids: [],
          files_ready: false,
          file_location: '',
          notes: '',
        })
        setShowForm(false)
        await fetchData()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      const matchesSearch =
        !q ||
        item.content_name.toLowerCase().includes(q) ||
        (item.company_name || '').toLowerCase().includes(q) ||
        (item.venue_name || '').toLowerCase().includes(q) ||
        (item.operator_name || '').toLowerCase().includes(q)
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
      const matchesVenue = venueFilter === 'all' || item.venue_id === venueFilter
      const matchesClient = clientFilter === 'all' || item.company_name === clientFilter

      return matchesSearch && matchesStatus && matchesVenue && matchesClient
    })
  }, [items, search, statusFilter, venueFilter, clientFilter])

  const clients = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) {
      if (item.company_name) set.add(item.company_name)
    }
    return Array.from(set).sort()
  }, [items])

  const counts: Record<string, number> = { all: items.length }
  for (const status of statusColumns) counts[status.key] = items.filter((item) => item.status === status.key).length

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-7 w-52" />
              <Skeleton className="h-4 w-36" />
            </div>
            <Skeleton className="h-9 w-44" />
          </div>
          <Skeleton className="h-10 w-full rounded-lg" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <Skeleton className="h-72 w-full rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl" />
            <Skeleton className="h-72 w-full rounded-xl" />
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex justify-between items-center gap-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 mb-1.5">Creative Workflow</div>
            <h1 className="text-2xl font-semibold text-zinc-900">Content Schedules</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{counts.all} total schedules</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors">
            {showForm ? 'Cancel' : 'New Content Schedule'}
          </button>
        </div>

        {showForm && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">Create Content Schedule</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Content Name *</label>
                <input type="text" value={formData.content_name} onChange={(e) => setFormData((prev) => ({ ...prev, content_name: e.target.value }))} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400 outline-none bg-white" required />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Venue</label>
                  <select value={formData.venue_id} onChange={(e) => setFormData((prev) => ({ ...prev, venue_id: e.target.value }))} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white">
                    <option value="">Select venue...</option>
                    {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Company</label>
                  <input type="text" value={formData.company_name} onChange={(e) => setFormData((prev) => ({ ...prev, company_name: e.target.value }))} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Launch Date</label>
                  <input type="date" value={formData.launch_date} onChange={(e) => setFormData((prev) => ({ ...prev, launch_date: e.target.value }))} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">End Date</label>
                  <input type="date" value={formData.end_date} onChange={(e) => setFormData((prev) => ({ ...prev, end_date: e.target.value }))} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">File Location</label>
                  <input type="text" value={formData.file_location} onChange={(e) => setFormData((prev) => ({ ...prev, file_location: e.target.value }))} placeholder="Folder, server path, or URL" className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Operators</label>
                  <select
                    value=""
                    onChange={(e) => {
                      const id = e.target.value
                      if (!id) return
                      setFormData((prev) => ({ ...prev, operator_ids: prev.operator_ids.includes(id) ? prev.operator_ids : [...prev.operator_ids, id] }))
                    }}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  >
                    <option value="">Add operator...</option>
                    {staff.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
                  </select>
                  {formData.operator_ids.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {formData.operator_ids.map((id) => (
                        <button key={id} type="button" onClick={() => setFormData((prev) => ({ ...prev, operator_ids: prev.operator_ids.filter((x) => x !== id) }))} className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 ring-1 ring-zinc-200">
                          {staffById.get(id)?.full_name || 'Operator'} x
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Enterprise Leads</label>
                  <select
                    value=""
                    onChange={(e) => {
                      const id = e.target.value
                      if (!id) return
                      setFormData((prev) => ({ ...prev, enterprise_contact_ids: prev.enterprise_contact_ids.includes(id) ? prev.enterprise_contact_ids : [...prev.enterprise_contact_ids, id] }))
                    }}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  >
                    <option value="">Add enterprise lead...</option>
                    {staff.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
                  </select>
                  {formData.enterprise_contact_ids.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {formData.enterprise_contact_ids.map((id) => (
                        <button key={id} type="button" onClick={() => setFormData((prev) => ({ ...prev, enterprise_contact_ids: prev.enterprise_contact_ids.filter((x) => x !== id) }))} className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 ring-1 ring-zinc-200">
                          {staffById.get(id)?.full_name || 'Enterprise Lead'} x
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-700">
                <input type="checkbox" checked={formData.files_ready} onChange={(e) => setFormData((prev) => ({ ...prev, files_ready: e.target.checked }))} />
                Files ready
              </label>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Notes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))} rows={4} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none resize-none bg-white" />
              </div>
              <button type="submit" disabled={submitting} className="px-5 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50">
                {submitting ? 'Creating...' : 'Create Content Schedule'}
              </button>
            </form>
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-1 overflow-x-auto w-full xl:w-auto">
            {[...statusColumns, { key: 'all', label: 'All' }].map((tab) => {
              const isActive = statusFilter === tab.key
              return (
                <button key={tab.key} onClick={() => setStatusFilter(tab.key)} className={`rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${isActive ? 'bg-[#0A52EF] text-white' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'}`}>
                  {tab.label}
                  <span className={`ml-1.5 text-[11px] tabular-nums ${isActive ? 'text-white/80' : 'text-zinc-400'}`}>{counts[tab.key]}</span>
                </button>
              )
            })}
          </div>
          <div className="flex flex-col gap-2 w-full sm:flex-row xl:w-auto">
            <select value={venueFilter} onChange={(e) => setVenueFilter(e.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-400 bg-white">
              <option value="all">All Venues</option>
              {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
            </select>
            <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-400 bg-white sm:max-w-[180px]">
              <option value="all">All Clients</option>
              {clients.map((client) => <option key={client} value={client}>{client}</option>)}
            </select>
            <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-48 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-400 bg-white" />
            <div className="flex bg-zinc-100 rounded-md p-1 border border-zinc-200">
              <button onClick={() => setViewMode('list')} className={`px-3 py-1 text-xs font-medium rounded-sm ${viewMode === 'list' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}>List</button>
              <button onClick={() => setViewMode('calendar')} className={`px-3 py-1 text-xs font-medium rounded-sm ${viewMode === 'calendar' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}>Calendar</button>
            </div>
          </div>
        </div>

        {viewMode === 'calendar' ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-6 min-h-[360px] flex items-center justify-center text-sm text-zinc-500">
            Calendar view placeholder (to be implemented with react-big-calendar or similar if needed)
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {statusColumns.map((column) => {
            const columnItems = filtered.filter((item) => item.status === column.key)
            return (
              <div key={column.key} className="rounded-xl border border-zinc-200 bg-zinc-50 min-h-[18rem] overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-200 bg-white flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900">{column.label}</h2>
                    <p className="text-xs text-zinc-400 mt-0.5">{columnItems.length} schedules</p>
                  </div>
                </div>
                <div className="p-3 space-y-3">
                  {columnItems.length === 0 && <div className="rounded-lg border border-dashed border-zinc-200 bg-white px-3 py-5 text-center text-xs text-zinc-400">No schedules</div>}
                  {columnItems.map((item) => (
                    <Link key={item.id} href={`/content-schedules/${item.id}`} className="block rounded-lg border border-zinc-200 bg-white p-3 hover:border-zinc-300 hover:shadow-sm transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-medium text-zinc-900 leading-snug">{item.content_name}</h3>
                        <span className={`px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${statusTone[item.status] || 'bg-zinc-100 text-zinc-600'}`}>{column.label}</span>
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-zinc-500">
                        <p>{item.company_name || 'No company'}</p>
                        <p>{item.venue_name || 'No venue linked'}</p>
                        <p>{item.operator_name || 'No operator assigned'}</p>
                        {item.file_location && <p className="truncate">{item.file_location}</p>}
                        {item.launch_date && <p>Launch {formatDate(item.launch_date)}</p>}
                        <p>{item.files_ready ? 'Files ready' : 'Files pending'}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
