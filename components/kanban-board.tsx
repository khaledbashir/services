'use client'

import { ReactNode, useState } from 'react'

export interface KanbanColumn {
  key: string
  label: string
  /** Tailwind solid color class for the column dot, e.g. 'bg-amber-500'. */
  accent: string
  /** Optional override for the column header tint. Derived from accent if omitted. */
  headerTint?: string
}

interface Props<T> {
  items: T[]
  columns: KanbanColumn[]
  statusOf: (item: T) => string
  onStatusChange: (item: T, newStatus: string) => void | Promise<void>
  renderCard: (item: T) => ReactNode
  keyOf: (item: T) => string
  /** 'horizontal' (default) renders the classic side-by-side board.
   * 'stacked' renders each column as a full-width section with a responsive card grid — no horizontal scroll. */
  layout?: 'horizontal' | 'stacked'
}

// "bg-amber-500" -> "bg-amber-50/60" for a soft column-header wash.
function deriveTint(accent: string): string {
  const m = accent.match(/^bg-([a-z]+)-\d+$/)
  if (!m) return 'bg-zinc-50/60'
  return `bg-${m[1]}-50/60`
}

export function KanbanBoard<T>({ items, columns, statusOf, onStatusChange, renderCard, keyOf, layout = 'horizontal' }: Props<T>) {
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [hoverCol, setHoverCol] = useState<string | null>(null)

  const byColumn: Record<string, T[]> = {}
  for (const col of columns) byColumn[col.key] = []
  const validKeys = new Set(columns.map(c => c.key))
  for (const item of items) {
    const s = statusOf(item)
    if (validKeys.has(s)) byColumn[s].push(item)
    else if (columns[0]) byColumn[columns[0].key].push(item)
  }

  const containerClass = layout === 'stacked'
    ? 'space-y-4'
    : 'grid gap-3 overflow-x-auto pb-2'
  const containerStyle = layout === 'stacked'
    ? undefined
    : { gridTemplateColumns: `repeat(${columns.length}, minmax(240px, 1fr))` }

  return (
    <div className={containerClass} style={containerStyle}>
      {columns.map(col => {
        const list = byColumn[col.key] || []
        const isHover = hoverCol === col.key
        const headerTint = col.headerTint || deriveTint(col.accent)
        return (
          <div
            key={col.key}
            onDragOver={(e) => { e.preventDefault(); if (hoverCol !== col.key) setHoverCol(col.key) }}
            onDragLeave={() => { if (hoverCol === col.key) setHoverCol(null) }}
            onDrop={async (e) => {
              e.preventDefault()
              setHoverCol(null)
              const key = e.dataTransfer.getData('text/plain')
              const dropped = items.find(i => keyOf(i) === key)
              if (dropped && statusOf(dropped) !== col.key) {
                await onStatusChange(dropped, col.key)
              }
            }}
            className={`rounded-xl ring-1 transition-colors flex flex-col overflow-hidden ${
              layout === 'stacked' ? '' : 'min-h-72'
            } ${
              isHover
                ? 'ring-[#0A52EF] bg-[#0A52EF]/[0.04] dark:bg-[#0A52EF]/[0.10]'
                : 'ring-zinc-200/80 dark:ring-zinc-700/60 bg-white dark:bg-zinc-900/40'
            }`}
          >
            <div className={`px-3.5 py-2.5 flex items-center justify-between border-b border-zinc-200/70 dark:border-zinc-700/60 ${headerTint}`}>
              <div className="flex items-center gap-2">
                <span className={`w-1.5 h-1.5 rounded-full ${col.accent} ring-2 ring-white dark:ring-zinc-900`} />
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-zinc-700 dark:text-zinc-200">{col.label}</span>
              </div>
              <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 tabular-nums bg-white/70 dark:bg-zinc-800/70 rounded-full px-2 py-0.5 ring-1 ring-zinc-200/60 dark:ring-zinc-700/60">
                {list.length}
              </span>
            </div>
            <div className={`p-2 flex-1 bg-zinc-50/40 dark:bg-zinc-900/20 ${
              layout === 'stacked'
                ? 'grid gap-2 grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
                : 'space-y-2'
            }`}>
              {list.map(item => {
                const k = keyOf(item)
                return (
                  <div
                    key={k}
                    draggable
                    onDragStart={(e) => { setDragKey(k); e.dataTransfer.setData('text/plain', k); e.dataTransfer.effectAllowed = 'move' }}
                    onDragEnd={() => setDragKey(null)}
                    className={`group rounded-xl bg-white dark:bg-zinc-800/60 ring-1 ring-zinc-200/80 dark:ring-zinc-700/60 p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] hover:shadow-[0_8px_20px_-8px_rgba(15,23,42,0.18)] hover:ring-zinc-300 dark:hover:ring-zinc-600 hover:-translate-y-0.5 transition-all cursor-grab active:cursor-grabbing ${dragKey === k ? 'opacity-40' : ''}`}
                  >
                    {renderCard(item)}
                  </div>
                )
              })}
              {list.length === 0 && (
                <div className={`text-[11px] text-zinc-400 dark:text-zinc-500 text-center py-6 tracking-wide ${
                  layout === 'stacked' ? 'col-span-full' : ''
                }`}>
                  <span className="opacity-60">nothing here</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
