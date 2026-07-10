'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface Venue { id: string; name: string }

interface TicketRow {
  id: string
  ticket_number: number
  title: string
  venue_name: string
  event_name: string | null
  category: string | null
  priority: string
  status: string
  source: string
  assigned_to_name: string | null
  created_by_name: string | null
  created_at: string
  resolved_at: string | null
  resolution_hours: number | null
  merged_into_ticket_number: number | null
}

interface Payload {
  venue_name: string | null
  total: number
  by_status: Record<string, number>
  avg_resolution_hours: number | null
  merged_excluded: number
  tickets: TicketRow[]
}

const STATUS_TABS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Open' },
  { key: 'new', label: 'New' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'closed', label: 'Closed' },
]

const statusStyle: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-amber-50 text-amber-700',
  on_hold: 'bg-zinc-100 text-zinc-600',
  escalated: 'bg-red-50 text-red-700',
  closed: 'bg-emerald-50 text-emerald-700',
}

const priorityStyle: Record<string, string> = {
  critical: 'text-red-700 font-semibold',
  high: 'text-orange-700 font-medium',
  medium: 'text-zinc-700',
  low: 'text-zinc-400',
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TicketsDetailReport() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [venueId, setVenueId] = useState('')
  // Empty date bounds = all time. This report exists to show everything.
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState('all')
  const [includeMerged, setIncludeMerged] = useState(false)
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)

  // Hydrate venue from ?venue_id= (drill-down from Tickets by Venue).
  // window over useSearchParams() to avoid the Suspense-boundary requirement,
  // matching app/tickets/page.tsx.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('venue_id')) setVenueId(sp.get('venue_id')!)
    if (sp.get('status')) setStatus(sp.get('status')!)
    if (sp.get('from')) setFrom(sp.get('from')!)
    if (sp.get('to')) setTo(sp.get('to')!)
  }, [])

  useEffect(() => {
    fetch('/api/venues')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setVenues((d.venues || []).sort((a: Venue, b: Venue) => a.name.localeCompare(b.name))) })
      .catch(() => {})
  }, [])

  const buildQuery = useCallback(() => {
    const qs = new URLSearchParams({ status })
    if (venueId) qs.set('venue_id', venueId)
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
    if (includeMerged) qs.set('include_merged', '1')
    return qs
  }, [venueId, from, to, status, includeMerged])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/reports/tickets-detail?${buildQuery()}`)
      if (r.ok) setData(await r.json())
    } finally { setLoading(false) }
  }, [buildQuery])

  useEffect(() => { load() }, [load])

  // Server-side CSV so the file holds the full result set, not just what's rendered.
  const exportCsv = () => {
    const qs = buildQuery()
    qs.set('format', 'csv')
    window.location.href = `/api/reports/tickets-detail?${qs}`
  }

  const tickets = data?.tickets || []
  const openCount = data ? data.total - (data.by_status.closed || 0) : 0
  const scopeLabel = venueId ? (data?.venue_name || 'venue') : 'all venues'
  const rangeLabel = !from && !to ? 'All time' : `${from || 'start'} → ${to || 'today'}`

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 py-2">
        <div className="print:hidden">
          <Link href="/reports" className="text-xs text-zinc-400 hover:text-zinc-700">← All reports</Link>
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">All Tickets</h1>
          <p className="text-sm text-zinc-500">
            Every ticket for {scopeLabel} — open and closed. {rangeLabel}.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-end gap-3 flex-wrap print:hidden">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">Venue</label>
            <select value={venueId} onChange={e => setVenueId(e.target.value)}
              className="rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm bg-white min-w-[220px]">
              <option value="">All Venues</option>
              {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">Created from</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm bg-white" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">to</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm bg-white" />
          </div>
          {(from || to) && (
            <button onClick={() => { setFrom(''); setTo('') }}
              className="px-3 py-2 rounded-lg ring-1 ring-zinc-200 bg-white text-xs font-medium hover:bg-zinc-50">
              All time
            </button>
          )}
          <button onClick={exportCsv} disabled={!tickets.length}
            className="px-3 py-2 rounded-lg bg-[#0A52EF] text-white text-xs font-semibold hover:bg-[#0840C0] disabled:opacity-50">
            Export CSV
          </button>
          <button onClick={() => window.print()} disabled={!tickets.length}
            className="px-3 py-2 rounded-lg ring-1 ring-zinc-200 bg-white text-xs font-medium hover:bg-zinc-50 disabled:opacity-50">
            Print / PDF
          </button>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 flex-wrap print:hidden">
          {STATUS_TABS.map(tab => (
            <button key={tab.key} onClick={() => setStatus(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                status === tab.key ? 'bg-[#0A52EF] text-white' : 'bg-white ring-1 ring-zinc-200 text-zinc-600 hover:bg-zinc-50'
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'TOTAL TICKETS', value: data?.total ?? 0 },
            { label: 'CLOSED', value: data?.by_status.closed ?? 0 },
            { label: 'STILL OPEN', value: openCount },
            { label: 'AVG RESOLUTION', value: data?.avg_resolution_hours != null ? `${data.avg_resolution_hours}h` : '—' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl ring-1 ring-zinc-200 bg-white px-5 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{s.label}</div>
              <div className="text-2xl font-semibold text-zinc-900 mt-1">{s.value}</div>
            </div>
          ))}
        </div>

        {data && data.merged_excluded > 0 && (
          <div className="text-xs text-zinc-500 flex items-center gap-2">
            <span>
              {data.merged_excluded} merged duplicate{data.merged_excluded === 1 ? '' : 's'} excluded from this count.
            </span>
            <button onClick={() => setIncludeMerged(!includeMerged)}
              className="text-[#0A52EF] hover:underline print:hidden">
              {includeMerged ? 'Hide them' : 'Include them'}
            </button>
          </div>
        )}

        {/* Table */}
        <div className="rounded-2xl ring-1 ring-zinc-200 bg-white overflow-hidden">
          {loading ? <Skeleton className="h-96 w-full" /> : tickets.length === 0 ? (
            <div className="p-12 text-center text-sm text-zinc-400">No tickets match these filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="text-left px-4 py-3">#</th>
                    <th className="text-left px-4 py-3">Title</th>
                    {!venueId && <th className="text-left px-4 py-3">Venue</th>}
                    <th className="text-left px-4 py-3">Category</th>
                    <th className="text-left px-4 py-3">Priority</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Assigned</th>
                    <th className="text-left px-4 py-3">Created</th>
                    <th className="text-left px-4 py-3">Resolved</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.map(t => (
                    <tr key={t.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                      <td className="px-4 py-3 tabular-nums text-zinc-500">
                        <Link href={`/tickets/${t.id}`} className="hover:text-[#0A52EF] hover:underline">
                          {t.ticket_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium text-zinc-900 max-w-md">
                        <Link href={`/tickets/${t.id}`} className="hover:text-[#0A52EF] hover:underline">
                          {t.title}
                        </Link>
                        {t.merged_into_ticket_number && (
                          <span className="ml-2 text-[10px] text-zinc-400">merged → #{t.merged_into_ticket_number}</span>
                        )}
                      </td>
                      {!venueId && <td className="px-4 py-3 text-zinc-600">{t.venue_name}</td>}
                      <td className="px-4 py-3 text-zinc-600 capitalize">{t.category || '—'}</td>
                      <td className={`px-4 py-3 capitalize ${priorityStyle[t.priority] || 'text-zinc-700'}`}>{t.priority}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle[t.status] || 'bg-zinc-100 text-zinc-600'}`}>
                          {t.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-zinc-600">{t.assigned_to_name || <span className="text-zinc-300">Unassigned</span>}</td>
                      <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">{fmtDate(t.created_at)}</td>
                      <td className="px-4 py-3 text-zinc-500 whitespace-nowrap">{fmtDate(t.resolved_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
