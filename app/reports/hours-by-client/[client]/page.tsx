'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface RequestRow {
  id: string
  job_title: string
  company_name: string | null
  tricode: string | null
  venue_name: string | null
  status: string | null
  due_date: string | null
  created_at: string | null
  total_hours: number
  designers_worked: number
  entries: number
  first_entry: string | null
  last_entry: string | null
  share_pct: number
}

function defaultFrom(): string {
  const d = new Date(); d.setMonth(d.getMonth() - 3)
  return d.toISOString().slice(0, 10)
}
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function statusLabel(s: string | null): string {
  if (!s) return '—'
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export default function HoursByClientDetail() {
  const params = useParams<{ client: string }>()
  const clientParam = params?.client || ''
  const clientName = decodeURIComponent(clientParam)

  const [from, setFrom] = useState(defaultFrom())
  const [to, setTo] = useState(today())
  const [requests, setRequests] = useState<RequestRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Pre-fill date window from the parent report if it passed ?from=&to=
  useEffect(() => {
    if (typeof window === 'undefined') return
    const sp = new URLSearchParams(window.location.search)
    const f = sp.get('from'); const t = sp.get('to')
    if (f) setFrom(f)
    if (t) setTo(t)
  }, [])

  const load = useCallback(async () => {
    if (!clientParam) return
    setLoading(true)
    try {
      const qs = new URLSearchParams({ from, to })
      const r = await fetch(`/api/reports/hours-by-client/${clientParam}?${qs}`)
      if (!r.ok) return
      const d = await r.json()
      setRequests(d.requests || [])
      setTotal(d.total_hours || 0)
    } finally {
      setLoading(false)
    }
  }, [from, to, clientParam])

  useEffect(() => { load() }, [load])

  const exportCsv = () => {
    const header = ['Job', 'Tri-Code', 'Venue', 'Client', 'Status', 'Hours', 'Share %', 'Designers', 'Entries', 'First Entry', 'Last Entry', 'Due', 'Created']
    const rows = requests.map(r => [
      r.job_title, r.tricode || '', r.venue_name || '', r.company_name || '', statusLabel(r.status), r.total_hours, r.share_pct,
      r.designers_worked, r.entries,
      r.first_entry || '', r.last_entry || '',
      r.due_date || '', r.created_at?.slice(0, 10) || '',
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hours-${clientName}-${from}-to-${to}.csv`.replace(/[^\w.-]+/g, '_')
    a.click()
    URL.revokeObjectURL(url)
  }

  const parentQs = new URLSearchParams({ from, to }).toString()

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6 py-2">
        <div>
          <Link href={`/reports/hours-by-client?${parentQs}`} className="text-xs text-zinc-400 hover:text-zinc-700">← Hours by Tri-Code</Link>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900">{clientName}</h1>
          <p className="text-sm text-zinc-500">Design requests with logged hours for this venue tri-code.</p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">From</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm bg-white" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">To</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm bg-white" />
          </div>
          <button onClick={load} className="px-3 py-2 rounded-lg bg-[#0A52EF] text-white text-xs font-semibold hover:bg-[#0840C0]">
            Run
          </button>
          <button onClick={exportCsv} disabled={!requests.length}
            className="px-3 py-2 rounded-lg ring-1 ring-zinc-200 bg-white text-xs font-medium hover:bg-zinc-50 disabled:opacity-50">
            Export CSV
          </button>
          <div className="ml-auto text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">TOTAL HOURS</div>
            <div className="text-2xl font-semibold text-zinc-900">{total.toFixed(2)}</div>
          </div>
        </div>

        <div className="rounded-2xl ring-1 ring-zinc-200 bg-white overflow-hidden">
          {loading ? <Skeleton className="h-96 w-full" /> : requests.length === 0 ? (
            <div className="p-12 text-center text-sm text-zinc-400">No time entries for {clientName} in this window.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="text-left px-5 py-3">Job</th>
                  <th className="text-left px-5 py-3">Venue</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-right px-5 py-3">Hours</th>
                  <th className="text-right px-5 py-3">Share</th>
                  <th className="text-right px-5 py-3">Designers</th>
                  <th className="text-right px-5 py-3">Entries</th>
                  <th className="text-right px-5 py-3">Window</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-100 hover:bg-zinc-50">
                    <td className="px-5 py-3 font-medium text-zinc-900">
                      <Link href={`/designs/${r.id}`} className="text-[#0A52EF] hover:underline">
                        {r.job_title}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-zinc-600">
                      <div>{r.venue_name || r.company_name || '—'}</div>
                      {r.tricode && <div className="mt-0.5 font-mono text-[11px] text-zinc-400">{r.tricode}</div>}
                    </td>
                    <td className="px-5 py-3 text-zinc-600">{statusLabel(r.status)}</td>
                    <td className="px-5 py-3 text-right font-semibold text-zinc-900">{r.total_hours.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-2 justify-end">
                        <div className="w-16 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#0A52EF]" style={{ width: `${Math.min(100, r.share_pct)}%` }} />
                        </div>
                        <span className="text-xs text-zinc-500 tabular-nums">{r.share_pct}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-zinc-600">{r.designers_worked}</td>
                    <td className="px-5 py-3 text-right text-zinc-600">{r.entries}</td>
                    <td className="px-5 py-3 text-right text-xs text-zinc-400 font-mono">
                      {r.first_entry?.slice(0, 10)} → {r.last_entry?.slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
