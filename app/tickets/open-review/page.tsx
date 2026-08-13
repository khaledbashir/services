'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

/**
 * Open Ticket Review — Joe Occhipinti, 2026-08-13.
 *
 * "I guess this could be a 'View' in the ticket platform as well. Maybe call it
 * something like - Open Ticket Review. I'd like to see - Venue - assignee -
 * days since last update - Latest update with date included."
 *
 * Those four columns, in that order, quietest ticket first. Reads from the same
 * endpoint the 8 AM email renders from.
 */

interface ReviewTicket {
  id: string
  ticketNumber: number
  title: string
  status: string
  statusLabel: string
  priority: string
  venue: string
  assignee: string
  lastUpdateDate: string
  daysSinceUpdate: number
  daysLabel: string
  latestUpdate: string
  latestUpdateAuthor: string
  latestUpdateSource: 'note' | 'opened' | 'none'
  createdDate: string
}

interface Summary {
  total: number
  stale7: number
  stale14: number
  unassigned: number
  escalated: number
  untouchedToday: number
}

const REPORTS = [
  { key: 'open-review', label: 'All open' },
  { key: 'escalated', label: 'Escalated' },
  { key: 'new-24h', label: 'New (24h)' },
  { key: 'closed-24h', label: 'Closed (24h)' },
] as const

const statusTone: Record<string, string> = {
  new: 'bg-red-50 text-red-700',
  on_hold: 'bg-violet-50 text-violet-700',
  in_progress: 'bg-amber-50 text-amber-700',
  escalated: 'bg-orange-50 text-orange-700',
  closed: 'bg-zinc-100 text-zinc-600',
}

function staleTone(days: number): string {
  if (days >= 14) return 'text-red-600'
  if (days >= 7) return 'text-amber-600'
  return 'text-zinc-700'
}

