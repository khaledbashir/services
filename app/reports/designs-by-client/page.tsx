'use client'

// Per-client design-request counts (Alexis 5/6). Same card shape as
// /hours-budgets so the visual pattern is familiar — Total / Open /
// In-Progress / In-Review / Done badge stack per client, plus an
// "overdue" flag and rolled-up estimated hours.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'

interface ClientRow {
  client: string
  tricode: string | null
  total: number
  open: number
  in_progress: number
  in_review: number
  done: number
  overdue: number
  estimated_hours: number
}

export default function DesignsByClientPage() {
  const [rows, setRows] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    fetch('/api/reports/designs-by-client')
      .then(r => r.ok ? r.json() : { rows: [] })
      .then(d => setRows(d.rows || []))
      .finally(() => setLoading(false))
  }, [])

  const q = filter.trim().toLowerCase()
  const visible = !q ? rows : rows.filter(r =>
    r.client.toLowerCase().includes(q) || (r.tricode || '').toLowerCase().includes(q)
  )

  const totals = rows.reduce((acc, r) => ({
    requests: acc.requests + r.total,
    open: acc.open + r.open + r.in_progress + r.in_review,
    overdue: acc.overdue + r.overdue,
    hours: acc.hours + r.estimated_hours,
  }), { requests: 0, open: 0, overdue: 0, hours: 0 })

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Design Requests by Client</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {rows.length} clients · {totals.requests} total requests · {totals.open} open · {totals.overdue ? <span className="text-rose-600 font-medium">{totals.overdue} overdue</span> : '0 overdue'} · {totals.hours.toFixed(0)} estimated hrs
          </p>
        </div>

        <div className="relative max-w-sm">
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter by client or tri-code…"
            className="w-full pl-9 pr-3 py-2 border border-[#E8E8E8] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-sm text-zinc-500">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="px-5 py-10 text-sm text-zinc-400">No clients match.</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map(r => (
              <Link
                key={r.client}
                href={`/designs?client=${encodeURIComponent(r.client)}`}
                className="border border-zinc-200 bg-white p-4 shadow-sm hover:border-zinc-300 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-zinc-900 truncate">{r.client}</h2>
                    {r.tricode && <span className="text-[10px] font-mono text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded mt-0.5 inline-block">{r.tricode}</span>}
                  </div>
                  <span className="rounded-full bg-zinc-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white tabular-nums">
                    {r.total}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-1.5 flex-wrap text-[10.5px]">
                  {r.open > 0 && <Pill color="amber">{r.open} open</Pill>}
                  {r.in_progress > 0 && <Pill color="sky">{r.in_progress} in progress</Pill>}
                  {r.in_review > 0 && <Pill color="violet">{r.in_review} in review</Pill>}
                  {r.done > 0 && <Pill color="emerald">{r.done} done</Pill>}
                  {r.overdue > 0 && <Pill color="rose">{r.overdue} overdue</Pill>}
                </div>
                {r.estimated_hours > 0 && (
                  <div className="mt-2 text-xs text-zinc-500">
                    {r.estimated_hours.toFixed(1)} estimated hrs
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

function Pill({ color, children }: { color: 'amber' | 'sky' | 'violet' | 'emerald' | 'rose'; children: React.ReactNode }) {
  const styles: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700 ring-amber-200',
    sky: 'bg-sky-50 text-sky-700 ring-sky-200',
    violet: 'bg-violet-50 text-violet-700 ring-violet-200',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    rose: 'bg-rose-50 text-rose-700 ring-rose-200',
  }
  return <span className={`inline-flex items-center px-1.5 py-0.5 rounded ring-1 font-medium ${styles[color]}`}>{children}</span>
}
