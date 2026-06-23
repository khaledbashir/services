'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { formatDate } from '@/lib/format-date'

interface CgDesignRequest {
  id: string
  league: string | null
  team_name: string | null
  tricode: string | null
  job_title: string
  notes: string | null
  due_date: string | null
  status: string
  venue_name: string | null
  venue_id: string | null
  designer_name: string | null
  designer_id: string | null
  designers?: AssignmentPerson[]
  enterprise_contacts?: AssignmentPerson[]
  created_date: string
}

interface AssignmentPerson { id: string; full_name: string; is_primary?: boolean }
interface Venue { id: string; name: string; aliases?: string[] | null }
interface Staff { id: string; full_name: string }

function assignmentNames(people: AssignmentPerson[] | undefined, fallback?: string | null) {
  const names = (people || []).map((person) => person.full_name).filter(Boolean)
  if (!names.length && fallback) names.push(fallback)
  if (!names.length) return ''
  if (names.length <= 2) return names.join(', ')
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`
}

function normalizeTriCode(value: string): string {
  const cleaned = value.toUpperCase().replace(/[^A-Z-]/g, '')
  return cleaned.split('-').slice(0, 2).map((p) => p.slice(0, 3)).join('-')
}

function venueTriCodeOptions(venue: Venue | null | undefined): string[] {
  const options = (venue?.aliases || [])
    .map(normalizeTriCode)
    .filter((code) => /^[A-Z]{1,3}(-[A-Z]{1,3})?$/.test(code))
  return Array.from(new Set(options))
}

const statusColumns = [
  { key: 'request_submitted', label: 'Request Submitted' },
  { key: 'in_progress', label: 'In-Progress' },
  { key: 'submitted_internally', label: 'Submitted Internally' },
  { key: 'client_review', label: 'Client Review' },
  { key: 'revisions', label: 'Revisions' },
  { key: 'approved', label: 'Approved' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'request_closed', label: 'Request Closed' },
] as const

// User dashboard groupings (Alexis 2026-06-11): Requested / Active / Completed
const ACTIVE_CG_STATUSES = ['in_progress', 'submitted_internally', 'client_review', 'revisions', 'on_hold']
const COMPLETED_CG_STATUSES = ['approved', 'request_closed']

const statusTone: Record<string, string> = {
  request_submitted: 'bg-sky-50 text-sky-700',
  in_progress: 'bg-amber-50 text-amber-700',
  submitted_internally: 'bg-violet-50 text-violet-700',
  client_review: 'bg-blue-50 text-blue-700',
  revisions: 'bg-orange-50 text-orange-700',
  approved: 'bg-emerald-50 text-emerald-700',
  on_hold: 'bg-rose-50 text-rose-700',
  request_closed: 'bg-zinc-100 text-zinc-600',
}

export default function CgDesignsPage() {
  const [items, setItems] = useState<CgDesignRequest[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [search, setSearch] = useState('')
  // Per-designer filter — mirror the /designs page pattern so Alexis can
  // flip between "My assignments" / a specific designer / everyone.
  const [designerFilter, setDesignerFilter] = useState<string>('all')
  const [currentUserId, setCurrentUserId] = useState<string>('')
  useEffect(() => {
    try { setCurrentUserId(localStorage.getItem('userId') || '') } catch {}
  }, [])
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    venue_id: '',
    team_name: '',
    tricode: '',
    job_title: '',
    notes: '',
    designer_id: '',
    designer_ids: [] as string[],
    enterprise_contact_ids: [] as string[],
    due_date: '',
  })
  const staffById = useMemo(() => {
    const m = new Map<string, Staff>()
    staff.forEach((person) => m.set(person.id, person))
    return m
  }, [staff])
  const venueById = useMemo(() => {
    const m = new Map<string, Venue>()
    venues.forEach((venue) => m.set(venue.id, venue))
    return m
  }, [venues])
  const selectedVenueTriCodes = useMemo(() => {
    return formData.venue_id ? venueTriCodeOptions(venueById.get(formData.venue_id)) : []
  }, [formData.venue_id, venueById])

  const fetchData = async () => {
    try {
      const [cg, vd, sd] = await Promise.all([
        fetch('/api/cg-designs').then((r) => r.json()),
        fetch('/api/venues').then((r) => r.json()),
        fetch('/api/staff?assignable=project').then((r) => r.json()),
      ])
      setItems(cg.cg_design_requests || [])
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
    const onRefresh = () => { fetchData() }
    window.addEventListener('anc:data-refresh', onRefresh)
    return () => window.removeEventListener('anc:data-refresh', onRefresh)
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!formData.job_title.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/cg-designs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          venue_id: formData.venue_id || null,
          designer_id: formData.designer_ids[0] || null,
          designer_ids: formData.designer_ids,
          enterprise_contact_ids: formData.enterprise_contact_ids,
          due_date: formData.due_date || null,
        }),
      })
      if (res.ok) {
        setFormData({
          venue_id: '',
          team_name: '',
          tricode: '',
          job_title: '',
          notes: '',
          designer_id: '',
          designer_ids: [],
          enterprise_contact_ids: [],
          due_date: '',
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
    const targetDesignerId = designerFilter === 'mine' ? currentUserId : designerFilter
    return items.filter((item) => {
      const matchesSearch =
        !q ||
        item.job_title.toLowerCase().includes(q) ||
        (item.team_name || '').toLowerCase().includes(q) ||
        (item.tricode || '').toLowerCase().includes(q) ||
        (item.venue_name || '').toLowerCase().includes(q) ||
        (item.designer_name || '').toLowerCase().includes(q)

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'requested' && item.status === 'request_submitted') ||
        (statusFilter === 'active' && ACTIVE_CG_STATUSES.includes(item.status)) ||
        (statusFilter === 'completed' && COMPLETED_CG_STATUSES.includes(item.status)) ||
        item.status === statusFilter

      const matchesDesigner =
        designerFilter === 'all' || (targetDesignerId && item.designer_id === targetDesignerId)

      return matchesSearch && matchesStatus && matchesDesigner
    })
  }, [items, search, statusFilter, designerFilter, currentUserId])

  const counts: Record<string, number> = {
    requested: items.filter((item) => item.status === 'request_submitted').length,
    active: items.filter((item) => ACTIVE_CG_STATUSES.includes(item.status)).length,
    completed: items.filter((item) => COMPLETED_CG_STATUSES.includes(item.status)).length,
    all: items.length,
  }
  for (const status of statusColumns) counts[status.key] = items.filter((item) => item.status === status.key).length

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <Skeleton className="h-7 w-56" />
              <Skeleton className="h-4 w-32" />
            </div>
            <Skeleton className="h-9 w-36" />
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
            <h1 className="text-2xl font-semibold text-zinc-900">CG Design Requests</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{counts.active} active · {counts.all} total</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors">
            {showForm ? 'Cancel' : 'New CG Request'}
          </button>
        </div>

        {showForm && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-5">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">Create CG Design Request</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Job Title *</label>
                <input type="text" value={formData.job_title} onChange={(e) => setFormData((prev) => ({ ...prev, job_title: e.target.value }))} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400 outline-none bg-white" required />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Venue</label>
                  <select
                    value={formData.venue_id}
                    onChange={(e) => {
                      const venueId = e.target.value
                      const codes = venueTriCodeOptions(venueId ? venueById.get(venueId) : null)
                      setFormData((prev) => ({ ...prev, venue_id: venueId, tricode: codes.length === 1 ? codes[0] : prev.tricode }))
                    }}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  >
                    <option value="">Select venue...</option>
                    {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Team Name</label>
                  <input type="text" value={formData.team_name} onChange={(e) => setFormData((prev) => ({ ...prev, team_name: e.target.value }))} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Tri-Code</label>
                  {selectedVenueTriCodes.length > 0 ? (
                    <select
                      value={formData.tricode}
                      onChange={(e) => setFormData((prev) => ({ ...prev, tricode: e.target.value }))}
                      className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white font-mono uppercase"
                    >
                      <option value="">Select code...</option>
                      {selectedVenueTriCodes.map((code) => <option key={code} value={code}>{code}</option>)}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={formData.tricode}
                      onChange={(e) => setFormData((prev) => ({ ...prev, tricode: normalizeTriCode(e.target.value) }))}
                      maxLength={7}
                      placeholder="BSX-FEN"
                      className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white font-mono uppercase"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Due Date</label>
                  <input type="date" value={formData.due_date} onChange={(e) => setFormData((prev) => ({ ...prev, due_date: e.target.value }))} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Designers</label>
                  <select
                    value=""
                    onChange={(e) => {
                      const id = e.target.value
                      if (!id) return
                      setFormData((prev) => ({ ...prev, designer_ids: prev.designer_ids.includes(id) ? prev.designer_ids : [...prev.designer_ids, id] }))
                    }}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  >
                    <option value="">Add designer...</option>
                    {staff.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
                  </select>
                  {formData.designer_ids.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {formData.designer_ids.map((id) => (
                        <button key={id} type="button" onClick={() => setFormData((prev) => ({ ...prev, designer_ids: prev.designer_ids.filter((x) => x !== id) }))} className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-zinc-700 ring-1 ring-zinc-200">
                          {staffById.get(id)?.full_name || 'Designer'} x
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
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Notes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))} rows={4} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none resize-none bg-white" />
              </div>
              <button type="submit" disabled={submitting} className="px-5 py-2 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50">
                {submitting ? 'Creating...' : 'Create CG Request'}
              </button>
            </form>
          </div>
        )}

        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-1 overflow-x-auto">
            {[{ key: 'requested', label: 'Requested' }, { key: 'active', label: 'Active' }, { key: 'completed', label: 'Completed' }, { key: 'all', label: 'All' }].map((tab) => {
              const isActive = statusFilter === tab.key
              return (
                <button key={tab.key} onClick={() => setStatusFilter(tab.key)} className={`rounded-lg px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${isActive ? 'bg-[#0A52EF] text-white' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'}`}>
                  {tab.label}
                  <span className={`ml-1.5 text-[11px] tabular-nums ${isActive ? 'text-white/80' : 'text-zinc-400'}`}>{counts[tab.key]}</span>
                </button>
              )
            })}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input type="text" placeholder="Search CG requests..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full sm:w-72 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-400 bg-white" />
            <select
              value={designerFilter}
              onChange={(e) => setDesignerFilter(e.target.value)}
              className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
              title="Filter to one designer"
            >
              <option value="all">All designers</option>
              {currentUserId && <option value="mine">My assignments</option>}
              <option disabled>──────────</option>
              {staff.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {statusColumns.map((column) => {
            const columnItems = filtered.filter((item) => item.status === column.key)
            return (
              <div key={column.key} className="rounded-xl border border-zinc-200 bg-zinc-50 min-h-[18rem] overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-200 bg-white flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900">{column.label}</h2>
                    <p className="text-xs text-zinc-400 mt-0.5">{columnItems.length} requests</p>
                  </div>
                </div>
                <div className="p-3 space-y-3">
                  {columnItems.length === 0 && <div className="rounded-lg border border-dashed border-zinc-200 bg-white px-3 py-5 text-center text-xs text-zinc-400">No requests</div>}
                  {columnItems.map((item) => {
                    const designerNames = assignmentNames(item.designers, item.designer_name)
                    const enterpriseNames = assignmentNames(item.enterprise_contacts)
                    const assigneeText = [designerNames || 'No designer assigned', enterpriseNames ? `Ent: ${enterpriseNames}` : ''].filter(Boolean).join(' · ')
                    return (
                    <Link key={item.id} href={`/cg-designs/${item.id}`} className="block rounded-lg border border-zinc-200 bg-white p-3 hover:border-zinc-300 hover:shadow-sm transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-medium text-zinc-900 leading-snug">{item.job_title}</h3>
                        <span className={`px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${statusTone[item.status] || 'bg-zinc-100 text-zinc-600'}`}>{column.label}</span>
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-zinc-500">
                        <p>{item.team_name || 'No team'}</p>
                        <p className="font-mono">{item.tricode || 'No tri-code'}</p>
                        <p>{item.venue_name || 'No venue linked'}</p>
                        <p>{assigneeText}</p>
                        {item.due_date && <p>Due {formatDate(item.due_date)}</p>}
                      </div>
                    </Link>
                  )})}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </DashboardLayout>
  )
}
