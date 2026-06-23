'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface ClientRow {
  client_name: string
  tricode: string | null
  company_name: string | null
  venue_name: string | null
  jobs: number
  total_hours: number
  designers_worked: number
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

export default function HoursByClientReport() {
  const [from, setFrom] = useState(defaultFrom())
  const [to, setTo] = useState(today())
  const [clients, setClients] = useState<ClientRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ from, to })
      const r = await fetch(`/api/reports/hours-by-client?${qs}`)
      if (!r.ok) return
      const d = await r.json()
      setClients(d.clients || [])
      setTotal(d.total_hours_all_clients || 0)
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { load() }, [load])

  const exportCsv = () => {
    const header = ['Tri-Code', 'Venue', 'Client', 'Jobs', 'Hours', 'Share %', 'Designers', 'First Entry', 'Last Entry']
    const rows = clients.map(c => [
      c.client_name, c.venue_name || '', c.company_name || '', c.jobs, c.total_hours, c.share_pct, c.designers_worked,
      c.first_entry || '', c.last_entry || '',
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `hours-by-tricode-${from}-to-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6 py-2">
        <div>
          <Link href="/reports" className="text-xs text-zinc-400 hover:text-zinc-700">← All reports</Link>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Hours by Tri-Code</h1>
          <p className="text-sm text-zinc-500">Designer time spent by venue tri-code across the selected window.</p>
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
          <button onClick={exportCsv} disabled={!clients.length}
            className="px-3 py-2 rounded-lg ring-1 ring-zinc-200 bg-white text-xs font-medium hover:bg-zinc-50 disabled:opacity-50">
            Export CSV
          </button>
          <div className="ml-auto text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">TOTAL HOURS</div>
            <div className="text-2xl font-semibold text-zinc-900">{total.toFixed(2)}</div>
          </div>
        </div>

        <div className="rounded-2xl ring-1 ring-zinc-200 bg-white overflow-hidden">
          {loading ? <Skeleton className="h-96 w-full" /> : clients.length === 0 ? (
            <div className="p-12 text-center text-sm text-zinc-400">No time entries in this window.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="text-left px-5 py-3">Tri-Code</th>
                  <th className="text-right px-5 py-3">Jobs</th>
                  <th className="text-right px-5 py-3">Hours</th>
                  <th className="text-right px-5 py-3">Share</th>
                  <th className="text-right px-5 py-3">Designers</th>
                  <th className="text-right px-5 py-3">Window</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c, i) => (
                  <tr key={i} className="border-t border-zinc-100 hover:bg-zinc-50">
                    <td className="px-5 py-3 font-medium text-zinc-900">
                      <Link
                        href={`/reports/hours-by-client/${encodeURIComponent(c.client_name)}?from=${from}&to=${to}`}
                        className="text-[#0A52EF] hover:underline"
                      >
                        {c.client_name}
                      </Link>
                      {(c.venue_name || c.company_name) && (
                        <div className="mt-0.5 text-[11px] font-normal text-zinc-500">
                          {[c.venue_name, c.company_name].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right text-zinc-600">{c.jobs}</td>
                    <td className="px-5 py-3 text-right font-semibold text-zinc-900">{c.total_hours.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-2 justify-end">
                        <div className="w-16 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#0A52EF]" style={{ width: `${Math.min(100, c.share_pct)}%` }} />
                        </div>
                        <span className="text-xs text-zinc-500 tabular-nums">{c.share_pct}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-zinc-600">{c.designers_worked}</td>
                    <td className="px-5 py-3 text-right text-xs text-zinc-400 font-mono">
                      {c.first_entry?.slice(0, 10)} → {c.last_entry?.slice(0, 10)}
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
