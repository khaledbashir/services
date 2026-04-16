'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
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
  const [designRequests, setDesignRequests] = useState<DesignRequest[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
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
  })

  const fetchData = async () => {
    try {
      const [dr, vd, sd] = await Promise.all([
        fetch('/api/design-requests').then((r) => r.json()),
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
    fetchData()
  }, [])

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

      return matchesSearch && matchesStatus
    })
  }, [designRequests, search, statusFilter])

  const counts: Record<string, number> = {
    active: designRequests.filter((item) => item.status !== 'done').length,
    all: designRequests.length,
  }

  for (const status of statusColumns) {
    counts[status.key] = designRequests.filter((item) => item.status === status.key).length
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-56 w-full" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-80 w-full" />
            <Skeleton className="h-80 w-full" />
            <Skeleton className="h-80 w-full" />
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Design Requests</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {counts.active} active · {counts.all} total
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors"
          >
            {showForm ? 'Cancel' : 'New Design Request'}
          </button>
        </div>

        {showForm && (
          <div className="border border-zinc-200 bg-zinc-50 p-6">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">Create Design Request</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Job Title *</label>
                <input
                  type="text"
                  value={formData.job_title}
                  onChange={(e) => setFormData((prev) => ({ ...prev, job_title: e.target.value }))}
                  className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400 outline-none bg-white"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Venue</label>
                  <select
                    value={formData.venue_id}
                    onChange={(e) => setFormData((prev) => ({ ...prev, venue_id: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  >
                    <option value="">Select venue...</option>
                    {venues.map((venue) => (
                      <option key={venue.id} value={venue.id}>{venue.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Company</label>
                  <input
                    type="text"
                    value={formData.company_name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, company_name: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Tri-Code</label>
                  <input
                    type="text"
                    value={formData.tricode}
                    onChange={(e) => setFormData((prev) => ({ ...prev, tricode: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Designer</label>
                  <select
                    value={formData.designer_id}
                    onChange={(e) => setFormData((prev) => ({ ...prev, designer_id: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  >
                    <option value="">Unassigned</option>
                    {staff.map((person) => (
                      <option key={person.id} value={person.id}>{person.full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Enterprise Contact</label>
                  <select
                    value={formData.enterprise_contact_id}
                    onChange={(e) => setFormData((prev) => ({ ...prev, enterprise_contact_id: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  >
                    <option value="">Unassigned</option>
                    {staff.map((person) => (
                      <option key={person.id} value={person.id}>{person.full_name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, due_date: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Boards Requested</label>
                  <input
                    type="text"
                    value={formData.boards_requested}
                    onChange={(e) => setFormData((prev) => ({ ...prev, boards_requested: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Sizes Requested</label>
                  <input
                    type="text"
                    value={formData.sizes_requested}
                    onChange={(e) => setFormData((prev) => ({ ...prev, sizes_requested: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Hours Estimated</label>
                  <input
                    type="number"
                    step="0.25"
                    value={formData.hours_estimated}
                    onChange={(e) => setFormData((prev) => ({ ...prev, hours_estimated: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  rows={4}
                  className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none resize-none bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2 bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                {submitting ? 'Creating...' : 'Create Design Request'}
              </button>
            </form>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 border-b border-zinc-200">
          <div className="flex items-center gap-0 -mb-px overflow-x-auto">
            {[{ key: 'active', label: 'Active' }, ...statusColumns, { key: 'all', label: 'All' }].map((tab) => {
              const isActive = statusFilter === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'border-zinc-900 text-zinc-900'
                      : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'
                  }`}
                >
                  {tab.label}
                  <span className={`ml-1.5 text-xs tabular-nums ${isActive ? 'text-zinc-900' : 'text-zinc-400'}`}>
                    {counts[tab.key]}
                  </span>
                </button>
              )
            })}
          </div>
          <div className="pb-2">
            <input
              type="text"
              placeholder="Search design requests..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72 border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
            />
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
            const progressTone =
              progressPct >= 75 ? 'bg-red-500' : progressPct >= 50 ? 'bg-amber-500' : 'bg-emerald-500'

            return (
              <Link href={`/designs/${item.id}`} className="block space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium text-zinc-900 leading-snug">{item.job_title}</h3>
                  <span className={`px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${statusTone[item.status] || 'bg-zinc-100 text-zinc-600'}`}>
                    {statusColumns.find((column) => column.key === item.status)?.label || item.status}
                  </span>
                </div>
                <div className="space-y-1.5 text-xs text-zinc-500">
                  <p>{item.company_name || 'No company'}</p>
                  <p>{item.venue_name || 'No venue linked'}</p>
                  <p>{item.designer_name || 'No designer assigned'}</p>
                  {item.due_date && <p>Due {formatDate(item.due_date)}</p>}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>Hours</span>
                    <span>{hoursSpent}h{hoursEstimated ? ` / ${hoursEstimated}h` : ''}</span>
                  </div>
                  <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                    <div className={`h-full ${progressTone}`} style={{ width: `${progressPct}%` }} />
                  </div>
                </div>
              </Link>
            )
          }}
        />
      </div>
    </DashboardLayout>
  )
}