export default function OpenTicketReviewPage() {
  const [report, setReport] = useState<string>('open-review')
  const [tickets, setTickets] = useState<ReviewTicket[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [dateLabel, setDateLabel] = useState('')
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [staleOnly, setStaleOnly] = useState(false)
  const [unassignedOnly, setUnassignedOnly] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/reports/open-ticket-review?report=${report}`)
      if (!r.ok) { setTickets([]); setSummary(null); return }
      const d = await r.json()
      setTickets(d.tickets || [])
      setSummary(d.summary || null)
      setDateLabel(d.dateLabel || '')
    } finally {
      setLoading(false)
    }
  }, [report])

  useEffect(() => { load() }, [load])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tickets.filter((t) => {
      if (staleOnly && t.daysSinceUpdate < 7) return false
      if (unassignedOnly && t.assignee !== 'Unassigned') return false
      if (!q) return true
      return (
        t.venue.toLowerCase().includes(q) ||
        t.assignee.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.latestUpdate.toLowerCase().includes(q) ||
        String(t.ticketNumber).includes(q)
      )
    })
  }, [tickets, search, staleOnly, unassignedOnly])

  const pills: Array<{ label: string; value: number; tone: string }> = summary
    ? [
        { label: 'Open', value: summary.total, tone: 'bg-zinc-100 text-zinc-700' },
        { label: 'Escalated', value: summary.escalated, tone: summary.escalated ? 'bg-orange-50 text-orange-700' : 'bg-zinc-100 text-zinc-700' },
        { label: 'Quiet 7+ days', value: summary.stale7, tone: summary.stale7 ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-700' },
        { label: 'Quiet 14+ days', value: summary.stale14, tone: summary.stale14 ? 'bg-red-50 text-red-700' : 'bg-zinc-100 text-zinc-700' },
        { label: 'Unassigned', value: summary.unassigned, tone: summary.unassigned ? 'bg-amber-50 text-amber-700' : 'bg-zinc-100 text-zinc-700' },
      ]
    : []

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto space-y-5 py-2">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Link href="/tickets" className="text-xs text-zinc-400 hover:text-zinc-700">← All tickets</Link>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Open Ticket Review</h1>
            <p className="text-sm text-zinc-500">
              Every ticket still open, quietest first. {dateLabel ? `As of ${dateLabel}.` : ''} Emailed each morning at 8:00 AM New York time.
            </p>
          </div>
          <a
            href={`/api/reports/open-ticket-review?report=${report}&format=csv`}
            className="rounded-lg bg-[#0A52EF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0847cc]"
          >
            Export CSV
          </a>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {REPORTS.map((r) => (
            <button
              key={r.key}
              onClick={() => setReport(r.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                report === r.key ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600 ring-1 ring-zinc-200 hover:text-zinc-900'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {summary && report === 'open-review' && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {pills.map((p) => (
              <div key={p.label} className={`rounded-lg px-3 py-2 ${p.tone}`}>
                <div className="text-xl font-bold leading-tight">{p.value}</div>
                <div className="text-[11px] font-medium">{p.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search venue, assignee, update…"
            className="rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm bg-white w-64"
          />
          <button
            onClick={() => setStaleOnly((v) => !v)}
            className={`rounded-lg px-3 py-2 text-xs font-semibold ring-1 transition-colors ${
              staleOnly ? 'bg-amber-500 text-white ring-amber-500' : 'bg-white text-zinc-600 ring-zinc-200'
            }`}
          >
            Quiet 7+ days
          </button>
          <button
            onClick={() => setUnassignedOnly((v) => !v)}
            className={`rounded-lg px-3 py-2 text-xs font-semibold ring-1 transition-colors ${
              unassignedOnly ? 'bg-amber-500 text-white ring-amber-500' : 'bg-white text-zinc-600 ring-zinc-200'
            }`}
          >
            Unassigned
          </button>
          <span className="text-xs text-zinc-500">{visible.length} of {tickets.length}</span>
        </div>

        {loading ? (
          <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
        ) : visible.length === 0 ? (
          <div className="rounded-xl bg-white ring-1 ring-zinc-200 p-10 text-center text-sm text-zinc-500">
            Nothing to review here.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-zinc-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left">
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Ticket</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Venue</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Assignee</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 whitespace-nowrap">Since last update</th>
                  <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Latest update</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr key={t.id} className="border-b border-zinc-100 last:border-0 align-top hover:bg-zinc-50/60">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link href={`/tickets/${t.id}`} className="font-semibold text-[#0A52EF] hover:underline">
                        T-{String(t.ticketNumber).padStart(5, '0')}
                      </Link>
                      <div className={`mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusTone[t.status] || 'bg-zinc-100 text-zinc-600'}`}>
                        {t.statusLabel}
                      </div>
                    </td>
                    <td className="px-4 py-3 min-w-[180px]">
                      <div className="font-medium text-zinc-900">{t.venue}</div>
                      <div className="mt-0.5 text-xs text-zinc-500">{t.title}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-zinc-800">{t.assignee}</td>
                    <td className={`px-4 py-3 whitespace-nowrap font-semibold ${staleTone(t.daysSinceUpdate)}`}>{t.daysLabel}</td>
                    <td className="px-4 py-3 max-w-[520px]">
                      {t.latestUpdateSource === 'none' ? (
                        <span className="text-zinc-400">No update logged since the ticket was opened.</span>
                      ) : (
                        <>
                          <div className="text-[11px] text-zinc-500">
                            {t.lastUpdateDate}
                            {t.latestUpdateAuthor ? ` · ${t.latestUpdateAuthor}` : ''}
                            {t.latestUpdateSource === 'opened' ? ' · opening note' : ''}
                          </div>
                          <div className="mt-0.5 text-zinc-700 leading-relaxed">{t.latestUpdate}</div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-zinc-400">
          &ldquo;Since last update&rdquo; counts from the newest note on the ticket. Tickets with no notes yet count from the day they were opened.
        </p>
      </div>
    </DashboardLayout>
  )
}
