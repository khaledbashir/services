'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface TechRow {
  tech_id: string
  tech_name: string
  tech_email: string | null
  closed_count: number
  open_count: number
  avg_hours_to_close: number | null
  share_pct: number
}

function defaultFrom(): string {
  const d = new Date(); d.setMonth(d.getMonth() - 3)
  return d.toISOString().slice(0, 10)
}
function today(): string { return new Date().toISOString().slice(0, 10) }

export default function TicketsByTechReport() {
  const [from, setFrom] = useState(defaultFrom())
  const [to, setTo] = useState(today())
  const [techs, setTechs] = useState<TechRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ from, to })
      const r = await fetch(`/api/reports/tickets-by-tech?${qs}`)
      if (!r.ok) return
      const d = await r.json()
      setTechs(d.technicians || [])
      setTotal(d.total_closed_all_techs || 0)
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { load() }, [load])

  const exportCsv = () => {
    const header = ['Technician', 'Email', 'Closed', 'Still Open', 'Share %', 'Avg Hours to Close']
    const rows = techs.map(t => [
      t.tech_name, t.tech_email || '', t.closed_count, t.open_count,
      t.share_pct, t.avg_hours_to_close ?? '',
    ])
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tickets-by-tech-${from}-to-${to}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6 py-2">
        <div>
          <Link href="/reports" className="text-xs text-zinc-400 hover:text-zinc-700">← All reports</Link>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Tickets Closed by Technician</h1>
          <p className="text-sm text-zinc-500">Closed-ticket counts per tech across the selected window, plus their still-open load.</p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">Closed between</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              className="rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm bg-white" />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">and</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              className="rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm bg-white" />
          </div>
          <button onClick={load} className="px-3 py-2 rounded-lg bg-[#0A52EF] text-white text-xs font-semibold hover:bg-[#0840C0]">
            Run
          </button>
          <button onClick={exportCsv} disabled={!techs.length}
            className="px-3 py-2 rounded-lg ring-1 ring-zinc-200 bg-white text-xs font-medium hover:bg-zinc-50 disabled:opacity-50">
            Export CSV
          </button>
          <div className="ml-auto text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">TOTAL CLOSED</div>
            <div className="text-2xl font-semibold text-zinc-900">{total}</div>
          </div>
        </div>

        <div className="rounded-2xl ring-1 ring-zinc-200 bg-white overflow-hidden">
          {loading ? <Skeleton className="h-96 w-full" /> : techs.length === 0 ? (
            <div className="p-12 text-center text-sm text-zinc-400">No ticket activity in this window.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="text-left px-5 py-3">Technician</th>
                  <th className="text-right px-5 py-3">Closed</th>
                  <th className="text-right px-5 py-3">Share</th>
                  <th className="text-right px-5 py-3">Still Open</th>
                  <th className="text-right px-5 py-3">Avg Time to Close</th>
                </tr>
              </thead>
              <tbody>
                {techs.map(t => (
                  <tr key={t.tech_id} className="border-t border-zinc-100 hover:bg-zinc-50">
                    <td className="px-5 py-3">
                      <div className="font-medium text-zinc-900">{t.tech_name}</div>
                      {t.tech_email && <div className="text-xs text-zinc-400">{t.tech_email}</div>}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-zinc-900">{t.closed_count}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-2 justify-end">
                        <div className="w-16 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, t.share_pct)}%` }} />
                        </div>
                        <span className="text-xs text-zinc-500 tabular-nums">{t.share_pct}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right text-zinc-600">{t.open_count}</td>
                    <td className="px-5 py-3 text-right text-xs text-zinc-500 tabular-nums">
                      {t.avg_hours_to_close != null ? `${t.avg_hours_to_close}h` : '—'}
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
