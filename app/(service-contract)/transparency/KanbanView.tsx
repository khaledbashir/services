'use client'

import { useState, useTransition, DragEvent } from 'react'
import { useRouter } from 'next/navigation'

interface TriagedRequest {
  id: string
  received_at: string
  requester: string | null
  summary: string
  classification: 'FIX' | 'NEW' | 'MIXED'
  status: string
  retainer_covered: boolean
  estimated_hours: number | null
  estimated_usd: number | null
  shipped_at: string | null
  actual_hours: number | null
}

interface Props {
  requests: TriagedRequest[]
}

const COLUMNS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'open',        label: 'Open',         hint: 'awaiting triage / start' },
  { key: 'in_progress', label: 'In progress',  hint: 'work underway' },
  { key: 'quoted',      label: 'Quoted',       hint: 'CO awaiting approval' },
  { key: 'shipped',     label: 'Shipped',      hint: 'delivered' },
]

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fmtUSD(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1000) return '$' + (n / 1000).toFixed(1) + 'k'
  return '$' + Math.round(n).toLocaleString('en-US')
}

function initials(name: string | null): string {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? '')
    .join('')
}

// Allowed drag transitions and their action payloads
function transitionAction(from: string, to: string): { action: string; needsHours?: boolean } | null {
  if (from === to) return null
  if (to === 'in_progress') return { action: 'start' }
  if (to === 'quoted') return { action: 'quote' }
  if (to === 'shipped') return { action: 'ship', needsHours: true }
  // open is the initial state — only allowed back-direction is reclassification, not a status revert
  return null
}

export default function KanbanView({ requests }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState<Record<string, string>>({})
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const effectiveStatus = (r: TriagedRequest) => optimistic[r.id] || r.status

  const grouped = COLUMNS.reduce<Record<string, TriagedRequest[]>>((acc, col) => {
    acc[col.key] = requests
      .filter((r) => effectiveStatus(r) === col.key)
      .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())
    return acc
  }, {})

  async function moveCard(id: string, fromStatus: string, toStatus: string) {
    const transition = transitionAction(fromStatus, toStatus)
    if (!transition) {
      setError(`Can't move from ${fromStatus} → ${toStatus} directly. Use the row menu to reclassify or cancel.`)
      setTimeout(() => setError(null), 4000)
      return
    }

    let body: Record<string, unknown> = { action: transition.action }
    if (transition.needsHours) {
      const ans = window.prompt(
        'Actual hours spent on this fix? (e.g. 0.5)',
        '0.5',
      )
      if (ans == null) return
      const hrs = Number(ans)
      if (!Number.isFinite(hrs) || hrs < 0) {
        setError('Hours must be a non-negative number')
        setTimeout(() => setError(null), 4000)
        return
      }
      body.actual_hours = hrs
    }

    setOptimistic((m) => ({ ...m, [id]: toStatus }))

    try {
      const res = await fetch(`/api/service-triage/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      startTransition(() => router.refresh())
    } catch (e) {
      setOptimistic((m) => {
        const { [id]: _, ...rest } = m
        return rest
      })
      setError(e instanceof Error ? e.message : 'Update failed')
      setTimeout(() => setError(null), 5000)
    }
  }

  const onDragStart = (e: DragEvent<HTMLDivElement>, id: string) => {
    setDraggedId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }
  const onDragEnd = () => {
    setDraggedId(null)
    setDropTarget(null)
  }
  const onDragOver = (e: DragEvent<HTMLDivElement>, col: string) => {
    e.preventDefault()
    if (dropTarget !== col) setDropTarget(col)
  }
  const onDrop = (e: DragEvent<HTMLDivElement>, col: string) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain') || draggedId
    if (!id) return
    const r = requests.find((x) => x.id === id)
    if (!r) return
    setDropTarget(null)
    setDraggedId(null)
    void moveCard(id, effectiveStatus(r), col)
  }

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-md border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {COLUMNS.map((col) => {
          const cards = grouped[col.key] || []
          const isDropTarget = dropTarget === col.key
          return (
            <div
              key={col.key}
              onDragOver={(e) => onDragOver(e, col.key)}
              onDrop={(e) => onDrop(e, col.key)}
              className={`rounded-xl border p-3 transition-colors min-h-[200px] ${
                isDropTarget
                  ? 'border-blue-400 dark:border-blue-600 bg-blue-50/50 dark:bg-blue-950/30'
                  : 'border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/40'
              }`}
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                    {col.label}
                  </div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400">{col.hint}</div>
                </div>
                <span className="text-xs font-mono tabular-nums text-gray-500 dark:text-gray-400">
                  {cards.length}
                </span>
              </div>

              <div className="space-y-2">
                {cards.map((r) => {
                  const isFix = r.classification === 'FIX' && r.retainer_covered
                  const stripe = isFix ? 'border-l-blue-500' : 'border-l-amber-500'
                  const dim = draggedId === r.id ? 'opacity-50' : ''
                  return (
                    <div
                      key={r.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, r.id)}
                      onDragEnd={onDragEnd}
                      className={`bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-800 border-l-4 ${stripe} ${dim} p-2.5 cursor-grab active:cursor-grabbing shadow-sm hover:shadow transition-shadow`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span
                          className={`text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded ${
                            isFix
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                          }`}
                        >
                          {isFix ? 'CONTRACT' : 'CHANGE ORDER'}
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500 tabular-nums">
                          {fmtDate(r.received_at)}
                        </span>
                      </div>
                      <div className="text-xs leading-snug text-gray-700 dark:text-gray-300 line-clamp-3">
                        {r.summary}
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        {r.requester ? (
                          <span
                            title={r.requester}
                            className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 text-[9px] font-bold text-gray-700 dark:text-gray-300"
                          >
                            {initials(r.requester)}
                          </span>
                        ) : (
                          <span />
                        )}
                        <span className="text-[10px] font-mono tabular-nums text-gray-500 dark:text-gray-400">
                          {col.key === 'shipped' && r.actual_hours != null
                            ? `${r.actual_hours}h`
                            : isFix
                              ? r.estimated_hours != null
                                ? `~${r.estimated_hours}h`
                                : ''
                              : fmtUSD(r.estimated_usd)}
                        </span>
                      </div>
                    </div>
                  )
                })}
                {cards.length === 0 ? (
                  <div className="text-[11px] text-gray-400 dark:text-gray-500 italic px-1 py-3 text-center">
                    drop here
                  </div>
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      {isPending ? (
        <div className="text-[11px] text-gray-500 dark:text-gray-400 text-center">syncing…</div>
      ) : null}
    </div>
  )
}
