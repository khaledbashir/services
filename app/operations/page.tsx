'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface NocoTable { id: string; title: string }
interface NocoBase { id: string; title: string; tables: NocoTable[] }
interface NocoWorkspace { workspace_id: string; workspace_title: string; bases: NocoBase[] }

export default function OperationsPage() {
  const [workspaces, setWorkspaces] = useState<NocoWorkspace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetch('/api/operations/tables')
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({}))
          throw new Error(data?.error || `Failed to load tables (${r.status})`)
        }
        return r.json()
      })
      .then((data) => setWorkspaces(data.workspaces || []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const totalTables = useMemo(
    () => workspaces.reduce((n, ws) => n + ws.bases.reduce((m, b) => m + b.tables.length, 0), 0),
    [workspaces],
  )

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return workspaces
    return workspaces
      .map((ws) => ({
        ...ws,
        bases: ws.bases
          .map((b) => ({
            ...b,
            tables: b.tables.filter((t) => t.title.toLowerCase().includes(q) || b.title.toLowerCase().includes(q)),
          }))
          .filter((b) => b.tables.length > 0),
      }))
      .filter((ws) => ws.bases.length > 0)
  }, [workspaces, search])

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 mb-1.5">
              Field Ops
            </div>
            <h1 className="text-2xl leading-tight font-semibold text-zinc-900 tracking-tight">
              Operations
            </h1>
            <p className="text-sm text-zinc-500 mt-1.5">
              {loading ? 'Loading…' : `${totalTables} ${totalTables === 1 ? 'table' : 'tables'} across ${workspaces.reduce((n, ws) => n + ws.bases.length, 0)} bases`}
            </p>
          </div>
          {!loading && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tables…"
              className="h-9 w-72 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
            />
          )}
        </div>

        {error ? (
          <div className="rounded-xl bg-amber-50 ring-1 ring-amber-200 p-6 text-sm text-amber-900">
            <div className="font-semibold mb-1">Operations is not reachable</div>
            <p className="text-amber-800 whitespace-pre-wrap">{error}</p>
            <p className="text-amber-800 mt-2">
              Make sure <code className="font-mono text-xs bg-white/60 px-1.5 py-0.5 rounded">NOCODB_API_TOKEN</code> and <code className="font-mono text-xs bg-white/60 px-1.5 py-0.5 rounded">NOCODB_BASE_URL</code> are set on the EasyPanel anc-services service, then redeploy.
            </p>
          </div>
        ) : loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white ring-1 ring-zinc-200 py-16 text-center">
            <div className="text-4xl mb-3 opacity-30">📋</div>
            <div className="text-sm font-medium text-zinc-900">
              {workspaces.length === 0 ? 'No tables yet' : 'No tables match'}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {workspaces.length === 0
                ? 'Add bases and tables in NocoDB admin, then come back.'
                : 'Try a different search term.'}
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {filtered.map((ws) =>
              ws.bases.map((base) => (
                <div key={base.id}>
                  <div className="flex items-baseline gap-2 mb-2">
                    <h2 className="text-sm font-semibold text-zinc-900">{base.title}</h2>
                    <span className="text-[10.5px] uppercase tracking-wider text-zinc-400">
                      {base.tables.length} {base.tables.length === 1 ? 'table' : 'tables'}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {base.tables.map((t) => (
                      <Link
                        key={t.id}
                        href={`/operations/${base.id}/${t.id}`}
                        className="block rounded-xl bg-white ring-1 ring-zinc-200 p-4 hover:ring-[#0A52EF]/40 hover:-translate-y-0.5 hover:shadow-[0_8px_20px_-12px_rgba(15,23,42,0.18)] transition-all"
                      >
                        <div className="text-sm font-semibold text-zinc-900 truncate">{t.title}</div>
                        <div className="text-[11px] text-zinc-400 mt-1 font-mono truncate">{t.id}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              )),
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
