'use client'

// Request Hub — one intake system, two experiences.
// Leadership/assessors land on a sortable comparison table (Kanban as a
// secondary delivery view); everyone else gets their own requests + a fast
// path to submit a new one. Row click opens the decision brief in a slide-in
// panel, same interaction as /designs and /tickets.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { KanbanBoard, type KanbanColumn } from '@/components/kanban-board'
import RequestDetailBody from '@/components/request-hub/request-detail'

interface MetaStatus {
  key: string
  label: string
  accent: string
  phase: string
}

const STATUS_TONE: Record<string, string> = {
  submitted: 'bg-sky-50 text-sky-700',
  needs_clarification: 'bg-violet-50 text-violet-700',
  feasibility: 'bg-cyan-50 text-cyan-700',
  leadership_review: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  in_progress: 'bg-blue-50 text-blue-700',
  blocked: 'bg-red-50 text-red-700',
  completed: 'bg-emerald-100 text-emerald-800',
  on_hold: 'bg-zinc-100 text-zinc-600',
  declined: 'bg-zinc-100 text-zinc-500',
  draft: 'bg-zinc-50 text-zinc-500',
}

type SortDir = 'asc' | 'desc'

const RANKS: Record<string, Record<string, number>> = {
  business_value: { critical: 4, high: 3, medium: 2, low: 1 },
  feasibility: { straightforward: 4, moderate: 3, hard: 2, not_feasible: 1 },
  effort: { xs: 1, s: 2, m: 3, l: 4, xl: 5 },
  confidence: { high: 3, medium: 2, low: 1 },
  risk: { low: 1, medium: 2, high: 3 },
  priority: { low: 1, medium: 2, high: 3, critical: 4 },
  urgency: { low: 1, medium: 2, high: 3 },
}

function SortHeader({
  label,
  field,
  sort,
  onSort,
}: {
  label: string
  field: string
  sort: { field: string; dir: SortDir }
  onSort: (field: string) => void
}) {
  const active = sort.field === field
  return (
    <th className="text-left py-2.5 px-3 text-xs font-medium text-zinc-500 whitespace-nowrap">
      <button
        onClick={() => onSort(field)}
        className={`inline-flex items-center gap-1 hover:text-zinc-900 ${active ? 'text-zinc-900' : ''}`}
      >
        {label}
        <span className="text-[9px]">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  )
}

