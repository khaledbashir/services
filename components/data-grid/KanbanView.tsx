'use client'

// KanbanView — column-per-status board with HTML5 drag-and-drop. Groups
// rows by a singleSelect column (default = first singleSelect in the
// schema, or whatever the view config specifies as `groupBy`). Drop a
// card into a different column to PATCH the row's status field — all
// optimistic via the same onUpdateCell flow the grid uses.

import { useMemo, useState } from 'react'
import type { ColumnConfig } from './types'
import { pillClass } from './types'

interface KanbanProps<TRow extends { id: string }> {
  rows: TRow[]
  columns: ColumnConfig<TRow>[]
  groupBy: string
  onUpdateCell?: (rowId: string, columnId: string, value: any, patch: Record<string, any>) => Promise<void>
  onOpenRecord?: (row: TRow) => void
}

export function KanbanView<TRow extends { id: string }>({
  rows, columns, groupBy, onUpdateCell, onOpenRecord,
}: KanbanProps<TRow>) {
  const groupCol = columns.find(c => c.id === groupBy)
  const primary = columns.find(c => c.primary) || columns[0]
  const summaryCols = columns
    .filter(c => c.id !== primary.id && c.id !== groupBy && c.type !== 'attachment' && c.type !== 'longText')
    .slice(0, 3)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)

  // Each option becomes a column. If no options are configured (singleSelect
  // without options), fall back to the unique values present in the data.
  const lanes = useMemo(() => {
    if (groupCol?.options?.length) return groupCol.options
    const seen = new Set<string>()
    for (const r of rows) {
      const v = (r as any)[groupBy]
      if (v != null && v !== '') seen.add(String(v))
    }
    return Array.from(seen).map(v => ({ value: v, label: v, color: 'zinc' }))
  }, [rows, groupBy, groupCol])

  const byLane = useMemo(() => {
    const m = new Map<string, TRow[]>()
    for (const r of rows) {
      const v = (r as any)[groupBy]
      const key = v == null || v === '' ? '__none__' : String(v)
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(r)
    }
    return m
  }, [rows, groupBy])

  if (!groupCol) {
    return (
      <div className="px-5 py-16 text-center text-sm text-zinc-400">
        Kanban view needs a singleSelect column. Add `groupBy` to this view, or include a column with type `singleSelect`.
      </div>
    )
  }

  const onDrop = async (laneValue: string) => {
    setDragOver(null)
    if (!dragId) return
    const row = rows.find(r => r.id === dragId)
    if (!row) return
    const current = (row as any)[groupBy]
    setDragId(null)
    if (current === laneValue) return
    try {
      await onUpdateCell?.(dragId, groupBy, laneValue, { [groupBy]: laneValue })
    } catch {}
  }

  return (
    <div className="overflow-x-auto" style={{ maxHeight: 'calc(100vh - 220px)' }}>
      <div className="flex gap-3 p-3 min-w-max">
        {lanes.map(lane => {
          const laneRows = byLane.get(lane.value) || []
          const isOver = dragOver === lane.value
          return (
            <div
              key={lane.value}
              onDragOver={e => { e.preventDefault(); setDragOver(lane.value) }}
              onDragLeave={() => setDragOver(curr => curr === lane.value ? null : curr)}
              onDrop={() => onDrop(lane.value)}
              className={
                'w-72 flex-shrink-0 rounded-xl border bg-zinc-50/60 flex flex-col ' +
                (isOver ? 'border-[#0A52EF] bg-[#0A52EF]/5' : 'border-zinc-200')
              }
              style={{ maxHeight: 'calc(100vh - 240px)' }}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200">
                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11.5px] font-medium ${pillClass(lane.color)}`}>
                  {lane.label}
                </span>
                <span className="text-[11px] text-zinc-500 tabular-nums">{laneRows.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {laneRows.map(row => {
                  const r: any = row
                  return (
                    <div
                      key={row.id}
                      draggable
                      onDragStart={() => setDragId(row.id)}
                      onDragEnd={() => setDragId(null)}
                      onClick={() => onOpenRecord?.(row)}
                      className="bg-white border border-zinc-200 rounded-lg p-2.5 cursor-grab active:cursor-grabbing hover:border-[#0A52EF]/40 hover:shadow-sm transition-all"
                    >
                      <div className="text-[12.5px] font-medium text-zinc-900 truncate">{r[primary.id] || row.id}</div>
                      {summaryCols.length > 0 && (
                        <dl className="mt-1.5 space-y-0.5 text-[10.5px]">
                          {summaryCols.map(c => {
                            const raw = r[c.id]
                            if (raw == null || raw === '') return null
                            const display = c.type === 'date' && typeof raw === 'string'
                              ? new Date(raw + 'T00:00:00').toLocaleDateString()
                              : c.type === 'dateTime' && raw
                              ? new Date(raw).toLocaleDateString()
                              : c.type === 'singleSelect'
                              ? (c.options?.find(o => o.value === raw)?.label || String(raw))
                              : String(raw)
                            return (
                              <div key={c.id} className="flex gap-1.5 items-baseline truncate">
                                <dt className="text-zinc-400 uppercase tracking-wider text-[9px] flex-shrink-0">{c.header}</dt>
                                <dd className="text-zinc-700 truncate">{display}</dd>
                              </div>
                            )
                          })}
                        </dl>
                      )}
                    </div>
                  )
                })}
                {laneRows.length === 0 && (
                  <div className="px-2 py-6 text-center text-[11px] text-zinc-300">Drop here</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
