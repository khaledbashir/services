'use client'

// Historic walkthrough log for a venue or a Display Location — Nick parity
// ask 5/13: "if I go into something, I can see all the historic issues, and
// I can pop into this ticket". Linked from the walkthrough drawer.
//
// Query params:
//   ?venue_id=N         → all walkthroughs that visited this venue
//   ?location_id=N      → all walkthroughs that visited this Display Location
//
// Renders the same row shape as the main /walkthroughs grid so the muscle
// memory carries over.

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'

interface HistoryRow {
  id: string
  log_id: string
  venue_name: string
  technician_name: string | null
  log_date: string | null
  type: string | null
  result: string | null
  locations_visited: string | null
  issues_found: string | null
  comments: string | null
}

function HistoryView() {
  const router = useRouter()
  const params = useSearchParams()
  const venueId = params.get('venue_id')
  const locationId = params.get('location_id')
  const venueName = params.get('venue_name')
  const locationName = params.get('location_name')
  const scopeLabel = params.get('label')
    || venueName || locationName
    || (venueId ? `Venue #${venueId}` : locationId ? `Location #${locationId}` : 'Scope')
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!venueId && !locationId && !venueName && !locationName) {
      setLoading(false)
      setError('Pass a venue or location in the URL.')
      return
    }
    setLoading(true)
    setError(null)
    const qs = new URLSearchParams()
    qs.set('action', 'history')
    if (venueId) qs.set('venue_id', venueId)
    if (locationId) qs.set('location_id', locationId)
    if (venueName) qs.set('venue_name', venueName)
    if (locationName) qs.set('location_name', locationName)
    qs.set('limit', '200')
    fetch(`/api/walkthroughs/nocodb?${qs.toString()}`)
      .then(async (r) => {
        if (!r.ok) throw new Error('Lookup failed')
        return r.json()
      })
      .then((d) => {
        setRows(d.walkthroughs || [])
        setTotal(typeof d.total === 'number' ? d.total : (d.walkthroughs?.length ?? 0))
      })
      .catch((e) => setError(e?.message || 'Failed to load history'))
      .finally(() => setLoading(false))
  }, [venueId, locationId, venueName, locationName])

  const resultColor = (r: string | null) => {
    if (r === 'Open Issue Observed') return 'bg-amber-100 text-amber-800 border-amber-200'
    if (r === 'New Issue Detected') return 'bg-rose-100 text-rose-800 border-rose-200'
    if (r === 'No Action Required') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    return 'bg-zinc-100 text-zinc-700 border-zinc-200'
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <button
              onClick={() => router.push('/walkthroughs')}
              className="text-xs text-zinc-500 hover:text-zinc-900 mb-2 inline-flex items-center gap-1"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 18l-6-6 6-6" /></svg>
              All walkthroughs
            </button>
            <h1 className="text-2xl font-semibold text-zinc-900">Walkthrough history</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {scopeLabel}
              {total != null && (
                <span className="ml-2 text-zinc-400">· {total.toLocaleString()} record{total === 1 ? '' : 's'}</span>
              )}
            </p>
          </div>
        </div>

        {loading && (
          <div className="bg-white border border-zinc-200 rounded-lg p-8 text-center text-sm text-zinc-500">
            Loading walkthrough history…
          </div>
        )}

        {!loading && error && (
          <div className="bg-rose-50 border border-rose-200 rounded-lg p-4 text-sm text-rose-800">
            {error}
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="bg-white border border-zinc-200 rounded-lg p-8 text-center text-sm text-zinc-500">
            No walkthroughs on file for this {venueId ? 'venue' : 'location'} yet.
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 border-b border-zinc-200">
                <tr>
                  <th className="text-left px-4 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Log ID</th>
                  <th className="text-left px-4 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Date</th>
                  <th className="text-left px-4 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Tech</th>
                  <th className="text-left px-4 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Result</th>
                  <th className="text-left px-4 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Locations</th>
                  <th className="text-left px-4 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Issues</th>
                  <th className="text-left px-4 py-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Comments</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-zinc-50 cursor-pointer"
                    onClick={() => router.push(`/walkthroughs?open=${r.id}`)}
                  >
                    <td className="px-4 py-2 font-mono text-xs text-[#0A52EF]">{r.log_id}</td>
                    <td className="px-4 py-2 text-zinc-700 whitespace-nowrap">{r.log_date || '—'}</td>
                    <td className="px-4 py-2 text-zinc-700">{r.technician_name || '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${resultColor(r.result)}`}>
                        {r.result || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-zinc-700 max-w-[200px] truncate" title={r.locations_visited || ''}>{r.locations_visited || '—'}</td>
                    <td className="px-4 py-2 text-zinc-700 max-w-[200px] truncate" title={r.issues_found || ''}>{r.issues_found || '—'}</td>
                    <td className="px-4 py-2 text-zinc-600 max-w-[260px] truncate" title={r.comments || ''}>{r.comments || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

export default function WalkthroughHistoryPage() {
  return (
    <Suspense fallback={<DashboardLayout><div className="p-8 text-sm text-zinc-500">Loading…</div></DashboardLayout>}>
      <HistoryView />
    </Suspense>
  )
}
