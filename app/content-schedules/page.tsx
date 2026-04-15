'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface ContentSchedule {
  id: string
  company_name: string | null
  content_name: string
  launch_date: string | null
  end_date: string | null
  files_ready: boolean
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
  { key: 'in_queue', label: 'In Queue' },
  { key: 'scheduled_to_launch', label: 'Scheduled To Launch' },
  { key: 'content_live', label: 'Content Live' },
  { key: 'confirmed_with_client', label: 'Confirmed With Client' },
] as const

const statusTone: Record<string, string> = {
  in_queue: 'bg-violet-50 text-violet-700',
  scheduled_to_launch: 'bg-amber-50 text-amber-700',
  content_live: 'bg-blue-50 text-blue-700',
  confirmed_with_client: 'bg-emerald-50 text-emerald-700',
}

export default function ContentSchedulesPage() {
  const [items, setItems] = useState<ContentSchedule[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
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
    files_ready: false,
    notes: '',
  })

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
          operator_id: formData.operator_id || null,
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
          files_ready: false,
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
      return matchesSearch && matchesStatus
    })
  }, [items, search, statusFilter])

  const counts: Record<string, number> = { all: items.length }
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
            <h1 className="text-xl font-semibold text-zinc-900">Content Schedules</h1>
            <p className="text-sm text-zinc-500 mt-0.5">{counts.all} total schedules</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors">
            {showForm ? 'Cancel' : 'New Content Schedule'}
          </button>
        </div>

        {showForm && (
          <div className="border border-zinc-200 bg-zinc-50 p-6">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">Create Content Schedule</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Content Name *</label>
                <input type="text" value={formData.content_name} onChange={(e) => setFormData((prev) => ({ ...prev, content_name: e.target.value }))} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 focus:border-zinc-400 outline-none bg-white" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
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
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Launch Date</label>
                  <input type="date" value={formData.launch_date} onChange={(e) => setFormData((prev) => ({ ...prev, launch_date: e.target.value }))} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">End Date</label>
                  <input type="date" value={formData.end_date} onChange={(e) => setFormData((prev) => ({ ...prev, end_date: e.target.value }))} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Operator</label>
                  <select value={formData.operator_id} onChange={(e) => setFormData((prev) => ({ ...prev, operator_id: e.target.value }))} className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white">
                    <option value="">Unassigned</option>
                    {staff.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}
                  </select>
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
              <button type="submit" disabled={submitting} className="px-5 py-2 bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50">
                {submitting ? 'Creating...' : 'Create Content Schedule'}
              </button>
            </form>
          </div>
        )}

        <div className="flex items-center justify-between gap-4 border-b border-zinc-200">
          <div className="flex items-center gap-0 -mb-px overflow-x-auto">
            {[...statusColumns, { key: 'all', label: 'All' }].map((tab) => {
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
            <input type="text" placeholder="Search content schedules..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-72 border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-400 bg-white" />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
          {statusColumns.map((column) => {
            const columnItems = filtered.filter((item) => item.status === column.key)
            return (
              <div key={column.key} className="border border-zinc-200 bg-zinc-50 min-h-[22rem]">
                <div className="px-4 py-3 border-b border-zinc-200 bg-white flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900">{column.label}</h2>
                    <p className="text-xs text-zinc-400 mt-0.5">{columnItems.length} schedules</p>
                  </div>
                </div>
                <div className="p-3 space-y-3">
                  {columnItems.length === 0 && <div className="border border-dashed border-zinc-200 bg-white px-3 py-5 text-center text-xs text-zinc-400">No schedules</div>}
                  {columnItems.map((item) => (
                    <Link key={item.id} href={`/content-schedules/${item.id}`} className="block border border-zinc-200 bg-white p-3 hover:border-zinc-300 hover:shadow-sm transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-medium text-zinc-900 leading-snug">{item.content_name}</h3>
                        <span className={`px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${statusTone[item.status] || 'bg-zinc-100 text-zinc-600'}`}>{column.label}</span>
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-zinc-500">
                        <p>{item.company_name || 'No company'}</p>
                        <p>{item.venue_name || 'No venue linked'}</p>
                        <p>{item.operator_name || 'No operator assigned'}</p>
                        {item.launch_date && <p>Launch {item.launch_date}</p>}
                        <p>{item.files_ready ? 'Files ready' : 'Files pending'}</p>
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
