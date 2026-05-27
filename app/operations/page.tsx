'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'

interface Workspace {
  workspace_id: number
  workspace_name: string
  bases: { id: number; name: string; tables: { id: number; name: string }[] }[]
}

export default function OperationsPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    fetch('/api/operations/tables')
      .then(async r => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}))
          throw new Error(body.error || `Failed to load (HTTP ${r.status})`)
        }
        return r.json()
      })
      .then(d => setWorkspaces(d.workspaces || []))
      .catch(e => setError(e.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const q = filter.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!q) return workspaces
    return workspaces
      .map(w => ({
        ...w,
        bases: w.bases
          .map(b => ({
            ...b,
            tables: b.tables.filter(t =>
              t.name.toLowerCase().includes(q) ||
              b.name.toLowerCase().includes(q) ||
              w.workspace_name.toLowerCase().includes(q)
            ),
          }))
          .filter(b => b.tables.length > 0),
      }))
      .filter(w => w.bases.length > 0)
  }, [workspaces, q])

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Operations</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Every operations base + table — open any one in the native grid. Inline edit, filtering, sorting all included.
          </p>
        </div>

        <div className="relative max-w-sm">
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter tables…"
            className="w-full pl-9 pr-3 py-2 border border-[#E8E8E8] rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </div>

        {loading ? (
          <div className="px-5 py-10 text-sm text-zinc-500">Loading…</div>
        ) : error ? (
          <div className="px-5 py-10 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-sm text-zinc-400">No tables match.</div>
        ) : (
          <div className="space-y-6">
            {filtered.map(ws => (
              <section key={ws.workspace_id}>
                <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-semibold mb-2">
                  {ws.workspace_name}
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {ws.bases.map(base => (
                    <div key={base.id} className="bg-white border border-[#E8E8E8] rounded-2xl overflow-hidden">
                      <div className="px-4 py-3 border-b border-zinc-100 bg-zinc-50/40">
                        <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-semibold">Base</div>
                        <div className="text-sm font-semibold text-zinc-900 truncate">{base.name}</div>
                      </div>
                      <div className="divide-y divide-zinc-100">
                        {base.tables.length === 0 ? (
                          <div className="px-4 py-3 text-xs text-zinc-400">No tables</div>
                        ) : base.tables.map(t => (
                          <Link
                            key={t.id}
                            href={`/operations/${base.id}/${t.id}`}
                            className="block px-4 py-2.5 hover:bg-zinc-50 transition-colors group"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[13px] font-medium text-zinc-800 group-hover:text-[#0A52EF] truncate">{t.name}</span>
                              <svg className="h-3.5 w-3.5 text-zinc-300 group-hover:text-[#0A52EF] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
