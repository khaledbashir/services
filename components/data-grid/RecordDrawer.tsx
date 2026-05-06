'use client'

// RecordDrawer — Airtable's expand-record overlay. Side-anchored sheet that
// renders every column as a labeled field, supports inline edit, and is the
// canonical place to edit attachments / linked records (which the grid only
// shows read-only).
//
// Pair with <DataGrid> by passing `onOpenRecord` to expand a row into here.

import { useEffect, useState } from 'react'
import type { ColumnConfig } from './types'
import { GridCell } from './cells'

interface Props<TRow extends { id: string }> {
  open: boolean
  row: TRow | null
  columns: ColumnConfig<TRow>[]
  onClose: () => void
  onUpdate?: (rowId: string, columnId: string, value: any, patch: Record<string, any>) => Promise<void>
  onDelete?: (rowId: string) => Promise<void>
  title?: (row: TRow) => string
}

export function RecordDrawer<TRow extends { id: string }>({
  open, row, columns, onClose, onUpdate, onDelete, title,
}: Props<TRow>) {
  const [local, setLocal] = useState<TRow | null>(row)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => { setLocal(row) }, [row])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !local) return null

  const save = async (col: ColumnConfig, v: any) => {
    setLocal(l => (l ? { ...l, [col.id]: v } : l))
    try {
      const patch = col.toPatch ? col.toPatch(v) : { [col.id]: v }
      await onUpdate?.(local.id, col.id, v, patch)
    } catch (err) {
      // Roll back on failure.
      setLocal(row)
      throw err
    }
  }

  const heading = title ? title(local) : 'Record'

  return (
    <div className="fixed inset-0 z-[60] flex" role="dialog" aria-modal>
      {/* Scrim */}
      <button
        aria-label="Close"
        className="flex-1 bg-black/20"
        onClick={onClose}
      />
      {/* Sheet */}
      <div className="w-[640px] max-w-[100vw] bg-white shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-200">
          <h2 className="text-base font-semibold text-zinc-900 truncate">{heading}</h2>
          <div className="flex items-center gap-2">
            {onDelete && (
              <button
                onClick={async () => {
                  if (!confirmDelete) { setConfirmDelete(true); return }
                  try { await onDelete(local.id); onClose() } catch {}
                }}
                className={`text-xs px-2.5 py-1 rounded-md border ${confirmDelete ? 'bg-rose-600 border-rose-600 text-white' : 'border-zinc-200 text-zinc-500 hover:text-rose-600 hover:border-rose-200'}`}
              >
                {confirmDelete ? 'Confirm delete' : 'Delete'}
              </button>
            )}
            <button onClick={onClose} aria-label="Close" className="h-7 w-7 inline-flex items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {columns.map(col => (
            <div key={col.id} className="grid grid-cols-[180px_1fr] items-start gap-3">
              <label className="text-[11px] font-medium uppercase tracking-[0.1em] text-zinc-500 pt-1.5">{col.header}</label>
              <div className="min-h-[34px] border border-zinc-200 rounded-md bg-white">
                <GridCell
                  col={{ ...col, primary: false }}
                  value={(local as any)[col.id]}
                  row={local}
                  onSave={async v => save(col, v)}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 border-t border-zinc-200 text-[11px] text-zinc-400 tabular-nums">
          ID: {local.id}
        </div>
      </div>
    </div>
  )
}
