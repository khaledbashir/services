'use client'

// DataGrid — the canonical Airtable-feel grid for anc-services. Every list
// page consumes this component and supplies a column config + a row source.
// Built on TanStack Table v8 (headless) + react-virtual; styled to match the
// Airtable visual language (frozen primary col, pill chips, inline thumbs,
// 32px row height, hover-row expand button to drawer).

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  type SortingState,
  type ColumnDef,
  type VisibilityState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { ColumnConfig, DataGridProps } from './types'
import { GridCell } from './cells'
import { CalendarView } from './CalendarView'
import { GalleryView } from './GalleryView'
import { KanbanView } from './KanbanView'

const ROW_HEIGHT = 32
const HEADER_HEIGHT = 36

export function DataGrid<TRow extends { id: string }>({
  columns,
  rows,
  loading,
  onUpdateCell,
  onAddRow,
  onOpenRecord,
  title,
  emptyText = 'No records',
  views,
}: DataGridProps<TRow>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [activeViewId, setActiveViewId] = useState<string | null>(views?.[0]?.id ?? null)
  // Keep optimistic row patches in local state so saves render instantly.
  const [overrides, setOverrides] = useState<Record<string, Partial<TRow>>>({})

  const activeView = useMemo(
    () => (views && activeViewId ? views.find(v => v.id === activeViewId) || null : null),
    [views, activeViewId]
  )

  // When the active view changes, apply its sort + hidden-column config.
  useEffect(() => {
    if (!activeView) return
    if (activeView.sort) setSorting(activeView.sort.map(s => ({ id: s.id, desc: !!s.desc })))
  }, [activeView])

  const columnVisibility = useMemo<VisibilityState>(() => {
    if (!activeView?.hiddenColumns?.length) return {}
    return Object.fromEntries(activeView.hiddenColumns.map(id => [id, false]))
  }, [activeView])

  const filteredRows = useMemo(() => {
    if (!activeView?.filter) return rows
    return rows.filter(activeView.filter)
  }, [rows, activeView])

  const mergedRows = useMemo(() => {
    if (!Object.keys(overrides).length) return filteredRows
    return filteredRows.map(r => (overrides[r.id] ? { ...r, ...overrides[r.id] } : r))
  }, [filteredRows, overrides])

  const tableColumns = useMemo<ColumnDef<TRow>[]>(() => {
    const cols: ColumnDef<TRow>[] = columns.map(c => ({
      id: c.id,
      accessorFn: (row: any) => (c.format ? c.format(row[c.id], row) : row[c.id]),
      header: c.header,
      size: c.width || 160,
      minSize: c.minWidth || 60,
      meta: { config: c },
      enableSorting: c.type !== 'attachment' && c.type !== 'linkedRecord',
    }))
    return cols
  }, [columns])

  const table = useReactTable({
    data: mergedRows,
    columns: tableColumns,
    state: { sorting, globalFilter, columnVisibility },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
  })

  const rowModel = table.getRowModel()
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Group-by: build a flat virtualization list of header / data / spacer items.
  // When groupBy is unset we treat every row as its own (un-grouped) item, so
  // the rest of the render code stays uniform.
  type FlatItem =
    | { kind: 'header'; key: string; label: string; count: number; collapsed: boolean }
    | { kind: 'row'; key: string; rowIndex: number; groupKey: string | null }

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const groupedItems = useMemo<FlatItem[]>(() => {
    const groupColId = activeView?.groupBy
    if (!groupColId) {
      return rowModel.rows.map((_, idx) => ({ kind: 'row', key: `r-${idx}`, rowIndex: idx, groupKey: null } as FlatItem))
    }
    const groupCol = columns.find(c => c.id === groupColId)
    const buckets = new Map<string, number[]>()
    rowModel.rows.forEach((row, idx) => {
      const raw = (row.original as any)[groupColId]
      const key = raw == null || raw === '' ? '__empty__' : String(raw)
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key)!.push(idx)
    })
    const out: FlatItem[] = []
    Array.from(buckets.entries()).forEach(([key, idxs]) => {
      const label = key === '__empty__' ? `(no ${groupCol?.header || groupColId})` : (
        // If grouping by a singleSelect, render the option label instead of raw value.
        groupCol?.type === 'singleSelect'
          ? (groupCol.options?.find(o => o.value === key)?.label || key)
          : key
      )
      const collapsed = collapsedGroups.has(key)
      out.push({ kind: 'header', key, label, count: idxs.length, collapsed })
      if (!collapsed) for (const ri of idxs) out.push({ kind: 'row', key: `r-${ri}`, rowIndex: ri, groupKey: key })
    })
    return out
  }, [rowModel.rows, activeView, columns, collapsedGroups])

  const toggleGroup = (key: string) =>
    setCollapsedGroups(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })

  const virtualizer = useVirtualizer({
    count: groupedItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  const handleSave = async (rowId: string, columnId: string, value: any) => {
    const col = columns.find(c => c.id === columnId)!
    setOverrides(o => ({ ...o, [rowId]: { ...(o[rowId] || {}), [columnId]: value } as Partial<TRow> }))
    try {
      const patch = col.toPatch ? col.toPatch(value) : { [columnId]: value }
      await onUpdateCell?.(rowId, columnId, value, patch)
    } catch (err) {
      // Roll back the optimistic override on failure.
      setOverrides(o => {
        const { [rowId]: bad, ...rest } = o
        return rest
      })
      throw err
    }
  }

  const handleAddRow = async () => {
    if (!onAddRow || busy) return
    setBusy(true)
    try {
      const created = await onAddRow()
      if (onOpenRecord) onOpenRecord(created)
    } finally { setBusy(false) }
  }

  const totalWidth = tableColumns.reduce((sum, c: any) => sum + (c.size || 160), 0) + 56 // +56 for the row-handle col

  const viewIcon = (type?: string) => {
    switch (type) {
      case 'calendar': return '📅'
      case 'gallery':  return '🖼️'
      case 'kanban':   return '🗂️'
      default:         return '▦'
    }
  }

  return (
    <div className="flex flex-col bg-white border border-[#E8E8E8] rounded-2xl overflow-hidden">
      {/* View tab strip — Airtable-style. Only renders when views are configured. */}
      {views && views.length > 0 && (
        <div className="flex items-center gap-1 px-2 pt-2 pb-0 border-b border-zinc-100 bg-zinc-50/40 overflow-x-auto">
          {views.map(v => {
            const active = v.id === activeViewId
            const supported = !v.type || v.type === 'grid' || v.type === 'calendar' || v.type === 'gallery' || v.type === 'kanban'
            return (
              <button
                key={v.id}
                onClick={() => setActiveViewId(v.id)}
                className={
                  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors ' +
                  (active
                    ? 'border-[#0A52EF] text-[#0A52EF] bg-white'
                    : 'border-transparent text-zinc-500 hover:text-zinc-800 hover:bg-white/60')
                }
                title={supported ? v.name : `${v.name} — coming soon`}
              >
                <span className="text-[11px] leading-none opacity-70">{viewIcon(v.type)}</span>
                <span>{v.name}</span>
                {v.locked && (
                  <svg className="h-3 w-3 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Locked">
                    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
                {!supported && (
                  <span className="ml-1 text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-amber-100 text-amber-700">soon</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Toolbar — matches Airtable's compact toolbar feel */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200 bg-zinc-50/60">
        {title && <div className="text-sm font-semibold text-zinc-700 mr-2">{title}</div>}
        <div className="relative flex-1 max-w-sm">
          <input
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            placeholder="Search…"
            className="w-full pl-7 pr-3 py-1.5 border border-zinc-200 rounded-md text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
          />
          <svg className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
        </div>
        <div className="flex-1" />
        <span className="text-[11px] text-zinc-500 tabular-nums">{rowModel.rows.length} {rowModel.rows.length === 1 ? 'record' : 'records'}</span>
        {onAddRow && (
          <button
            onClick={handleAddRow}
            disabled={busy}
            className="px-3 py-1.5 bg-[#0A52EF] text-white rounded-md text-xs font-medium hover:bg-[#0840C0] disabled:opacity-50 inline-flex items-center gap-1"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14" /></svg>
            New
          </button>
        )}
      </div>

      {/* Non-grid view types replace the grid body entirely; toolbar + tabs
          stay in place. */}
      {activeView?.type === 'calendar' ? (() => {
        const dateField = activeView.dateField || columns.find(c => c.type === 'date' || c.type === 'dateTime')?.id
        if (!dateField) {
          return (
            <div className="px-5 py-16 text-center text-sm text-zinc-400">
              Calendar view needs a date column. Add `dateField` to this view, or include a column with type `date` / `dateTime`.
            </div>
          )
        }
        return (
          <CalendarView
            rows={mergedRows}
            columns={columns}
            dateField={dateField}
            onOpenRecord={onOpenRecord}
          />
        )
      })() : activeView?.type === 'gallery' ? (
        <GalleryView
          rows={mergedRows}
          columns={columns}
          onOpenRecord={onOpenRecord}
        />
      ) : activeView?.type === 'kanban' ? (() => {
        const groupKey = activeView.groupBy || columns.find(c => c.type === 'singleSelect')?.id
        if (!groupKey) {
          return (
            <div className="px-5 py-16 text-center text-sm text-zinc-400">
              Kanban view needs a singleSelect column. Add `groupBy` to this view, or include a column with type `singleSelect`.
            </div>
          )
        }
        return (
          <KanbanView
            rows={mergedRows}
            columns={columns}
            groupBy={groupKey}
            onUpdateCell={onUpdateCell}
            onOpenRecord={onOpenRecord}
          />
        )
      })() : (
      <>
      {/* Grid surface */}
      <div ref={scrollRef} className="overflow-auto" style={{ height: 'calc(100vh - 220px)', minHeight: 400 }}>
        <div style={{ width: totalWidth, position: 'relative' }}>
          {/* Header */}
          <div
            className="sticky top-0 z-20 flex bg-zinc-50 border-b border-zinc-200"
            style={{ height: HEADER_HEIGHT }}
          >
            <div className="sticky left-0 z-30 w-14 flex-shrink-0 bg-zinc-50 border-r border-zinc-200" />
            {table.getFlatHeaders().map(h => {
              const cfg = (h.column.columnDef.meta as any)?.config as ColumnConfig
              const sort = h.column.getIsSorted()
              return (
                <div
                  key={h.id}
                  className={
                    'flex items-center px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 border-r border-zinc-200 ' +
                    (cfg?.primary ? 'sticky left-14 z-20 bg-zinc-50 ' : '') +
                    (h.column.getCanSort() ? 'cursor-pointer select-none hover:text-zinc-800' : '')
                  }
                  style={{ width: h.getSize(), minWidth: h.getSize() }}
                  onClick={h.column.getToggleSortingHandler()}
                >
                  <span className="truncate">{cfg?.header ?? h.id}</span>
                  {sort === 'asc' && <span className="ml-1">↑</span>}
                  {sort === 'desc' && <span className="ml-1">↓</span>}
                </div>
              )
            })}
          </div>

          {/* Body — virtualized */}
          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-zinc-500">Loading…</div>
          ) : rowModel.rows.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm text-zinc-400">{emptyText}</div>
          ) : (
            <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
              {virtualizer.getVirtualItems().map(vItem => {
                const item = groupedItems[vItem.index]

                if (item.kind === 'header') {
                  return (
                    <div
                      key={`g-${item.key}`}
                      className="absolute left-0 flex items-center bg-zinc-50/95 border-b border-zinc-200 cursor-pointer select-none hover:bg-zinc-100"
                      style={{ top: vItem.start, height: ROW_HEIGHT, width: totalWidth }}
                      onClick={() => toggleGroup(item.key)}
                    >
                      <div className="sticky left-0 z-10 w-14 flex-shrink-0 flex items-center justify-center bg-zinc-50/95">
                        <svg className={'h-3 w-3 text-zinc-500 transition-transform ' + (item.collapsed ? '-rotate-90' : '')} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </div>
                      <div className="sticky left-14 z-10 px-2 flex items-center gap-2 bg-zinc-50/95">
                        <span className="text-[12px] font-semibold text-zinc-700 truncate">{item.label}</span>
                        <span className="text-[11px] text-zinc-400 tabular-nums">{item.count}</span>
                      </div>
                    </div>
                  )
                }

                const row = rowModel.rows[item.rowIndex]
                return (
                  <div
                    key={row.id}
                    className="absolute left-0 flex border-b border-zinc-100 bg-white hover:bg-zinc-50 group"
                    style={{ top: vItem.start, height: ROW_HEIGHT, width: totalWidth }}
                  >
                    {/* Row handle — Airtable-style, expand on hover */}
                    <div className="sticky left-0 z-10 w-14 flex-shrink-0 flex items-center justify-center bg-white group-hover:bg-zinc-50 border-r border-zinc-100 text-[10px] text-zinc-400">
                      <button
                        onClick={() => onOpenRecord?.(row.original)}
                        title="Expand record"
                        className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center h-5 w-5 rounded hover:bg-zinc-200"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 7V3h4M21 7V3h-4M3 17v4h4M21 17v4h-4" />
                        </svg>
                      </button>
                      <span className="opacity-100 group-hover:opacity-0 transition-opacity tabular-nums">{item.rowIndex + 1}</span>
                    </div>
                    {row.getVisibleCells().map(cell => {
                      const cfg = (cell.column.columnDef.meta as any)?.config as ColumnConfig
                      return (
                        <div
                          key={cell.id}
                          className={
                            'flex items-center border-r border-zinc-100 ' +
                            (cfg?.primary ? 'sticky left-14 z-10 bg-white group-hover:bg-zinc-50 font-medium ' : '')
                          }
                          style={{ width: cell.column.getSize(), minWidth: cell.column.getSize(), height: ROW_HEIGHT }}
                        >
                          <GridCell
                            col={cfg}
                            value={(row.original as any)[cfg.id]}
                            row={row.original}
                            onSave={async v => handleSave(row.original.id, cfg.id, v)}
                          />
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add-row footer — sticky at bottom of inner content */}
          {onAddRow && !loading && (
            <button
              onClick={handleAddRow}
              disabled={busy}
              className="flex items-center w-full px-2 py-1.5 text-[12px] text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 border-b border-zinc-100 sticky left-0"
              style={{ width: totalWidth }}
            >
              <span className="w-14 flex justify-center">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
              </span>
              <span>{busy ? 'Adding…' : 'Add record'}</span>
            </button>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  )
}
