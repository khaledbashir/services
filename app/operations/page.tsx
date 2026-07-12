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
      .then(async response => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}))
          throw new Error(body.error || `Failed to load (HTTP ${response.status})`)
        }
        return response.json()
      })
      .then(data => setWorkspaces(data.workspaces || []))
      .catch(err => setError(err.message || 'Failed to load operations'))
      .finally(() => setLoading(false))
  }, [])

  const query = filter.trim().toLowerCase()
  const filtered = useMemo(() => {
    if (!query) return workspaces
    return workspaces
      .map(workspace => ({
        ...workspace,
        bases: workspace.bases
          .map(base => ({
            ...base,
            tables: base.tables.filter(table =>
              table.name.toLowerCase().includes(query) ||
              base.name.toLowerCase().includes(query) ||
              workspace.workspace_name.toLowerCase().includes(query)
            ),
          }))
          .filter(base => base.tables.length > 0),
      }))
      .filter(workspace => workspace.bases.length > 0)
  }, [workspaces, query])

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Operations Workspace</h1>
          <p className="mt-1 text-sm text-zinc-500">Open any operations table in the native grid using your existing Services login.</p>
        </div>

        <div className="relative max-w-sm">
          <input value={filter} onChange={event => setFilter(event.target.value)} placeholder="Filter tables…" className="w-full rounded-md border border-zinc-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30" />
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        </div>

        {loading ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-5 py-10 text-sm text-zinc-500">Loading operations…</div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-10 text-sm text-red-600">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-5 py-10 text-sm text-zinc-400">No operations tables found.</div>
        ) : (
          <div className="space-y-6">
            {filtered.map(workspace => (
              <section key={workspace.workspace_id}>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{workspace.workspace_name}</div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {workspace.bases.map(base => (
                    <div key={base.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                      <div className="border-b border-zinc-100 bg-zinc-50/60 px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Base</div>
                        <div className="truncate text-sm font-semibold text-zinc-900">{base.name}</div>
                      </div>
                      <div className="divide-y divide-zinc-100">
                        {base.tables.map(table => (
                          <Link key={table.id} href={`/operations/${base.id}/${table.id}`} className="group block px-4 py-2.5 transition-colors hover:bg-zinc-50">
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-[13px] font-medium text-zinc-800 group-hover:text-[#0A52EF]">{table.name}</span>
                              <span className="text-zinc-300 group-hover:text-[#0A52EF]">›</span>
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
