'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { KanbanBoard, type KanbanColumn } from '@/components/kanban-board'
import { Skeleton } from '@/components/skeleton'
import { formatDate } from '@/lib/format-date'

interface DesignRequest {
  id: string
  job_title: string
  company_name: string | null
  tricode: string | null
  venue_name: string | null
  venue_id: string | null
  designer_name: string | null
  designer_id: string | null
  enterprise_contact_name: string | null
  enterprise_contact_id: string | null
  status: string
  hours_estimated: number | null
  hours_spent: number | null
  due_date: string | null
  boards_requested: string | null
  sizes_requested: string | null
  created_date: string
  is_rando?: boolean
}

interface Venue { id: string; name: string }
interface Staff { id: string; full_name: string }

const statusColumns: KanbanColumn[] = [
  { key: 'request_submitted', label: 'Submitted', accent: 'bg-sky-500' },
  { key: 'in_queue', label: 'In Queue', accent: 'bg-violet-500' },
  { key: 'in_progress', label: 'In Progress', accent: 'bg-amber-500' },
  { key: 'in_qc', label: 'In QC', accent: 'bg-orange-500' },
  { key: 'client_review', label: 'Client Review', accent: 'bg-blue-500' },
  { key: 'approved', label: 'Approved', accent: 'bg-emerald-500' },
  { key: 'done', label: 'Done', accent: 'bg-zinc-400' },
] as const

const statusTone: Record<string, string> = {
  request_submitted: 'bg-sky-50 text-sky-700',
  in_queue: 'bg-violet-50 text-violet-700',
  in_progress: 'bg-amber-50 text-amber-700',
  in_qc: 'bg-orange-50 text-orange-700',
  client_review: 'bg-blue-50 text-blue-700',
  approved: 'bg-emerald-50 text-emerald-700',
  done: 'bg-zinc-100 text-zinc-600',
}

