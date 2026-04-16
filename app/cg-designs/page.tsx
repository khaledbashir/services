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
  job_title: string
  notes: string | null
  due_date: string | null
  status: string
  venue_name: string | null
  venue_id: string | null
  designer_name: string | null
  designer_id: string | null
  created_date: string
}

interface Venue { id: string; name: string }
interface Staff { id: string; full_name: string }

const statusColumns = [
  { key: 'request_submitted', label: 'Submitted' },
  { key: 'in_queue', label: 'In Queue' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'review', label: 'Review' },
  { key: 'revisions', label: 'Revisions' },
  { key: 'approved', label: 'Approved' },
  { key: 'posted', label: 'Posted' },
] as const

const statusTone: Record<string, string> = {
  request_submitted: 'bg-sky-50 text-sky-700',
  in_queue: 'bg-violet-50 text-violet-700',
  in_progress: 'bg-amber-50 text-amber-700',
  review: 'bg-blue-50 text-blue-700',
  revisions: 'bg-orange-50 text-orange-700',
  approved: 'bg-emerald-50 text-emerald-700',
  posted: 'bg-zinc-100 text-zinc-600',
}

export default function CgDesignsPage() {
  const [items, setItems] = useState<CgDesignRequest[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    venue_id: '',
    league: '',
    team_name: '',
    job_title: '',
    notes: '',
    designer_id: '',
    due_date: '',
  })

  const fetchData = async () => {
    try {
      const [cg, vd, sd] = await Promise.all([
        fetch('/api/cg-designs').then((r) => r.json()),
        fetch('/api/venues').then((r) => r.json()),
        fetch('/api/staff').then((r) => r.json()),
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
          designer_id: formData.designer_id || null,
          due_date: formData.due_date || null,
        }),
      })
      if (res.ok) {
        setFormData({
          venue_id: '',
          league: '',
          team_name: '',
          job_title: '',
          notes: '',
          designer_id: '',
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
    return items.filter((item) => {
      const matchesSearch =
        !q ||
        item.job_title.toLowerCase().includes(q) ||
        (item.team_name || '').toLowerCase().includes(q) ||
        (item.league || '').toLowerCase().includes(q) ||
        (item.venue_name || '').toLowerCase().includes(q) ||
        (item.designer_name || '').toLowerCase().includes(q)

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && item.status !== 'posted') ||
        item.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [items, search, statusFilter])

  const counts: Record<string, number> = {
    active: items.filter((item) => item.status !== 'posted').length,
    all: items.length,
  }
  for (const status of statusColumns) counts[status.key] = items.filter((item) => item.status === status.key).length

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
            <h1 className="text-xl font-semibold text-zinc-900">CG Design Requests</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{counts.active} active · {counts.all} total</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors">
            {showForm ? 'Cancel' : 'New CG Request'}
          </button>
        </div>

        {showForm && (
          <div className="border border-zinc-200 bg-zinc-50 p-6">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">Create CG Design Request</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Job Title *</label>
                <input type="text" value={formData.job_title} onChange={(e) => setFormData((prev) => ({ ...prev, job_title: e.target.value }))} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400 outline-none bg-white" required />
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Venue</label>
                  <select value={formData.venue_id} onChange={(e) => setFormData((prev) => ({ ...prev, venue_id: e.target.value }))} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white">
                    <option value="">Select venue...</option>
                    {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">League</label>
                  <input type="text" value={formData.league} onChange={(e) => setFormData((prev) => ({ ...prev, league: e.target.value }))} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Team Name</label>
                  <input type="text" value={formData.team_name} onChange={(e) => setFormData((prev) => ({ ...prev, team_name: e.target.value }))} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Due Date</label>
                  <input type="date" value={formData.due_date} onChange={(e) => setFormData((prev) => ({ ...prev, due_date: e.target.value }))} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Designer</label>
                  <select value={formData.designer_id} onChange={(e) => setFormData((prev) => ({ ...prev, designer_id: e.target.value }))} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white">
                    <option value="">Unassigned</option>
                    {staff.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Notes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))} rows={4} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none resize-none bg-white" />
              </div>
              <button type="submit" disabled={submitting} className="px-5 py-2 bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50">
                {submitting ? 'Creating...' : 'Create CG Request'}
              </button>
            </form>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 border-b border-zinc-200">
          <div className="flex items-center gap-0 -mb-px overflow-x-auto">
            {[{ key: 'active', label: 'Active' }, ...statusColumns, { key: 'all', label: 'All' }].map((tab) => {
              const isActive = statusFilter === tab.key
              return (
                <button key={tab.key} onClick={() => setStatusFilter(tab.key)} className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${isActive ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-700 hover:border-zinc-300'}`}>
                  {tab.label}
                  <span className={`ml-1.5 text-xs tabular-nums ${isActive ? 'text-zinc-900' : 'text-zinc-400'}`}>{counts[tab.key]}</span>
                </button>
              )
            })}
          </div>
          <div className="pb-2">
            <input type="text" placeholder="Search CG requests..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-72 border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-400 bg-white" />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 2xl:grid-cols-7 gap-4">
          {statusColumns.map((column) => {
            const columnItems = filtered.filter((item) => item.status === column.key)
            return (
              <div key={column.key} className="border border-zinc-200 bg-zinc-50 min-h-[22rem]">
                <div className="px-4 py-3 border-b border-zinc-200 bg-white flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900">{column.label}</h2>
                    <p className="text-xs text-zinc-400 mt-0.5">{columnItems.length} requests</p>
                  </div>
                </div>
                <div className="p-3 space-y-3">
                  {columnItems.length === 0 && <div className="border border-dashed border-zinc-200 bg-white px-3 py-5 text-center text-xs text-zinc-400">No requests</div>}
                  {columnItems.map((item) => (
                    <Link key={item.id} href={`/cg-designs/${item.id}`} className="block border border-zinc-200 bg-white p-3 hover:border-zinc-300 hover:shadow-sm transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-medium text-zinc-900 leading-snug">{item.job_title}</h3>
                        <span className={`px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${statusTone[item.status] || 'bg-zinc-100 text-zinc-600'}`}>{column.label}</span>
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-zinc-500">
                        <p>{item.team_name || 'No team'}</p>
                        <p>{item.league || 'No league'}</p>
                        <p>{item.venue_name || 'No venue linked'}</p>
                        <p>{item.designer_name || 'No designer assigned'}</p>
                        {item.due_date && <p>Due {formatDate(item.due_date)}</p>}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </DashboardLayout>
  )
}
