'use client'

// Design & Creative department report (Charlie 2026-07-14): hours used per
// client, time spent, request volume — across both the design and CG
// pipelines. Per-client rows expand into the individual requests behind the
// numbers. Same filter/CSV/print idiom as /reports/tickets-detail.

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface RequestDetail {
  id: string
  source: 'design' | 'cg'
  title: string
  status: string
  designer: string | null
  venue_name: string | null
  hours: number
  created_at: string
  due_date: string | null
}

interface ClientRow {
  client: string
  tricode: string | null
  total: number
  hours: number
  designers: number
  by_status: Record<string, number>
  requests: RequestDetail[]
}

interface Payload {
  from: string | null
  to: string | null
  totals: { requests: number; hours: number; clients: number; designers: number }
  clients: ClientRow[]
}

const statusStyle: Record<string, string> = {
  done: 'bg-emerald-50 text-emerald-700',
  approved: 'bg-emerald-50 text-emerald-700',
  request_submitted: 'bg-amber-50 text-amber-700',
  in_queue: 'bg-amber-50 text-amber-700',
  in_progress: 'bg-sky-50 text-sky-700',
  in_qc: 'bg-violet-50 text-violet-700',
  client_review: 'bg-violet-50 text-violet-700',
  review: 'bg-violet-50 text-violet-700',
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysAgoIso(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

export default function DesignCreativeReport() {
  const [from, setFrom] = useState(() => daysAgoIso(90))
  const [to, setTo] = useState('')
  const [filter, setFilter] = useState('')
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const buildQuery = useCallback(() => {
    const qs = new URLSearchParams()
    if (from) qs.set('from', from)
    if (to) qs.set('to', to)
    if (!from && !to) qs.set('all', '1')
    return qs
  }, [from, to])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/reports/design-creative?${buildQuery()}`)
      if (r.ok) setData(await r.json())
    } finally { setLoading(false) }
  }, [buildQuery])

  useEffect(() => { load() }, [load])

  // Server-side CSV so the file holds the full result set (one line per request).
  const exportCsv = () => {
    const qs = buildQuery()
    qs.set('format', 'csv')
    window.location.href = `/api/reports/design-creative?${qs}`
  }

  const toggle = (client: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(client)) next.delete(client)
      else next.add(client)
      return next
    })
  }

  const q = filter.trim().toLowerCase()
  const clients = data?.clients || []
  const visible = !q ? clients : clients.filter(c =>
    c.client.toLowerCase().includes(q) || (c.tricode || '').toLowerCase().includes(q)
  )

  const rangeLabel = !from && !to ? 'All time' : `${from || 'start'} → ${to || 'today'}`

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-6 py-2">
        <div className="print:hidden">
          <Link href="/reports" className="text-xs text-zinc-400 hover:text-zinc-700">← All reports</Link>
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Design &amp; Creative</h1>
          <p className="text-sm text-zinc-500">
            Requests and hours logged per client across design and CG work. {rangeLabel}.
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-end gap-3 flex-wrap print:hidden">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">Requested from</label>
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
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">Client</label>
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter by client or tri-code…"
              className="rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm bg-white min-w-[220px]" />
          </div>
          <button onClick={exportCsv} disabled={!clients.length}
            className="px-3 py-2 rounded-lg bg-[#0A52EF] text-white text-xs font-semibold hover:bg-[#0840C0] disabled:opacity-50">
            Export CSV
          </button>
          <button onClick={() => window.print()} disabled={!clients.length}
            className="px-3 py-2 rounded-lg ring-1 ring-zinc-200 bg-white text-xs font-medium hover:bg-zinc-50 disabled:opacity-50">
            Print / PDF
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'TOTAL REQUESTS', value: data?.totals.requests ?? 0 },
            { label: 'HOURS LOGGED', value: data ? data.totals.hours.toFixed(1) : 0 },
            { label: 'ACTIVE CLIENTS', value: data?.totals.clients ?? 0 },
            { label: 'DESIGNERS', value: data?.totals.designers ?? 0 },
          ].map(s => (
            <div key={s.label} className="rounded-2xl ring-1 ring-zinc-200 bg-white px-5 py-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{s.label}</div>
              <div className="text-2xl font-semibold text-zinc-900 mt-1">{s.value}</div>
            </div>
          ))}
        </div>

        {/* Per-client table */}
        <div className="rounded-2xl ring-1 ring-zinc-200 bg-white overflow-hidden">
          {loading ? <Skeleton className="h-96 w-full" /> : visible.length === 0 ? (
            <div className="p-12 text-center text-sm text-zinc-400">No design activity matches these filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="text-left px-4 py-3">Client</th>
                    <th className="text-right px-4 py-3">Requests</th>
                    <th className="text-right px-4 py-3">Hours</th>
                    <th className="text-right px-4 py-3">Designers</th>
                    <th className="text-left px-4 py-3">Statuses</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(c => {
                    const isOpen = expanded.has(c.client)
                    const topStatuses = Object.entries(c.by_status).sort((a, b) => b[1] - a[1]).slice(0, 3)
                    return (
                      <React.Fragment key={c.client}>
                        <tr onClick={() => toggle(c.client)}
                          className="border-t border-zinc-100 hover:bg-zinc-50 cursor-pointer">
                          <td className="px-4 py-3 font-medium text-zinc-900">
                            <span className="mr-2 inline-block w-3 text-zinc-400">{isOpen ? '▾' : '▸'}</span>
                            {c.client}
                            {c.tricode && (
                              <span className="ml-2 text-[10px] font-mono text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">{c.tricode}</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-zinc-600">{c.total}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-zinc-900 font-medium">{c.hours.toFixed(1)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-zinc-600">{c.designers}</td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5 flex-wrap">
                              {topStatuses.map(([status, n]) => (
                                <span key={status}
                                  className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusStyle[status] || 'bg-zinc-100 text-zinc-600'}`}>
                                  {n} {status.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="border-t border-zinc-100 bg-zinc-50/60">
                            <td colSpan={5} className="px-4 py-3">
                              <table className="w-full text-xs">
                                <thead className="text-[10px] uppercase tracking-wider text-zinc-400">
                                  <tr>
                                    <th className="text-left px-3 py-2">Title</th>
                                    <th className="text-left px-3 py-2">Type</th>
                                    <th className="text-left px-3 py-2">Status</th>
                                    <th className="text-left px-3 py-2">Designer</th>
                                    <th className="text-right px-3 py-2">Hours</th>
                                    <th className="text-left px-3 py-2">Created</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {c.requests.map(req => (
                                    <tr key={`${req.source}-${req.id}`} className="border-t border-zinc-100">
                                      <td className="px-3 py-2 font-medium text-zinc-800 max-w-md">
                                        <Link
                                          href={req.source === 'design' ? `/designs/${req.id}` : `/cg-designs/${req.id}`}
                                          className="hover:text-[#0A52EF] hover:underline"
                                          onClick={e => e.stopPropagation()}
                                        >
                                          {req.title}
                                        </Link>
                                      </td>
                                      <td className="px-3 py-2 text-zinc-500">{req.source === 'cg' ? 'CG' : 'Design'}</td>
                                      <td className="px-3 py-2">
                                        <span className={`inline-flex px-2 py-0.5 rounded-full font-medium ${statusStyle[req.status] || 'bg-zinc-100 text-zinc-600'}`}>
                                          {req.status.replace(/_/g, ' ')}
                                        </span>
                                      </td>
                                      <td className="px-3 py-2 text-zinc-600">{req.designer || <span className="text-zinc-300">Unassigned</span>}</td>
                                      <td className="px-3 py-2 text-right tabular-nums text-zinc-600">{req.hours ? req.hours.toFixed(1) : '—'}</td>
                                      <td className="px-3 py-2 text-zinc-500 whitespace-nowrap">{fmtDate(req.created_at)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
