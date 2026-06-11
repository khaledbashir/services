'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface CategoryRow {
  key: string
  label: string
  hours: number
  count: number
}

interface Summary {
  from: string | null
  to: string | null
  categories: CategoryRow[]
  total_hours: number
  total_count: number
}

const PRESET_RANGES = [
  { key: 'all', label: 'All time', from: null, to: null },
  { key: 'this_month', label: 'This month' },
  { key: 'last_month', label: 'Last month' },
  { key: 'ytd', label: 'Year to date' },
  { key: 'custom', label: 'Custom range' },
] as const

function rangeForPreset(key: string): { from: string | null; to: string | null } {
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  if (key === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: start.toISOString().slice(0, 10), to: today }
  }
  if (key === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const end = new Date(now.getFullYear(), now.getMonth(), 0)
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) }
  }
  if (key === 'ytd') {
    return { from: `${now.getFullYear()}-01-01`, to: today }
  }
  return { from: null, to: null }
}

export default function InternalHoursPage() {
  const [preset, setPreset] = useState<string>('this_month')
  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')
  const [data, setData] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)

  const refetch = async (opts?: { from?: string | null; to?: string | null }) => {
    setLoading(true)
    try {
      const f = opts?.from ?? from
      const t = opts?.to ?? to
      const params = new URLSearchParams()
      if (f) params.set('from', f)
      if (t) params.set('to', t)
      const res = await fetch(`/api/design-requests/internal-hours-summary${params.toString() ? `?${params}` : ''}`)
      const json = await res.json()
      setData(json)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const r = rangeForPreset('this_month')
    setFrom(r.from || '')
    setTo(r.to || '')
    refetch({ from: r.from, to: r.to })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handlePreset = (key: string) => {
    setPreset(key)
    if (key === 'custom') return
    const r = rangeForPreset(key)
    setFrom(r.from || '')
    setTo(r.to || '')
    refetch({ from: r.from, to: r.to })
  }

  const max = data ? Math.max(1, ...data.categories.map((c) => c.hours)) : 1

  return (
    <DashboardLayout>
      <div className="max-w-[1800px] mx-auto space-y-6 py-2">
        <div className="space-y-3">
          <Link href="/designs" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors inline-flex items-center gap-1.5 group">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            All Design Requests
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Internal Hours</h1>
            <p className="text-sm text-zinc-500 mt-1">
              Non-billable time spent by category — spec sheets, ad sales, marketing, proposals, sponsorship.
            </p>
          </div>
        </div>

        <div className="rounded-xl bg-white ring-1 ring-zinc-200 p-4 flex flex-wrap items-center gap-2">
          {PRESET_RANGES.map((p) => (
            <button
              key={p.key}
              onClick={() => handlePreset(p.key)}
              className={`h-8 px-3 rounded-md text-xs font-medium transition-colors ${
                preset === p.key
                  ? 'bg-zinc-900 text-white'
                  : 'ring-1 ring-zinc-200 bg-white text-zinc-600 hover:text-zinc-900'
              }`}
            >
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="flex items-center gap-2 ml-2">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-8 px-2 rounded-md ring-1 ring-zinc-200 bg-white text-xs outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
              />
              <span className="text-xs text-zinc-400">to</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-8 px-2 rounded-md ring-1 ring-zinc-200 bg-white text-xs outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
              />
              <button
                onClick={() => refetch()}
                className="h-8 px-3 rounded-md bg-[#0A52EF] text-white text-xs font-medium hover:bg-[#0840C0]"
              >
                Apply
              </button>
            </div>
          )}
        </div>

        {loading || !data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (
          <>
            <div className="rounded-xl bg-white ring-1 ring-zinc-200 p-5 flex items-end justify-between gap-4">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Total Internal Hours
                </div>
                <div className="text-3xl font-semibold text-zinc-900 tabular-nums mt-1">
                  {data.total_hours}h
                </div>
                <div className="text-xs text-zinc-500 mt-1">
                  Across {data.total_count} {data.total_count === 1 ? 'request' : 'requests'}
                  {data.from || data.to ? ` · ${data.from || '…'} → ${data.to || '…'}` : ''}
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-white ring-1 ring-zinc-200 divide-y divide-zinc-100">
              {data.categories.map((c) => {
                const pct = max > 0 ? Math.round((c.hours / max) * 100) : 0
                return (
                  <Link
                    key={c.key}
                    href={`/designs?internal=${encodeURIComponent(c.key)}`}
                    className="block p-4 hover:bg-zinc-50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="text-sm font-medium text-zinc-900">{c.label}</div>
                      <div className="text-xs text-zinc-500 tabular-nums">
                        <span className="font-semibold text-zinc-900">{c.hours}h</span>
                        <span className="text-zinc-400"> · {c.count} {c.count === 1 ? 'request' : 'requests'}</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                      <div className="h-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
