'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface VenueRow {
  venue_id: string | null
  venue_name: string
  total: number
  closed: number
  open: number
  urgent_open: number
  first_ticket: string | null
  last_ticket: string | null
  share_pct: number
}

function defaultFrom(): string {
  const d = new Date(); d.setMonth(d.getMonth() - 3)
  return d.toISOString().slice(0, 10)
}
function today(): string { return new Date().toISOString().slice(0, 10) }

export default function TicketsByVenueReport() {
  const [from, setFrom] = useState(defaultFrom())
  const [to, setTo] = useState(today())
  const [venues, setVenues] = useState<VenueRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ from, to })
      const r = await fetch(`/api/reports/tickets-by-venue?${qs}`)
      if (!r.ok) return
      const d = await r.json()
      setVenues(d.venues || [])
      setTotal(d.total_tickets || 0)
    } finally { setLoading(false) }
  }, [from, to])

  useEffect(() => { load() }, [load])

  const exportCsv = () => {
    const header = ['Venue', 'Total', 'Closed', 'Still Open', 'Urgent Open', 'Share %', 'First Ticket', 'Last Ticket']
    const rows = venues.map(v => [
      v.venue_name, v.total, v.closed, v.open, v.urgent_open, v.share_pct,
      v.first_ticket || '', v.last_ticket || '',
    ])
    const csv = [header, ...rows].map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `tickets-by-venue-${from}-to-${to}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6 py-2">
        <div>
          <Link href="/reports" className="text-xs text-zinc-400 hover:text-zinc-700">← All reports</Link>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Tickets by Venue</h1>
          <p className="text-sm text-zinc-500">How many tickets have been filed per venue — open / closed / urgent.</p>
        </div>

        <div className="flex items-end gap-3 flex-wrap">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">Created between</label>
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
          <button onClick={exportCsv} disabled={!venues.length}
            className="px-3 py-2 rounded-lg ring-1 ring-zinc-200 bg-white text-xs font-medium hover:bg-zinc-50 disabled:opacity-50">
            Export CSV
          </button>
          <div className="ml-auto text-right">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">TOTAL TICKETS</div>
            <div className="text-2xl font-semibold text-zinc-900">{total}</div>
          </div>
        </div>

        <div className="rounded-2xl ring-1 ring-zinc-200 bg-white overflow-hidden">
          {loading ? <Skeleton className="h-96 w-full" /> : venues.length === 0 ? (
            <div className="p-12 text-center text-sm text-zinc-400">No tickets in this window.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="text-left px-5 py-3">Venue</th>
                  <th className="text-right px-5 py-3">Total</th>
                  <th className="text-right px-5 py-3">Closed</th>
                  <th className="text-right px-5 py-3">Open</th>
                  <th className="text-right px-5 py-3">Urgent Open</th>
                  <th className="text-right px-5 py-3">Share</th>
                </tr>
              </thead>
              <tbody>
                {venues.map((v, i) => (
                  <tr key={v.venue_id || i} className="border-t border-zinc-100 hover:bg-zinc-50">
                    <td className="px-5 py-3 font-medium text-zinc-900">
                      {v.venue_id ? (
                        // Drill into the ticket-level report, carrying this row's date
                        // window so the line items reconcile with the count shown here.
                        // (The old target, /tickets, defaults to open-only and hid every
                        // closed ticket behind the number.)
                        <Link href={`/reports/tickets-detail?venue_id=${v.venue_id}&from=${from}&to=${to}`}
                          className="hover:text-[#0A52EF] hover:underline">
                          {v.venue_name}
                        </Link>
                      ) : v.venue_name}
                    </td>
                    <td className="px-5 py-3 text-right font-semibold text-zinc-900">{v.total}</td>
                    <td className="px-5 py-3 text-right text-emerald-700">{v.closed}</td>
                    <td className="px-5 py-3 text-right text-zinc-700">{v.open}</td>
                    <td className="px-5 py-3 text-right">
                      {v.urgent_open > 0 ? <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-50 text-red-700 text-xs font-medium">{v.urgent_open}</span> : <span className="text-zinc-400">—</span>}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-2 justify-end">
                        <div className="w-16 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#0A52EF]" style={{ width: `${Math.min(100, v.share_pct)}%` }} />
                        </div>
                        <span className="text-xs text-zinc-500 tabular-nums">{v.share_pct}%</span>
                      </div>
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
