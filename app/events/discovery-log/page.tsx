'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton, TableSkeleton } from '@/components/skeleton'

interface DiscoveryLogRow {
  id: string
  venue_id: string | null
  venue_name: string
  discovered_at: string
  source: string
  events_found: number
  events_imported: number
  status: 'success' | 'partial' | 'failed'
}

const statusStyles: Record<string, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
}

export default function DiscoveryLogPage() {
  const [logs, setLogs] = useState<DiscoveryLogRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/events/discovery-log')
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('Failed to load discovery log')))
      .then((data) => setLogs(data.logs || []))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false))
  }, [])

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#0A52EF]">Phase 4a</p>
          <h1 className="mt-2 text-2xl font-semibold text-zinc-900">Discovery Audit Log</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Recent AI discovery runs across manual review and cron automation.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {loading ? (
            <>
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
              <Skeleton className="h-24 rounded-2xl" />
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Runs</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{logs.length}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Found</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{logs.reduce((sum, row) => sum + Number(row.events_found || 0), 0)}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Imported</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{logs.reduce((sum, row) => sum + Number(row.events_imported || 0), 0)}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.2em] text-zinc-400">Partial / Failed</p>
                <p className="mt-2 text-2xl font-semibold text-zinc-900">{logs.filter((row) => row.status !== 'success').length}</p>
              </div>
            </>
          )}
        </div>

        <div className="overflow-hidden rounded-[24px] border border-zinc-200 bg-white shadow-sm">
          {loading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-sm text-zinc-500">No discovery runs logged yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Run Time</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Venue</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Sources</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Found</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Imported</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-100 last:border-b-0">
                      <td className="px-5 py-4 text-zinc-600">
                        {new Date(row.discovered_at).toLocaleString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-5 py-4 font-medium text-zinc-900">{row.venue_name}</td>
                      <td className="px-5 py-4 text-zinc-600">{row.source}</td>
                      <td className="px-5 py-4 text-zinc-900">{row.events_found}</td>
                      <td className="px-5 py-4 text-zinc-900">{row.events_imported}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[row.status] || statusStyles.success}`}>
                          {row.status}
                        </span>
                      </td>
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
