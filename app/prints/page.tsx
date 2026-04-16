'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { formatDate } from '@/lib/format-date'

interface PrintRequest {
  id: string
  client_name: string | null
  job_title: string
  notes: string | null
  shipping_info: string | null
  ship_date: string | null
  arrival_date: string | null
  britten_cost: number | null
  anc_cost: number | null
  tracking_number: string | null
  assignee_name: string | null
  assignee_id: string | null
  venue_name: string | null
  venue_id: string | null
  status: string
  created_date: string
}

interface Venue { id: string; name: string }
interface Staff { id: string; full_name: string }

const statusColumns = [
  { key: 'new_request', label: 'New Request' },
  { key: 'awaiting_layout', label: 'Awaiting Layout' },
  { key: 'awaiting_approval', label: 'Awaiting Approval' },
  { key: 'approved', label: 'Approved' },
  { key: 'in_production', label: 'In Production' },
  { key: 'shipped', label: 'Shipped' },
  { key: 'invoiced', label: 'Invoiced' },
] as const

const statusTone: Record<string, string> = {
  new_request: 'bg-sky-50 text-sky-700',
  awaiting_layout: 'bg-violet-50 text-violet-700',
  awaiting_approval: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  in_production: 'bg-orange-50 text-orange-700',
  shipped: 'bg-blue-50 text-blue-700',
  invoiced: 'bg-zinc-100 text-zinc-600',
}

export default function PrintsPage() {
  const [printRequests, setPrintRequests] = useState<PrintRequest[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('active')
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    venue_id: '',
    client_name: '',
    job_title: '',
    notes: '',
    shipping_info: '',
    ship_date: '',
    arrival_date: '',
    britten_cost: '',
    anc_cost: '',
    tracking_number: '',
    assignee_id: '',
  })

  const fetchData = async () => {
    try {
      const [pr, vd, sd] = await Promise.all([
        fetch('/api/print-requests').then((r) => r.json()),
        fetch('/api/venues').then((r) => r.json()),
        fetch('/api/staff').then((r) => r.json()),
      ])
      setPrintRequests(pr.print_requests || [])
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
    if (!formData.job_title.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/print-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          venue_id: formData.venue_id || null,
          ship_date: formData.ship_date || null,
          arrival_date: formData.arrival_date || null,
          assignee_id: formData.assignee_id || null,
          britten_cost: formData.britten_cost ? Number(formData.britten_cost) : null,
          anc_cost: formData.anc_cost ? Number(formData.anc_cost) : null,
        }),
      })
      if (res.ok) {
        setFormData({
          venue_id: '',
          client_name: '',
          job_title: '',
          notes: '',
          shipping_info: '',
          ship_date: '',
          arrival_date: '',
          britten_cost: '',
          anc_cost: '',
          tracking_number: '',
          assignee_id: '',
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
    return printRequests.filter((item) => {
      const matchesSearch =
        !q ||
        item.job_title.toLowerCase().includes(q) ||
        (item.client_name || '').toLowerCase().includes(q) ||
        (item.venue_name || '').toLowerCase().includes(q) ||
        (item.assignee_name || '').toLowerCase().includes(q) ||
        (item.tracking_number || '').toLowerCase().includes(q)

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && item.status !== 'invoiced') ||
        item.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [printRequests, search, statusFilter])

  const counts: Record<string, number> = {
    active: printRequests.filter((item) => item.status !== 'invoiced').length,
    all: printRequests.length,
  }

  for (const status of statusColumns) {
    counts[status.key] = printRequests.filter((item) => item.status === status.key).length
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
            <h1 className="text-xl font-semibold text-zinc-900">Print Requests</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {counts.active} active · {counts.all} total
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors"
          >
            {showForm ? 'Cancel' : 'New Print Request'}
          </button>
        </div>

        {showForm && (
          <div className="border border-zinc-200 bg-zinc-50 p-6">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">Create Print Request</h3>
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
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Client</label>
                  <input
                    type="text"
                    value={formData.client_name}
                    onChange={(e) => setFormData((prev) => ({ ...prev, client_name: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Ship Date</label>
                  <input
                    type="date"
                    value={formData.ship_date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, ship_date: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Arrival Date</label>
                  <input
                    type="date"
                    value={formData.arrival_date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, arrival_date: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Britten Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.britten_cost}
                    onChange={(e) => setFormData((prev) => ({ ...prev, britten_cost: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">ANC Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.anc_cost}
                    onChange={(e) => setFormData((prev) => ({ ...prev, anc_cost: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Tracking Number</label>
                  <input
                    type="text"
                    value={formData.tracking_number}
                    onChange={(e) => setFormData((prev) => ({ ...prev, tracking_number: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">Assignee</label>
                  <select
                    value={formData.assignee_id}
                    onChange={(e) => setFormData((prev) => ({ ...prev, assignee_id: e.target.value }))}
                    className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none bg-white"
                  >
                    <option value="">Unassigned</option>
                    {staff.map((person) => (
                      <option key={person.id} value={person.id}>{person.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Shipping Info</label>
                <textarea
                  value={formData.shipping_info}
                  onChange={(e) => setFormData((prev) => ({ ...prev, shipping_info: e.target.value }))}
                  rows={3}
                  className="w-full border border-zinc-300 px-3 py-2 text-sm focus:ring-1 focus:ring-zinc-400 outline-none resize-none bg-white"
                />
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
                {submitting ? 'Creating...' : 'Create Print Request'}
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
              placeholder="Search print requests..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72 border border-zinc-300 px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-zinc-400 bg-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-4 2xl:grid-cols-7 gap-4">
          {statusColumns.map((column) => {
            const items = filtered.filter((item) => item.status === column.key)
            return (
              <div key={column.key} className="border border-zinc-200 bg-zinc-50 min-h-[22rem]">
                <div className="px-4 py-3 border-b border-zinc-200 bg-white flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900">{column.label}</h2>
                    <p className="text-xs text-zinc-400 mt-0.5">{items.length} requests</p>
                  </div>
                </div>
                <div className="p-3 space-y-3">
                  {items.length === 0 && (
                    <div className="border border-dashed border-zinc-200 bg-white px-3 py-5 text-center text-xs text-zinc-400">
                      No requests
                    </div>
                  )}
                  {items.map((item) => (
                    <Link
                      key={item.id}
                      href={`/prints/${item.id}`}
                      className="block border border-zinc-200 bg-white p-3 hover:border-zinc-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-medium text-zinc-900 leading-snug">{item.job_title}</h3>
                        <span className={`px-2 py-1 text-[10px] font-medium uppercase tracking-wide ${statusTone[item.status] || 'bg-zinc-100 text-zinc-600'}`}>
                          {column.label}
                        </span>
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-zinc-500">
                        <p>{item.client_name || 'No client'}</p>
                        <p>{item.venue_name || 'No venue linked'}</p>
                        <p>{item.assignee_name || 'No assignee'}</p>
                        {item.arrival_date && <p>Arrival {formatDate(item.arrival_date)}</p>}
                        {item.tracking_number && <p>Tracking {item.tracking_number}</p>}
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