export default function DesignsPage() {
  const router = useRouter()
  const [designRequests, setDesignRequests] = useState<DesignRequest[]>([])
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null)
  const [venues, setVenues] = useState<Venue[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [sortKey, setSortKey] = useState<string>('newest')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // Per-designer + randos filters added 2026-04-23 per Alexis's ask:
  //   "The ability to have dashboards specific to the person will be very helpful."
  // `designerFilter` = 'all' | 'mine' | <staff_id>
  // `randoFilter`    = 'all' | 'only'  | 'exclude'
  const [designerFilter, setDesignerFilter] = useState<string>('all')
  const [randoFilter, setRandoFilter] = useState<'all' | 'only' | 'exclude'>('all')
  const [currentUserId, setCurrentUserId] = useState<string>('')
  useEffect(() => {
    try {
      const uid = localStorage.getItem('userId') || ''
      setCurrentUserId(uid)
    } catch {}
  }, [])
  const [formData, setFormData] = useState({
    venue_id: '',
    company_name: '',
    job_title: '',
    tricode: '',
    boards_requested: '',
    sizes_requested: '',
    designer_id: '',
    enterprise_contact_id: '',
    due_date: '',
    hours_estimated: '',
    notes: '',
    is_rando: false,
  })

  const fetchData = async (sort: string = sortKey) => {
    try {
      const [dr, vd, sd] = await Promise.all([
        fetch(`/api/design-requests?sort=${encodeURIComponent(sort)}`).then((r) => r.json()),
        fetch('/api/venues').then((r) => r.json()),
        fetch('/api/staff').then((r) => r.json()),
      ])
      setDesignRequests(dr.design_requests || [])
      setVenues(vd.venues || [])
      setStaff(sd.staff || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData(sortKey)
    const onRefresh = () => { fetchData(sortKey) }
    window.addEventListener('anc:data-refresh', onRefresh)
    return () => window.removeEventListener('anc:data-refresh', onRefresh)
  }, [sortKey])

  const updateStatus = async (item: DesignRequest, status: string) => {
    try {
      const res = await fetch(`/api/design-requests/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (res.ok) {
        setDesignRequests((prev) => prev.map((row) => (row.id === item.id ? { ...row, status } : row)))
      }
    } catch (err) {
      console.error(err)
    }
  }

  const duplicateRequest = async (id: string) => {
    if (duplicatingId) return
    setDuplicatingId(id)
    try {
      const res = await fetch(`/api/design-requests/${id}/duplicate`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err?.error || 'Could not duplicate this request')
        return
      }
      const data = await res.json()
      const newId = data?.design_request?.id
      if (newId) {
        // Drop the user straight into the new request so they can fill in the
        // cycle-specific fields (date, asset link, designer) — that's exactly
        // Alexis's South Street workflow.
        router.push(`/designs/${newId}`)
      } else {
        await fetchData()
      }
    } catch (err) {
      console.error(err)
      alert('Could not duplicate this request')
    } finally {
      setDuplicatingId(null)
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!formData.job_title.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/design-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          venue_id: formData.venue_id || null,
          designer_id: formData.designer_id || null,
          enterprise_contact_id: formData.enterprise_contact_id || null,
          due_date: formData.due_date || null,
          hours_estimated: formData.hours_estimated ? Number(formData.hours_estimated) : null,
        }),
      })
      if (res.ok) {
        setFormData({
          venue_id: '',
          company_name: '',
          job_title: '',
          tricode: '',
          boards_requested: '',
          sizes_requested: '',
          designer_id: '',
          enterprise_contact_id: '',
          due_date: '',
          hours_estimated: '',
          notes: '',
          is_rando: false,
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
    return designRequests.filter((item) => {
      const matchesSearch =
        !q ||
        item.job_title.toLowerCase().includes(q) ||
        (item.company_name || '').toLowerCase().includes(q) ||
        (item.venue_name || '').toLowerCase().includes(q) ||
        (item.designer_name || '').toLowerCase().includes(q) ||
        (item.tricode || '').toLowerCase().includes(q)

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && item.status !== 'done') ||
        item.status === statusFilter

      const matchesDesigner =
        designerFilter === 'all' || (targetDesignerId && item.designer_id === targetDesignerId)

      const matchesRando =
        randoFilter === 'all' ||
        (randoFilter === 'only' && item.is_rando) ||
        (randoFilter === 'exclude' && !item.is_rando)

      return matchesSearch && matchesStatus && matchesDesigner && matchesRando
    })
  }, [designRequests, search, statusFilter, designerFilter, randoFilter, currentUserId])

  const counts: Record<string, number> = {
    active: designRequests.filter((item) => item.status !== 'done').length,
    all: designRequests.length,
  }

  for (const status of statusColumns) {
    counts[status.key] = designRequests.filter((item) => item.status === status.key).length
  }

  // Metric strip numbers (computed once for header display).
  const todayIso = new Date().toISOString().slice(0, 10)
  const weekAhead = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 10)
  const overdue = designRequests.filter(r => r.status !== 'done' && r.status !== 'approved' && r.due_date && r.due_date < todayIso).length
  const dueThisWeek = designRequests.filter(r => r.status !== 'done' && r.status !== 'approved' && r.due_date && r.due_date >= todayIso && r.due_date <= weekAhead).length
  const inReview = designRequests.filter(r => r.status === 'client_review' || r.status === 'in_qc').length
  const unassigned = designRequests.filter(r => r.status !== 'done' && r.status !== 'approved' && !r.designer_id).length

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-8">
          <Skeleton className="h-14 w-64" />
          <div className="grid grid-cols-4 gap-3">
            {[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
          </div>
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-80 w-full rounded-2xl" />
            <Skeleton className="h-80 w-full rounded-2xl" />
            <Skeleton className="h-80 w-full rounded-2xl" />
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Hero header — refined, generous, enterprise feel. */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 mb-1.5">
              Creative Workflow
            </div>
            <h1 className="text-2xl leading-tight font-semibold text-zinc-900 tracking-tight">
              Design Requests
            </h1>
            <p className="text-sm text-zinc-500 mt-1.5">
              {counts.active} active · {counts.all} total · last refreshed {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => fetchData()}
              className="h-9 w-9 flex items-center justify-center rounded-lg ring-1 ring-zinc-200 bg-white text-zinc-500 hover:text-zinc-900 hover:ring-zinc-300 transition-colors"
              title="Refresh"
              aria-label="Refresh"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <Link
              href="/designs/templates"
              className="inline-flex items-center gap-2 h-9 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:text-zinc-900 hover:ring-zinc-300 transition-colors"
              title="Saved request templates"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v5h5M9 13h6M9 17h4" />
              </svg>
              <span>Templates</span>
            </Link>
            <button
              onClick={() => setShowForm(!showForm)}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-zinc-900 text-white text-sm font-medium shadow-[0_4px_12px_-4px_rgba(15,23,42,0.35)] hover:bg-zinc-800 hover:shadow-[0_6px_16px_-4px_rgba(15,23,42,0.4)] transition-all"
            >
              {showForm ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  <span>Close</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                  <span>New Request</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Metric strip — quick-glance ops health */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Active', value: counts.active, tone: 'text-zinc-900', accent: 'bg-[#0A52EF]' },
            { label: 'Due this week', value: dueThisWeek, tone: 'text-zinc-900', accent: 'bg-amber-500' },
            { label: 'In review', value: inReview, tone: 'text-zinc-900', accent: 'bg-blue-500' },
            { label: overdue > 0 ? 'Overdue' : 'Unassigned', value: overdue > 0 ? overdue : unassigned, tone: overdue > 0 ? 'text-red-600' : 'text-zinc-900', accent: overdue > 0 ? 'bg-red-500' : 'bg-zinc-400' },
          ].map((metric) => (
            <div key={metric.label} className="group relative rounded-xl bg-white ring-1 ring-zinc-200/80 px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_6px_16px_-8px_rgba(15,23,42,0.2)] hover:ring-zinc-300 transition-all">
              <div className="absolute top-3.5 right-3.5">
                <span className={`block w-1.5 h-1.5 rounded-full ${metric.accent} ring-2 ring-white`} />
              </div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{metric.label}</div>
              <div className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${metric.tone}`}>
                {metric.value}
              </div>
            </div>
          ))}
        </div>

        {/* Create form — sliding panel feel */}
        {showForm && (
          <div className="rounded-2xl bg-white ring-1 ring-zinc-200 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.18)] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-gradient-to-b from-zinc-50/60 to-white">
              <div>
                <h3 className="text-[15px] font-semibold text-zinc-900">New Design Request</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Creates a job in the <span className="font-medium text-zinc-700">Submitted</span> column. The Creative lead will triage.</p>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Job Title <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formData.job_title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, job_title: e.target.value }))}
                  placeholder="e.g. Lakers Playoff Banner Set"
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:ring-offset-0 outline-none bg-white transition-shadow"
                  required
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">
                    Venue {formData.is_rando && <span className="text-zinc-400 font-normal lowercase tracking-normal">— optional for randos</span>}
                  </label>
                  <select
                    value={formData.venue_id}
                    onChange={(e) => setFormData((prev) => ({ ...prev, venue_id: e.target.value }))}
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                  >
                    <option value="">Not specified</option>
                    {venues.map((venue) => (
                      <option key={venue.id} value={venue.id}>{venue.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Company</label>
                  <input
                    type="text"
                    value={formData.company_name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, company_name: e.target.value }))}
                    placeholder="e.g. Los Angeles Lakers"
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                  />
                </div>
              </div>

              {/* Rando / ad-hoc marker — Alexis: one-off paid work with no service agreement */}
              <label className="flex items-start gap-2.5 cursor-pointer rounded-lg bg-zinc-50 ring-1 ring-zinc-200 px-3.5 py-3 hover:bg-zinc-100 transition-colors">
                <input
                  type="checkbox"
                  checked={formData.is_rando}
                  onChange={(e) => setFormData((prev) => ({ ...prev, is_rando: e.target.checked }))}
                  className="mt-0.5 h-4 w-4 accent-[#0A52EF]"
                />
                <div>
                  <div className="text-sm font-medium text-zinc-900">This is a rando / ad-hoc request</div>
                  <div className="text-xs text-zinc-500 mt-0.5">One-off paid work for a client with no recurring service agreement (e.g. University of Washington). Venue is optional.</div>
                </div>
              </label>

              <div className="grid md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Tri-Code</label>
                  <input
                    type="text"
                    value={formData.tricode}
                    onChange={(e) => setFormData((prev) => ({ ...prev, tricode: e.target.value.toUpperCase() }))}
                    maxLength={3}
                    placeholder="LAL"
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Designer</label>
                  <select
                    value={formData.designer_id}
                    onChange={(e) => setFormData((prev) => ({ ...prev, designer_id: e.target.value }))}
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                  >
                    <option value="">Unassigned</option>
                    {staff.map((person) => (
                      <option key={person.id} value={person.id}>{person.full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Enterprise Lead</label>
                  <select
                    value={formData.enterprise_contact_id}
                    onChange={(e) => setFormData((prev) => ({ ...prev, enterprise_contact_id: e.target.value }))}
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                  >
                    <option value="">Unassigned</option>
                    {staff.map((person) => (
                      <option key={person.id} value={person.id}>{person.full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Due Date</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, due_date: e.target.value }))}
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Boards</label>
                  <input
                    type="text"
                    value={formData.boards_requested}
                    onChange={(e) => setFormData((prev) => ({ ...prev, boards_requested: e.target.value }))}
                    placeholder="e.g. Scoring, Anthem, Intro"
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Sizes</label>
                  <input
                    type="text"
                    value={formData.sizes_requested}
                    onChange={(e) => setFormData((prev) => ({ ...prev, sizes_requested: e.target.value }))}
                    placeholder="e.g. 16:9, 6×12"
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Est. Hours</label>
                  <input
                    type="number"
                    step="0.25"
                    value={formData.hours_estimated}
                    onChange={(e) => setFormData((prev) => ({ ...prev, hours_estimated: e.target.value }))}
                    placeholder="0"
                    className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-1.5">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={3}
                  placeholder="Brand assets, delivery format, anything the designer needs to know…"
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none resize-none bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="h-10 px-4 rounded-xl text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-[#0A52EF] text-white text-sm font-medium shadow-[0_4px_12px_-4px_rgba(10,82,239,0.6)] hover:bg-[#0840C0] disabled:opacity-50 transition-all"
                >
                  {submitting ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      <span>Creating…</span>
                    </>
                  ) : (
                    <>
                      <span>Create Request</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tabs + search — pill bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center rounded-lg bg-zinc-100/80 p-1 ring-1 ring-zinc-200/60">
            {[
              { key: 'active', label: 'Active' },
              { key: 'all', label: 'All' },
              { key: 'done', label: 'Done' },
            ].map((tab) => {
              const isActive = statusFilter === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[13px] font-medium transition-all ${
                    isActive
                      ? 'bg-white text-zinc-900 shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-zinc-200/60'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  {tab.label}
                  <span className={`tabular-nums text-[11px] ${isActive ? 'text-zinc-500' : 'text-zinc-400'}`}>
                    {counts[tab.key] ?? 0}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4h13M3 8h9m-9 4h6m4 0l4 4m0 0l4-4m-4 4V4" />
              </svg>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value)}
                className="h-9 pl-9 pr-8 rounded-lg ring-1 ring-zinc-200 bg-white text-sm text-zinc-700 outline-none focus:ring-2 focus:ring-[#0A52EF]/30 transition-shadow appearance-none cursor-pointer"
                title="Sort order"
              >
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="updated">Recently updated</option>
                <option value="due_asc">Due soonest</option>
                <option value="due_desc">Due latest</option>
                <option value="title">Title A–Z</option>
              </select>
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            <div className="relative">
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 103.5 10a7.5 7.5 0 0013.15 6.65z" />
              </svg>
              <input
                type="text"
                placeholder="Search by title, company, venue, designer…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-64 h-9 pl-10 pr-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-[#0A52EF]/30 transition-shadow"
              />
            </div>
            {/* Designer filter — Alexis's per-designer dashboard ask (2026-04-23). */}
            <div className="relative">
              <select
                value={designerFilter}
                onChange={(e) => setDesignerFilter(e.target.value)}
                className="h-9 pl-3 pr-9 rounded-lg ring-1 ring-zinc-200 bg-white text-sm appearance-none outline-none focus:ring-2 focus:ring-[#0A52EF]/30 transition-shadow"
                title="Filter to one designer's assignments"
              >
                <option value="all">All designers</option>
                {currentUserId && <option value="mine">My assignments</option>}
                <option disabled>──────────</option>
                {staff.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
            {/* Randos / ad-hoc filter — Alexis's "no service agreement" work-tracking ask. */}
            <div className="relative">
              <select
                value={randoFilter}
                onChange={(e) => setRandoFilter(e.target.value as 'all' | 'only' | 'exclude')}
                className="h-9 pl-3 pr-9 rounded-lg ring-1 ring-zinc-200 bg-white text-sm appearance-none outline-none focus:ring-2 focus:ring-[#0A52EF]/30 transition-shadow"
                title="Show all, only ad-hoc randos, or exclude randos"
              >
                <option value="all">All requests</option>
                <option value="only">Randos only</option>
                <option value="exclude">Exclude randos</option>
              </select>
              <svg xmlns="http://www.w3.org/2000/svg" className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>

        <KanbanBoard
          items={filtered}
          columns={statusColumns as KanbanColumn[]}
          statusOf={(item) => item.status}
          keyOf={(item) => item.id}
          onStatusChange={updateStatus}
          renderCard={(item) => {
            const hoursSpent = Number(item.hours_spent || 0)
            const hoursEstimated = Number(item.hours_estimated || 0)
            const progressPct = hoursEstimated > 0 ? Math.min(100, Math.round((hoursSpent / hoursEstimated) * 100)) : 0
            const overBudget = hoursEstimated > 0 && hoursSpent > hoursEstimated
            const progressTone =
              overBudget ? 'bg-red-500' :
              progressPct >= 75 ? 'bg-amber-500' :
              progressPct >= 35 ? 'bg-[#0A52EF]' :
              'bg-emerald-500'

            const dueIso = item.due_date ? String(item.due_date).slice(0, 10) : null
            const isOverdue = dueIso && dueIso < todayIso && item.status !== 'done' && item.status !== 'approved'
            const isDueSoon = dueIso && !isOverdue && dueIso <= weekAhead
            const dueTone = isOverdue ? 'bg-red-50 text-red-700 ring-red-200'
              : isDueSoon ? 'bg-amber-50 text-amber-700 ring-amber-200'
              : 'bg-zinc-50 text-zinc-600 ring-zinc-200'

            const designerInitials = item.designer_name
              ? item.designer_name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase()
              : null

            return (
              <div className="relative">
                <Link href={`/designs/${item.id}`} className="block space-y-3">
                {/* Header: title + tricode pill */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[13.5px] font-semibold text-zinc-900 leading-snug line-clamp-2 pr-7">
                    {item.job_title}
                  </h3>
                  {item.tricode && (
                    <span className="flex-shrink-0 font-mono text-[10px] font-semibold text-zinc-600 bg-zinc-100 ring-1 ring-zinc-200 px-1.5 py-0.5 rounded tracking-wider">
                      {item.tricode}
                    </span>
                  )}
                </div>

                {/* Context line: venue · company */}
                <div className="flex items-center gap-1.5 text-[11.5px] text-zinc-500 min-w-0">
                  {item.venue_name ? (
                    <>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      </svg>
                      <span className="truncate">{item.venue_name}</span>
                    </>
                  ) : (
                    <span className="text-zinc-400 italic">No venue</span>
                  )}
                  {item.company_name && (
                    <>
                      <span className="text-zinc-300">·</span>
                      <span className="truncate">{item.company_name}</span>
                    </>
                  )}
                </div>

                {/* Footer row: designer avatar, due date, hours */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {designerInitials ? (
                      <div className="flex-shrink-0 h-6 w-6 rounded-full bg-gradient-to-br from-[#0A52EF] to-[#6A5CF8] text-white text-[10px] font-semibold flex items-center justify-center ring-2 ring-white shadow-sm">
                        {designerInitials}
                      </div>
                    ) : (
                      <div className="flex-shrink-0 h-6 w-6 rounded-full bg-zinc-100 ring-1 ring-dashed ring-zinc-300 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                      </div>
                    )}
                    <span className="text-[11.5px] text-zinc-600 truncate">
                      {item.designer_name || 'Unassigned'}
                    </span>
                  </div>
                  {dueIso && (
                    <span className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full ring-1 px-2 py-0.5 text-[10.5px] font-medium tabular-nums ${dueTone}`}>
                      {isOverdue ? (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                      ) : null}
                      {formatDate(dueIso)}
                    </span>
                  )}
                </div>

                {/* Hours progress */}
                {(hoursEstimated > 0 || hoursSpent > 0) && (
                  <div>
                    <div className="flex items-center justify-between text-[10.5px] text-zinc-500 mb-1">
                      <span className="uppercase tracking-wider font-medium">Hours</span>
                      <span className={`tabular-nums font-medium ${overBudget ? 'text-red-600' : 'text-zinc-700'}`}>
                        {hoursSpent}h{hoursEstimated ? ` / ${hoursEstimated}h` : ''}
                      </span>
                    </div>
                    <div className="h-1 rounded-full bg-zinc-100 overflow-hidden">
                      <div className={`h-full ${progressTone} transition-all duration-300`} style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>
                )}
              </Link>
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); duplicateRequest(item.id) }}
                disabled={duplicatingId === item.id}
                className="absolute top-0 right-0 p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                title="Duplicate this request as a fresh Submitted ticket"
                aria-label="Duplicate request"
              >
                {duplicatingId === item.id ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                    <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="9" y="9" width="11" height="11" rx="2" />
                    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                  </svg>
                )}
              </button>
              </div>
            )
          }}
        />

        {/* Empty state for when filters leave nothing */}
        {filtered.length === 0 && (
          <div className="rounded-2xl bg-white ring-1 ring-zinc-200/80 py-16 text-center">
            <div className="text-4xl mb-3 opacity-30">🎨</div>
            <div className="text-sm font-medium text-zinc-900">No design requests match</div>
            <div className="text-xs text-zinc-500 mt-1">
              {search ? 'Try a different search term' : 'Switch tabs or create a new request'}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
