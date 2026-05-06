'use client'

// /noco — landing page that lists every NocoDB base + table as a clickable
// directory. Click a table to open the generic <DataGrid> viewer at
// /noco/[tableId]. Means every base in the workspace is browseable in our
// native UI without hand-authoring per-table pages.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'

interface BaseWithTables {
  id: string
  title: string
  tables: { id: string; title: string }[]
}

export default function NocoDirectoryPage() {
  const [bases, setBases] = useState<BaseWithTables[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    fetch('/api/noco/bases')
      .then(r => r.ok ? r.json() : { bases: [] })
      .then(d => setBases(d.bases || []))
      .finally(() => setLoading(false))
  }, [])

  const q = filter.trim().toLowerCase()
  const filtered = !q ? bases : bases
    .map(b => ({
      ...b,
      tables: b.tables.filter(t =>
        t.title.toLowerCase().includes(q) || b.title.toLowerCase().includes(q)
      ),
    }))
    .filter(b => b.tables.length > 0)

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">All Tables</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Every NocoDB base + table — open any one in the native Airtable-style grid. Inline edit, group-by, calendar &amp; gallery views all included.
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
        ) : filtered.length === 0 ? (
          <div className="px-5 py-10 text-sm text-zinc-400">No tables match.</div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(base => (
              <div key={base.id} className="bg-white border border-[#E8E8E8] rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-100 bg-zinc-50/40">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500 font-semibold">Base</div>
                  <div className="text-sm font-semibold text-zinc-900 truncate">{base.title}</div>
                </div>
                <div className="divide-y divide-zinc-100">
                  {base.tables.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-zinc-400">No tables</div>
                  ) : base.tables.map(t => (
                    <Link
                      key={t.id}
                      href={`/noco/${t.id}`}
                      className="block px-4 py-2.5 hover:bg-zinc-50 transition-colors group"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-medium text-zinc-800 group-hover:text-[#0A52EF] truncate">{t.title}</span>
                        <svg className="h-3.5 w-3.5 text-zinc-300 group-hover:text-[#0A52EF] flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m9 18 6-6-6-6" /></svg>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
