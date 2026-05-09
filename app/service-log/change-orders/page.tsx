'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'

interface ChangeOrder {
  id: string
  received_at: string
  source: string
  requester: string | null
  summary: string
  classification: 'FIX' | 'NEW' | 'MIXED'
  repo: string | null
  area: string | null
  project: string | null
  estimated_hours: number | null
  estimated_usd: number | null
  quote_amount: number | null
  paid_amount: number | null
  retainer_covered: boolean
  status: string
  started_at: string | null
  approved_at: string | null
  shipped_at: string | null
  paid_at: string | null
  actual_hours: number | null
  notes: string | null
}

const PROJECTS: { key: string; label: string; tone: string }[] = [
  { key: 'all',               label: 'All stakeholder',  tone: 'border-zinc-300 text-zinc-700 bg-white' },
  { key: 'service-dashboard', label: 'Service Dashboard',tone: 'border-blue-300 text-blue-800 bg-blue-50' },
  { key: 'proposal-engine',   label: 'Proposal Engine',  tone: 'border-purple-300 text-purple-800 bg-purple-50' },
  { key: 'crm',               label: 'CRM',              tone: 'border-emerald-300 text-emerald-800 bg-emerald-50' },
  { key: 'kb',                label: 'Knowledge Base',   tone: 'border-amber-300 text-amber-800 bg-amber-50' },
  { key: 'mirror-mode',       label: 'Mirror Mode',      tone: 'border-rose-300 text-rose-800 bg-rose-50' },
  { key: 'anything-llm',      label: 'AI Assistant',     tone: 'border-indigo-300 text-indigo-800 bg-indigo-50' },
  { key: 'internal',          label: 'Internal · my workflow', tone: 'border-slate-300 text-slate-700 bg-slate-50' },
]

type Stage = 'open' | 'quoted' | 'approved' | 'in_progress' | 'shipped' | 'paid' | 'cancelled'

const COLUMNS: { key: Stage; label: string; tone: string; description: string }[] = [
  { key: 'open', label: 'Requested', tone: 'border-amber-300 bg-amber-50', description: 'Triaged, awaiting a proposal' },
  { key: 'quoted', label: 'Quoted', tone: 'border-purple-300 bg-purple-50', description: 'Proposal sent, waiting on stakeholder' },
  { key: 'approved', label: 'Approved', tone: 'border-blue-300 bg-blue-50', description: 'Greenlit, ready to start' },
  { key: 'in_progress', label: 'In Progress', tone: 'border-indigo-300 bg-indigo-50', description: 'Work in flight' },
  { key: 'shipped', label: 'Shipped', tone: 'border-emerald-300 bg-emerald-50', description: 'Delivered, awaiting payment' },
  { key: 'paid', label: 'Paid', tone: 'border-teal-300 bg-teal-50', description: 'Closed out' },
]

