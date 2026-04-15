'use client'

import { ReactNode, useState } from 'react'

export interface KanbanColumn {
  key: string
  label: string
  accent: string // tailwind color class e.g. 'bg-amber-500'
}

interface Props<T> {
  items: T[]
  columns: KanbanColumn[]
  statusOf: (item: T) => string
  onStatusChange: (item: T, newStatus: string) => void | Promise<void>
  renderCard: (item: T) => ReactNode
  keyOf: (item: T) => string
}

export function KanbanBoard<T>({ items, columns, statusOf, onStatusChange, renderCard, keyOf }: Props<T>) {
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [hoverCol, setHoverCol] = useState<string | null>(null)

  const byColumn: Record<string, T[]> = {}
  for (const col of columns) byColumn[col.key] = []
  for (const item of items) {
    const s = statusOf(item)
    if (byColumn[s]) byColumn[s].push(item)
    else if (byColumn[columns[0].key]) byColumn[columns[0].key].push(item)
  }

  return (
    <div className="grid gap-3 overflow-x-auto pb-2" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(260px, 1fr))` }}>
      {columns.map(col => {
        const list = byColumn[col.key] || []
        const isHover = hoverCol === col.key
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
            className={`rounded-2xl border ${isHover ? 'border-[#0A52EF] bg-[#0A52EF]/5' : 'border-[#E8E8E8] bg-zinc-50/70'} min-h-72`}
          >
            <div className="px-3 py-2 flex items-center justify-between border-b border-[#E8E8E8]">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${col.accent}`} />
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600">{col.label}</span>
              </div>
              <span className="text-xs font-medium text-zinc-500 tabular-nums">{list.length}</span>
            </div>
            <div className="p-2 space-y-2">
              {list.map(item => {
                const k = keyOf(item)
                return (
                  <div
                    key={k}
                    draggable
                    onDragStart={(e) => { setDragKey(k); e.dataTransfer.setData('text/plain', k); e.dataTransfer.effectAllowed = 'move' }}
                    onDragEnd={() => setDragKey(null)}
                    className={`rounded-xl bg-white border border-[#E8E8E8] p-3 shadow-sm hover:shadow-md transition-shadow cursor-grab active:cursor-grabbing ${dragKey === k ? 'opacity-40' : ''}`}
                  >
                    {renderCard(item)}
                  </div>
                )
              })}
              {list.length === 0 && <div className="text-xs text-zinc-400 text-center py-6">— empty —</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}