export default function RequestHubPage() {
  const router = useRouter()
  const [rows, setRows] = useState<any[]>([])
  const [statuses, setStatuses] = useState<MetaStatus[]>([])
  const [perms, setPerms] = useState<any>(null)
  const [viewerId, setViewerId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'table' | 'board' | 'mine'>('table')
  const [boardScope, setBoardScope] = useState<'delivery' | 'all'>('delivery')
  const [statusFilter, setStatusFilter] = useState<string>('open')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ field: string; dir: SortDir }>({ field: 'updated_at', dir: 'desc' })
  const [panelId, setPanelId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [listRes, metaRes] = await Promise.all([
      fetch('/api/request-hub').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/request-hub/meta').then((r) => (r.ok ? r.json() : null)),
    ])
    if (listRes) {
      setRows(listRes.requests || [])
      setPerms(listRes.permissions || null)
      setViewerId(listRes.viewerId || null)
      const leadership =
        listRes.permissions?.isApprover || listRes.permissions?.isAssessor || listRes.permissions?.isBuilder
      setView((v) => (v === 'table' && !leadership ? 'mine' : v))
    }
    if (metaRes) setStatuses(metaRes.statuses || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    // restore saved sort
    fetch('/api/preferences?key=requesthub.sort').then(async (r) => {
      if (!r.ok) return
      const { value } = await r.json()
      if (value) {
        const [field, dir] = String(value).split(':')
        if (field) setSort({ field, dir: dir === 'asc' ? 'asc' : 'desc' })
      }
    }).catch(() => {})
  }, [load])

  const isLeadership = perms?.isApprover || perms?.isAssessor || perms?.isBuilder

  const onSort = (field: string) => {
    setSort((prev) => {
      const next: { field: string; dir: SortDir } =
        prev.field === field ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { field, dir: 'desc' }
      fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'requesthub.sort', value: `${next.field}:${next.dir}` }),
      }).catch(() => {})
      return next
    })
  }

  const OPEN_STATUSES = useMemo(
    () => statuses.filter((s) => s.phase !== 'terminal').map((s) => s.key),
    [statuses]
  )

  const filtered = useMemo(() => {
    let list = rows.filter((r) => r.status !== 'draft')
    if (statusFilter === 'open') list = list.filter((r) => OPEN_STATUSES.includes(r.status))
    else if (statusFilter !== 'all') list = list.filter((r) => r.status === statusFilter)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((r) =>
        [r.request_number, r.title, r.summary, r.requester_name, r.venue_name, r.owner_name]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      )
    }
    const dir = sort.dir === 'asc' ? 1 : -1
    const rank = RANKS[sort.field]
    return [...list].sort((x, y) => {
      const a = x[sort.field]
      const b = y[sort.field]
      if (rank) return ((rank[a] || 0) - (rank[b] || 0)) * dir
      if (sort.field === 'updated_at' || sort.field === 'submitted_at' || sort.field === 'deadline') {
        return ((a ? new Date(a).getTime() : 0) - (b ? new Date(b).getTime() : 0)) * dir
      }
      return String(a || '').localeCompare(String(b || '')) * dir
    })
  }, [rows, statusFilter, search, sort, OPEN_STATUSES])

  const myDrafts = useMemo(
    () => rows.filter((r) => r.status === 'draft' && (!viewerId || r.requester_id === viewerId)),
    [rows, viewerId]
  )
  const mine = useMemo(
    () => rows.filter((r) => r.status !== 'draft' && (!viewerId || r.requester_id === viewerId)),
    [rows, viewerId]
  )

  const boardColumns: KanbanColumn[] = useMemo(() => {
    const keys =
      boardScope === 'delivery'
        ? ['approved', 'in_progress', 'blocked', 'completed']
        : statuses.filter((s) => s.key !== 'declined').map((s) => s.key)
    return keys
      .map((k) => statuses.find((s) => s.key === k))
      .filter(Boolean)
      .map((s) => ({ key: s!.key, label: s!.label, accent: s!.accent }))
  }, [statuses, boardScope])

  const moveCard = async (item: any, status: string) => {
    setRows((prev) => prev.map((r) => (r.id === item.id ? { ...r, status } : r)))
    const res = await fetch(`/api/request-hub/${item.id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) load()
  }

  const statusPill = (status: string) => (
    <span className={`text-xs font-medium px-1.5 py-0.5 whitespace-nowrap ${STATUS_TONE[status] || 'bg-zinc-100 text-zinc-600'}`}>
      {statuses.find((s) => s.key === status)?.label || status}
    </span>
  )

  const cap = (v: string | null) => (v ? String(v).replace(/_/g, ' ') : '—')

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Request Hub</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              Ideas, builds, changes, and problems — one front door, one queue.
            </p>
          </div>
          <button
            onClick={() => router.push('/request-hub/new')}
            className="px-4 py-2 bg-[#0A52EF] text-white text-sm font-medium hover:bg-[#0840C0] transition-colors"
          >
            + New request
          </button>
        </div>

        {/* Resume drafts */}
        {myDrafts.length > 0 ? (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2.5 flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-zinc-500">Unfinished drafts:</span>
            {myDrafts.map((d) => (
              <button
                key={d.id}
                onClick={() => router.push(`/request-hub/new?draft=${d.id}`)}
                className="text-xs text-[#0A52EF] hover:underline"
              >
                {d.title || d.type} · resume →
              </button>
            ))}
          </div>
        ) : null}

        {/* View tabs */}
        <div className="flex items-center gap-1 border-b border-zinc-200 flex-wrap">
          {isLeadership ? (
            <>
              <button
                onClick={() => setView('table')}
                className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px ${view === 'table' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
              >
                Decision table
              </button>
              <button
                onClick={() => setView('board')}
                className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px ${view === 'board' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
              >
                Delivery board
              </button>
            </>
          ) : null}
          <button
            onClick={() => setView('mine')}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 -mb-px ${view === 'mine' ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
          >
            My requests
            <span className="ml-1.5 text-xs tabular-nums text-zinc-400">{mine.length}</span>
          </button>

          <div className="ml-auto flex items-center gap-2 pb-1.5">
            {view === 'table' ? (
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs outline-none"
              >
                <option value="open">Open</option>
                <option value="all">All statuses</option>
                {statuses.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            ) : null}
            {view === 'board' ? (
              <select
                value={boardScope}
                onChange={(e) => setBoardScope(e.target.value as any)}
                className="h-8 rounded-md border border-zinc-200 bg-white px-2 text-xs outline-none"
              >
                <option value="delivery">Delivery stages</option>
                <option value="all">All stages</option>
              </select>
            ) : null}
            <div className="relative">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="w-44 pl-3 pr-3 py-1.5 border border-zinc-200 text-sm focus:outline-none focus:border-zinc-400"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center text-sm text-zinc-400">Loading requests…</div>
        ) : null}

        {/* Leadership decision table */}
        {!loading && view === 'table' && isLeadership ? (
          filtered.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-sm text-zinc-500">No requests match.</p>
              <p className="text-xs text-zinc-400 mt-1">New submissions land here automatically.</p>
            </div>
          ) : (
            <div className="border border-zinc-200 overflow-x-auto">
              <table className="w-full text-sm min-w-[1280px]">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <SortHeader label="Request" field="request_number" sort={sort} onSort={onSort} />
                    <SortHeader label="Type" field="type" sort={sort} onSort={onSort} />
                    <SortHeader label="Requested by" field="requester_name" sort={sort} onSort={onSort} />
                    <SortHeader label="Venue / area" field="venue_name" sort={sort} onSort={onSort} />
                    <SortHeader label="Value" field="business_value" sort={sort} onSort={onSort} />
                    <SortHeader label="Urgency" field="priority" sort={sort} onSort={onSort} />
                    <SortHeader label="Feasibility" field="feasibility" sort={sort} onSort={onSort} />
                    <SortHeader label="Effort" field="effort" sort={sort} onSort={onSort} />
                    <SortHeader label="Duration" field="duration" sort={sort} onSort={onSort} />
                    <SortHeader label="Dependencies" field="dependencies" sort={sort} onSort={onSort} />
                    <SortHeader label="Confidence" field="confidence" sort={sort} onSort={onSort} />
                    <SortHeader label="Owner" field="owner_name" sort={sort} onSort={onSort} />
                    <SortHeader label="Recommendation" field="recommendation" sort={sort} onSort={onSort} />
                    <SortHeader label="Status" field="status" sort={sort} onSort={onSort} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => setPanelId(r.id)}
                      className={`border-b border-zinc-100 last:border-0 hover:bg-zinc-50 cursor-pointer transition-colors ${panelId === r.id ? 'bg-blue-50/50' : ''}`}
                    >
                      <td className="py-2.5 px-3 max-w-[280px]">
                        <div className="font-mono text-[10px] text-zinc-400">{r.request_number}</div>
                        <div className="text-zinc-900 font-medium truncate">{r.title || 'Untitled'}</div>
                      </td>
                      <td className="py-2.5 px-3 capitalize whitespace-nowrap text-zinc-600">{cap(r.type)}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-zinc-600">{r.requester_name || '—'}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-zinc-600">{r.venue_name || r.team || '—'}</td>
                      <td className="py-2.5 px-3 capitalize text-zinc-600">{cap(r.business_value)}</td>
                      <td className="py-2.5 px-3">
                        <span className="inline-flex items-center gap-1.5 capitalize text-zinc-600">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              { low: 'bg-zinc-400', medium: 'bg-amber-500', high: 'bg-orange-500', critical: 'bg-red-500' }[
                                (r.priority as string) || 'medium'
                              ] || 'bg-zinc-300'
                            }`}
                          />
                          {cap(r.priority)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 capitalize text-zinc-600">{cap(r.feasibility)}</td>
                      <td className="py-2.5 px-3 uppercase text-zinc-600">{r.effort || '—'}</td>
                      <td className="py-2.5 px-3 max-w-[140px] truncate text-zinc-600">{r.duration || '—'}</td>
                      <td className="py-2.5 px-3 max-w-[160px] truncate text-zinc-600">{r.dependencies || '—'}</td>
                      <td className="py-2.5 px-3 capitalize text-zinc-600">{cap(r.confidence)}</td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-zinc-600">{r.owner_name || '—'}</td>
                      <td className="py-2.5 px-3 capitalize text-zinc-600">{cap(r.recommendation)}</td>
                      <td className="py-2.5 px-3">{statusPill(r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {/* Delivery Kanban */}
        {!loading && view === 'board' && isLeadership ? (
          <KanbanBoard
            items={filtered.filter((r) =>
              boardScope === 'delivery'
                ? ['approved', 'in_progress', 'blocked', 'completed'].includes(r.status)
                : true
            )}
            columns={boardColumns}
            statusOf={(r: any) => r.status}
            keyOf={(r: any) => r.id}
            onStatusChange={moveCard}
            renderCard={(r: any) => (
              <div onClick={() => setPanelId(r.id)}>
                <div className="font-mono text-[10px] text-zinc-400">{r.request_number}</div>
                <div className="text-[13px] font-medium text-zinc-900 leading-snug">{r.title || 'Untitled'}</div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-zinc-500">
                  <span className="capitalize">{cap(r.type)}</span>
                  {r.effort ? <span className="uppercase">{r.effort}</span> : null}
                  {r.owner_name ? <span className="truncate">→ {r.owner_name}</span> : null}
                </div>
              </div>
            )}
          />
        ) : null}

        {/* My requests */}
        {!loading && view === 'mine' ? (
          mine.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-sm text-zinc-500">You haven&apos;t submitted anything yet.</p>
              <button
                onClick={() => router.push('/request-hub/new')}
                className="mt-3 px-4 py-2 bg-[#0A52EF] text-white text-sm font-medium hover:bg-[#0840C0]"
              >
                Submit your first request
              </button>
            </div>
          ) : (
            <div className="border border-zinc-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50">
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-zinc-500">Request</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-zinc-500">Type</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-zinc-500">Owner</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-zinc-500">Updated</th>
                    <th className="text-left py-2.5 px-4 text-xs font-medium text-zinc-500">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((r) => (
                      <tr
                        key={r.id}
                        onClick={() => setPanelId(r.id)}
                        className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-4">
                          <div className="font-mono text-[10px] text-zinc-400">{r.request_number}</div>
                          <div className="text-zinc-900 font-medium">{r.title || 'Untitled'}</div>
                        </td>
                        <td className="py-2.5 px-4 capitalize text-zinc-600">{cap(r.type)}</td>
                        <td className="py-2.5 px-4 text-zinc-600">{r.owner_name || 'Being routed'}</td>
                        <td className="py-2.5 px-4 text-zinc-500 whitespace-nowrap">
                          {new Date(r.updated_at).toLocaleDateString()}
                        </td>
                        <td className="py-2.5 px-4">{statusPill(r.status)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </div>

      {/* Slide-in decision brief */}
      {panelId ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-zinc-900/20 lg:bg-transparent lg:pointer-events-none"
            onClick={() => setPanelId(null)}
          />
          <aside
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[95vw] lg:w-[760px] flex-col bg-white shadow-2xl ring-1 ring-zinc-200"
            role="dialog"
          >
            <header className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-2.5">
              <span className="text-xs font-medium text-zinc-500">Decision brief</span>
              <div className="flex items-center gap-2">
                <a href={`/request-hub/${panelId}`} className="text-xs text-[#0A52EF] hover:underline">
                  Open full ↗
                </a>
                <button onClick={() => setPanelId(null)} className="text-zinc-400 hover:text-zinc-700 text-sm px-1">
                  ✕
                </button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <RequestDetailBody id={panelId} embedded onClose={() => setPanelId(null)} onChanged={load} />
            </div>
          </aside>
        </>
      ) : null}
    </DashboardLayout>
  )
}