const CLASSIFICATION_TONE: Record<string, string> = {
  FIX: 'bg-emerald-100 text-emerald-800',
  NEW: 'bg-purple-100 text-purple-800',
  MIXED: 'bg-orange-100 text-orange-800',
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtUSD(n: number | null | undefined): string {
  if (!n || !Number.isFinite(n)) return ''
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `$${Math.round(n)}`
}

function ageInDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

export default function ChangeOrdersKanbanPage() {
  const [orders, setOrders] = useState<ChangeOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [showCancelled, setShowCancelled] = useState(false)
  const [openCard, setOpenCard] = useState<ChangeOrder | null>(null)
  const [activeProject, setActiveProject] = useState<string>('all')
  const [projectCounts, setProjectCounts] = useState<Record<string, number>>({})

  const refresh = async () => {
    setLoading(true)
    // Internal board includes auto-push rows (Ahmad's own work). All other
    // tabs only show stakeholder COs (retainer=false excludes auto-push by
    // default).
    const params = new URLSearchParams({ limit: '300' })
    if (activeProject === 'internal') {
      params.set('project', 'internal')
    } else if (activeProject === 'all') {
      params.set('retainer', 'false')
    } else {
      params.set('retainer', 'false')
      params.set('project', activeProject)
    }
    const [boardRes, countsRes] = await Promise.all([
      fetch(`/api/service-triage?${params.toString()}`).then(r => r.json()),
      fetch('/api/service-triage?limit=500').then(r => r.json()),
    ])
    setOrders(boardRes.requests || [])
    const counts: Record<string, number> = { all: 0 }
    for (const row of (countsRes.requests || []) as ChangeOrder[]) {
      const p = row.project || 'service-dashboard'
      const stage = row.status
      const isStakeholder = row.source !== 'auto-push'
      const isActive = stage !== 'cancelled' && stage !== 'paid'
      if (!isActive) continue
      if (p !== 'internal' && isStakeholder) counts.all = (counts.all || 0) + 1
      counts[p] = (counts[p] || 0) + 1
    }
    setProjectCounts(counts)
    setLoading(false)
  }

  useEffect(() => { refresh() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [activeProject])

  const byStage = useMemo(() => {
    const map: Record<Stage, ChangeOrder[]> = {
      open: [], quoted: [], approved: [], in_progress: [], shipped: [], paid: [], cancelled: [],
    }
    for (const o of orders) {
      const stage = (o.status as Stage) in map ? (o.status as Stage) : 'open'
      map[stage].push(o)
    }
    return map
  }, [orders])

  const totals = useMemo(() => {
    const open = byStage.open.length + byStage.quoted.length + byStage.approved.length + byStage.in_progress.length + byStage.shipped.length
    const paid = byStage.paid.length
    const pipelineUSD = [...byStage.open, ...byStage.quoted, ...byStage.approved, ...byStage.in_progress, ...byStage.shipped]
      .reduce((sum, o) => sum + Number(o.quote_amount || o.estimated_usd || 0), 0)
    const paidUSD = byStage.paid.reduce((sum, o) => sum + Number(o.paid_amount || o.quote_amount || o.estimated_usd || 0), 0)
    return { open, paid, pipelineUSD, paidUSD }
  }, [byStage])

  const act = async (id: string, action: string, extra: Record<string, unknown> = {}) => {
    await fetch(`/api/service-triage/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    })
    await refresh()
    setOpenCard(null)
  }

  const advance = async (o: ChangeOrder) => {
    if (o.status === 'open') {
      const amt = window.prompt('Quote amount in USD?', String(o.estimated_usd || ''))
      if (amt === null) return
      const n = Number(amt)
      await act(o.id, 'quote', { quote_amount: Number.isFinite(n) && n > 0 ? n : undefined })
    } else if (o.status === 'quoted') {
      await act(o.id, 'approve')
    } else if (o.status === 'approved') {
      await act(o.id, 'start')
    } else if (o.status === 'in_progress') {
      const hrs = window.prompt('Actual hours spent?', String(o.estimated_hours || ''))
      if (hrs === null) return
      const n = Number(hrs)
      if (!Number.isFinite(n) || n < 0) return
      await act(o.id, 'ship', { actual_hours: n })
    } else if (o.status === 'shipped') {
      const amt = window.prompt('Paid amount in USD?', String(o.quote_amount || o.estimated_usd || ''))
      if (amt === null) return
      const n = Number(amt)
      await act(o.id, 'mark_paid', { paid_amount: Number.isFinite(n) && n > 0 ? n : undefined })
    }
  }

  const advanceLabel = (status: string): string => {
    switch (status) {
      case 'open': return 'Send quote →'
      case 'quoted': return 'Mark approved →'
      case 'approved': return 'Start work →'
      case 'in_progress': return 'Ship →'
      case 'shipped': return 'Mark paid →'
      default: return ''
    }
  }

  const isInternal = activeProject === 'internal'

  return (
    <DashboardLayout>
      <div className="p-6 max-w-[1600px] mx-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
              <Link href="/service-log" className="hover:underline">Service Log</Link>
              <span>›</span>
              <span>Project boards</span>
            </div>
            <h1 className="text-2xl font-semibold text-gray-900">
              {isInternal ? 'Internal · my workflow' : 'Change Orders'}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {isInternal
                ? "Ahmad's own pushes captured automatically by the pre-push ledger. These are workflow improvements, not stakeholder asks — they don't count against the 12-hr retainer or show up on the stakeholder boards."
                : 'NEW work outside the 12-hr/month retainer. Each one needs a separate quote. Drag work through the stages — Requested → Quoted → Approved → In Progress → Shipped → Paid.'}
            </p>
          </div>
          <Link
            href="/transparency"
            className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 whitespace-nowrap"
          >
            ← Back to transparency
          </Link>
        </div>

        {/* Project tabs */}
        <div className="flex flex-wrap gap-2 mb-4 border-b border-gray-200 pb-2">
          {PROJECTS.map(p => {
            const count = projectCounts[p.key] || 0
            const active = activeProject === p.key
            const hidden = !active && count === 0 && p.key !== 'all'
            if (hidden) return null
            return (
              <button
                key={p.key}
                onClick={() => setActiveProject(p.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  active
                    ? p.tone + ' shadow-sm'
                    : 'border-transparent text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p.label}
                {count > 0 && (
                  <span className={`ml-1.5 inline-block px-1.5 rounded-full text-[10px] tabular-nums ${active ? 'bg-white/60' : 'bg-gray-200 text-gray-700'}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">In Pipeline</div>
            <div className="text-xl font-semibold text-gray-900 tabular-nums">{totals.open}</div>
            <div className="text-xs text-gray-500">requests across the funnel</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Pipeline value</div>
            <div className="text-xl font-semibold text-gray-900 tabular-nums">{fmtUSD(totals.pipelineUSD) || '—'}</div>
            <div className="text-xs text-gray-500">quoted / estimated, not yet paid</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Paid</div>
            <div className="text-xl font-semibold text-gray-900 tabular-nums">{totals.paid}</div>
            <div className="text-xs text-gray-500">closed change orders</div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Paid value</div>
            <div className="text-xl font-semibold text-gray-900 tabular-nums">{fmtUSD(totals.paidUSD) || '—'}</div>
            <div className="text-xs text-gray-500">cumulative</div>
          </div>
        </div>

        <div className="overflow-x-auto pb-4">
          <div className="grid grid-cols-6 gap-3 min-w-[1320px]">
            {COLUMNS.map(col => {
              const items = byStage[col.key]
              const sumUSD = items.reduce((s, o) => s + Number(
                col.key === 'paid' ? (o.paid_amount || o.quote_amount || o.estimated_usd || 0)
                  : (o.quote_amount || o.estimated_usd || 0)
              ), 0)
              return (
                <div key={col.key} className={`rounded-lg border-2 ${col.tone} p-3 min-h-[200px]`}>
                  <div className="flex items-baseline justify-between mb-1">
                    <div className="text-sm font-semibold text-gray-900">{col.label}</div>
                    <div className="text-xs text-gray-600 tabular-nums">{items.length} {sumUSD > 0 ? `· ${fmtUSD(sumUSD)}` : ''}</div>
                  </div>
                  <div className="text-[11px] text-gray-500 mb-3">{col.description}</div>
                  <div className="space-y-2">
                    {items.length === 0 && (
                      <div className="text-xs text-gray-400 italic py-4 text-center">empty</div>
                    )}
                    {items.map(o => {
                      const usd = o.quote_amount || o.estimated_usd
                      const paidUsd = o.paid_amount
                      const age = ageInDays(o.received_at)
                      const stale = (col.key === 'open' && age >= 3) || (col.key === 'quoted' && age >= 7) || (col.key === 'shipped' && age >= 14)
                      return (
                        <button
                          key={o.id}
                          onClick={() => setOpenCard(o)}
                          className={`block w-full text-left rounded-md border bg-white p-2.5 hover:shadow-sm transition-shadow ${stale ? 'border-red-300 ring-1 ring-red-100' : 'border-gray-200'}`}
                        >
                          <div className="flex items-start gap-1.5 mb-1">
                            <span className={`inline-block px-1.5 py-0.5 text-[9px] font-bold rounded ${CLASSIFICATION_TONE[o.classification]}`}>
                              {o.classification}
                            </span>
                            {stale && <span className="text-[9px] font-bold text-red-600 uppercase tracking-wide">stale</span>}
                          </div>
                          <div className="text-xs text-gray-900 line-clamp-3 mb-1.5">{o.summary}</div>
                          <div className="flex items-center justify-between text-[10px] text-gray-500">
                            <span>{o.requester || '—'}</span>
                            <span className="tabular-nums">
                              {col.key === 'paid' ? fmtUSD(paidUsd || usd) : fmtUSD(usd) || (o.estimated_hours ? `${o.estimated_hours}h` : '')}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-gray-400 mt-0.5">
                            <span>{o.repo && o.area ? `${o.repo}/${o.area}` : (o.repo || '—')}</span>
                            <span>{fmtDate(o.received_at)}</span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {byStage.cancelled.length > 0 && (
          <div className="mt-6">
            <button
              onClick={() => setShowCancelled(s => !s)}
              className="text-xs text-gray-500 hover:text-gray-700 mb-2"
            >
              {showCancelled ? '▾' : '▸'} Cancelled ({byStage.cancelled.length})
            </button>
            {showCancelled && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {byStage.cancelled.map(o => (
                  <button
                    key={o.id}
                    onClick={() => setOpenCard(o)}
                    className="text-left rounded-md border border-gray-200 bg-gray-50 p-2.5 opacity-70 hover:opacity-100"
                  >
                    <div className="text-xs text-gray-700 line-clamp-2">{o.summary}</div>
                    <div className="text-[10px] text-gray-500 mt-1">{o.requester || '—'} · {fmtDate(o.received_at)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {loading && (
          <div className="text-sm text-gray-400 text-center py-8">Loading…</div>
        )}

        {openCard && (
          <CardDetailDrawer
            order={openCard}
            onClose={() => setOpenCard(null)}
            onAdvance={() => advance(openCard)}
            advanceLabel={advanceLabel(openCard.status)}
            onRevert={() => act(openCard.id, 'revert')}
            onCancel={async () => {
              if (!confirm('Cancel this change order? It will move to the cancelled bin.')) return
              await fetch(`/api/service-triage/${openCard.id}`, { method: 'DELETE' })
              await refresh()
              setOpenCard(null)
            }}
            onUpdateNote={async (notes: string) => {
              await act(openCard.id, 'update', { notes })
            }}
            onUpdateUSD={async (usd: number) => {
              await act(openCard.id, 'update', { estimated_hours: openCard.estimated_hours })
              await fetch(`/api/service-triage/${openCard.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'quote', quote_amount: usd }),
              })
              await refresh()
            }}
          />
        )}
      </div>
    </DashboardLayout>
  )
}

function CardDetailDrawer({
  order, onClose, onAdvance, advanceLabel, onRevert, onCancel, onUpdateNote, onUpdateUSD,
}: {
  order: ChangeOrder
  onClose: () => void
  onAdvance: () => void
  advanceLabel: string
  onRevert: () => void
  onCancel: () => void
  onUpdateNote: (notes: string) => Promise<void>
  onUpdateUSD: (usd: number) => Promise<void>
}) {
  const [notes, setNotes] = useState(order.notes || '')
  const [usd, setUsd] = useState(String(order.quote_amount || order.estimated_usd || ''))

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative w-full max-w-lg bg-white shadow-xl overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">Change Order</div>
            <div className="text-lg font-semibold text-gray-900">{order.requester || 'Unknown requester'}</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2 text-xs">
            <span className={`px-2 py-0.5 rounded ${CLASSIFICATION_TONE[order.classification]}`}>
              {order.classification}
            </span>
            <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 capitalize">
              {order.status.replace('_', ' ')}
            </span>
            <span className="text-gray-500">{fmtDate(order.received_at)}</span>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Summary</div>
            <div className="text-sm text-gray-900 whitespace-pre-wrap">{order.summary}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Area</div>
              <div className="text-sm font-mono text-gray-700">{order.repo && order.area ? `${order.repo}/${order.area}` : '—'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Estimated</div>
              <div className="text-sm tabular-nums text-gray-700">{order.estimated_hours ? `${order.estimated_hours}h` : '—'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Actual</div>
              <div className="text-sm tabular-nums text-gray-700">{order.actual_hours !== null ? `${order.actual_hours}h` : '—'}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500">Source</div>
              <div className="text-sm text-gray-700 capitalize">{order.source}</div>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Quote (USD)</div>
            <div className="flex gap-2">
              <input
                value={usd}
                onChange={e => setUsd(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-md text-sm tabular-nums"
                placeholder="0"
                type="number"
              />
              <button
                onClick={() => {
                  const n = Number(usd)
                  if (Number.isFinite(n) && n > 0) onUpdateUSD(n)
                }}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Save quote
              </button>
            </div>
            {order.paid_amount !== null && (
              <div className="text-xs text-emerald-700 mt-1">Paid: {fmtUSD(order.paid_amount)} on {order.paid_at ? fmtDate(order.paid_at) : '—'}</div>
            )}
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Notes</div>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="Internal notes — link to proposal, payment refs, decisions..."
            />
            <button
              onClick={() => onUpdateNote(notes)}
              className="text-xs text-blue-600 hover:underline mt-1"
            >
              Save notes
            </button>
          </div>

          <div className="border-t border-gray-200 pt-4 space-y-2">
            {advanceLabel && (
              <button
                onClick={onAdvance}
                className="w-full px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
              >
                {advanceLabel}
              </button>
            )}
            <div className="flex gap-2">
              {order.status !== 'open' && order.status !== 'cancelled' && (
                <button
                  onClick={onRevert}
                  className="flex-1 px-3 py-2 text-xs border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  ← Move back one stage
                </button>
              )}
              {order.status !== 'cancelled' && (
                <button
                  onClick={onCancel}
                  className="flex-1 px-3 py-2 text-xs border border-red-300 text-red-700 rounded-md hover:bg-red-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          <div className="text-[10px] text-gray-400 border-t border-gray-100 pt-2">
            <div>id: {order.id}</div>
            {order.approved_at && <div>approved: {new Date(order.approved_at).toLocaleString()}</div>}
            {order.started_at && <div>started: {new Date(order.started_at).toLocaleString()}</div>}
            {order.shipped_at && <div>shipped: {new Date(order.shipped_at).toLocaleString()}</div>}
            {order.paid_at && <div>paid: {new Date(order.paid_at).toLocaleString()}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
