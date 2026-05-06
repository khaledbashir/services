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
import type { ColumnConfig, DataGridProps, ViewConfig } from './types'
import { GridCell } from './cells'
import { CalendarView } from './CalendarView'
import { GalleryView } from './GalleryView'
import { KanbanView } from './KanbanView'

const ROW_HEIGHT = 32
const HEADER_HEIGHT = 36

interface ColumnHeaderMenuProps {
  column: ColumnConfig
  onClose: () => void
  onSortAsc: () => void
  onSortDesc: () => void
  onClearSort: () => void
  onGroupBy: () => void
  onClearGroupBy: () => void
  groupActive: boolean
  onHide: () => void
  currentFilter: { op: string; value: any } | null
  onSetFilter: (f: { op: string; value: any } | null) => void
}

function ColumnHeaderMenu({
  column, onClose, onSortAsc, onSortDesc, onClearSort,
  onGroupBy, onClearGroupBy, groupActive, onHide,
  currentFilter, onSetFilter,
}: ColumnHeaderMenuProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [op, setOp] = useState(currentFilter?.op || defaultOpFor(column.type))
  const [value, setValue] = useState<any>(currentFilter?.value ?? '')

  useEffect(() => {
    const close = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) onClose() }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [onClose])

  const operators = operatorsFor(column.type)
  const needsValue = !['empty', 'notempty', 'checked', 'notchecked'].includes(op)
  const apply = () => {
    if (!needsValue) onSetFilter({ op, value: null })
    else if (value === '' || value == null) onSetFilter(null)
    else onSetFilter({ op, value })
    onClose()
  }
  const isNumeric = column.type === 'number'
  const isDate = column.type === 'date' || column.type === 'dateTime'

  return (
    <div
      ref={wrapRef}
      className="absolute top-full right-0 mt-1 z-50 bg-white border border-zinc-200 rounded-lg shadow-xl py-1 min-w-[260px]"
      onClick={e => e.stopPropagation()}
    >
      <MenuButton onClick={onSortAsc} icon="↑">Sort {isNumeric || isDate ? 'ascending' : 'A → Z'}</MenuButton>
      <MenuButton onClick={onSortDesc} icon="↓">Sort {isNumeric || isDate ? 'descending' : 'Z → A'}</MenuButton>
      <MenuButton onClick={onClearSort}>Clear sort</MenuButton>
      <Divider />
      {groupActive ? (
        <MenuButton onClick={onClearGroupBy}>Ungroup</MenuButton>
      ) : (
        <MenuButton onClick={onGroupBy}>Group by this field</MenuButton>
      )}
      <MenuButton onClick={onHide}>Hide field</MenuButton>
      {operators.length > 0 && (
        <>
          <Divider />
          <div className="px-3 py-2 space-y-1.5">
            <div className="text-[10px] uppercase tracking-[0.1em] text-zinc-500 font-semibold">Filter</div>
            <div className="flex gap-1.5">
              <select
                value={op}
                onChange={e => setOp(e.target.value)}
                className="flex-1 px-2 py-1 border border-zinc-200 rounded text-[11.5px] bg-white"
              >
                {operators.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
            </div>
            {needsValue && (
              column.type === 'singleSelect' && column.options ? (
                <select
                  value={value ?? ''}
                  onChange={e => setValue(e.target.value)}
                  className="w-full px-2 py-1 border border-zinc-200 rounded text-[11.5px] bg-white"
                >
                  <option value="">—</option>
                  {column.options.map(o => (<option key={o.value} value={o.value}>{o.label}</option>))}
                </select>
              ) : (
                <input
                  type={isDate ? 'date' : isNumeric ? 'number' : 'text'}
                  value={value ?? ''}
                  onChange={e => setValue(e.target.value)}
                  placeholder="value"
                  className="w-full px-2 py-1 border border-zinc-200 rounded text-[11.5px]"
                />
              )
            )}
            <div className="flex gap-1.5 pt-1">
              <button onClick={apply} className="flex-1 px-2 py-1 bg-[#0A52EF] text-white rounded text-[11px] font-medium hover:bg-[#0840C0]">
                Apply
              </button>
              {currentFilter && (
                <button onClick={() => { onSetFilter(null); onClose() }} className="px-2 py-1 border border-zinc-200 rounded text-[11px] text-zinc-600 hover:bg-zinc-50">
                  Clear
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MenuButton({ onClick, icon, children }: { onClick: () => void; icon?: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-zinc-50 flex items-center gap-2">
      {icon && <span className="text-[10px] text-zinc-400 w-3 inline-block">{icon}</span>}
      <span>{children}</span>
    </button>
  )
}

function Divider() {
  return <div className="my-1 border-t border-zinc-100" />
}

function defaultOpFor(type: string): string {
  if (type === 'number') return 'eq'
  if (type === 'date' || type === 'dateTime') return 'is'
  if (type === 'checkbox') return 'checked'
  if (type === 'singleSelect') return 'eq'
  return 'contains'
}

function operatorsFor(type: string): { value: string; label: string }[] {
  switch (type) {
    case 'number':
      return [
        { value: 'eq', label: '=' }, { value: 'neq', label: '≠' },
        { value: 'gt', label: '>' }, { value: 'gte', label: '≥' },
        { value: 'lt', label: '<' }, { value: 'lte', label: '≤' },
        { value: 'empty', label: 'is empty' }, { value: 'notempty', label: 'is not empty' },
      ]
    case 'date':
    case 'dateTime':
      return [
        { value: 'is', label: 'is' },
        { value: 'before', label: 'before' },
        { value: 'after', label: 'after' },
        { value: 'empty', label: 'is empty' }, { value: 'notempty', label: 'is not empty' },
      ]
    case 'checkbox':
      return [
        { value: 'checked', label: 'is checked' }, { value: 'notchecked', label: 'is not checked' },
      ]
    case 'singleSelect':
      return [
        { value: 'eq', label: 'is' }, { value: 'neq', label: 'is not' },
        { value: 'empty', label: 'is empty' }, { value: 'notempty', label: 'is not empty' },
      ]
    case 'attachment':
    case 'linkedRecord':
      return []
    default:
      return [
        { value: 'contains', label: 'contains' },
        { value: 'eq', label: 'is' }, { value: 'neq', label: 'is not' },
        { value: 'empty', label: 'is empty' }, { value: 'notempty', label: 'is not empty' },
      ]
  }
}

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
  persistKey,
  hasMore,
  loadingMore,
  onLoadMore,
}: DataGridProps<TRow>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [busy, setBusy] = useState(false)
  const [activeViewId, setActiveViewIdRaw] = useState<string | null>(views?.[0]?.id ?? null)
  // Per-column user-driven controls: header menu open state, hidden columns
  // (in addition to view-config-driven hides), and per-column filter rules.
  const [menuOpenFor, setMenuOpenFor] = useState<string | null>(null)
  const [userHidden, setUserHidden] = useState<Set<string>>(new Set())
  const [columnFilters, setColumnFilters] = useState<Record<string, { op: string; value: any }>>({})
  const [userGroupBy, setUserGroupBy] = useState<string | null>(null)
  // User-saved views (DB-backed via /api/preferences keyed
  // datagrid:<persistKey>:userViews). Render alongside the code-config views.
  const [userViews, setUserViews] = useState<ViewConfig[]>([])

  // Hydrate the active view from /api/preferences once on mount, then write
  // back on each user-driven view change. Falls back silently to default if
  // the user has never picked one. No localStorage — DB-backed per memory rule.
  useEffect(() => {
    if (!persistKey || !views?.length) return
    let cancelled = false
    fetch(`/api/preferences?key=datagrid:${persistKey}:view`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled) return
        const stored = d?.value
        if (stored && views.some(v => v.id === stored)) setActiveViewIdRaw(stored)
      })
      .catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey])

  const setActiveViewId = (id: string | null) => {
    setActiveViewIdRaw(id)
    if (persistKey && id) {
      fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: `datagrid:${persistKey}:view`, value: id }),
      }).catch(() => {})
    }
  }
  // Keep optimistic row patches in local state so saves render instantly.
  const [overrides, setOverrides] = useState<Record<string, Partial<TRow>>>({})

  // Combined view list: code-config views first, then user-saved views.
  const allViews = useMemo<ViewConfig[]>(() => [...(views || []), ...userViews], [views, userViews])
  const activeView = useMemo(
    () => (activeViewId ? allViews.find(v => v.id === activeViewId) || null : null),
    [allViews, activeViewId]
  )

  // Hydrate user-saved views once on mount (separate from active-view hydration).
  useEffect(() => {
    if (!persistKey) return
    let cancelled = false
    fetch(`/api/preferences?key=datagrid:${persistKey}:userViews`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (cancelled || !d?.value) return
        try {
          const parsed = JSON.parse(d.value)
          if (Array.isArray(parsed)) setUserViews(parsed)
        } catch {}
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [persistKey])

  const persistUserViews = (next: ViewConfig[]) => {
    setUserViews(next)
    if (!persistKey) return
    fetch('/api/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: `datagrid:${persistKey}:userViews`, value: JSON.stringify(next) }),
    }).catch(() => {})
  }

  // When the active view changes, replay its sort / group / filters / hides.
  // Code-config views use typed `sort` + `groupBy` fields directly; user views
  // also store filter rules (since they can't supply a runtime filter fn).
  useEffect(() => {
    if (!activeView) return
    if (activeView.sort) setSorting(activeView.sort.map(s => ({ id: s.id, desc: !!s.desc })))
    else setSorting([])
    setUserGroupBy(activeView.user ? (activeView.groupBy ?? null) : null)
    setUserHidden(new Set(activeView.user ? (activeView.hiddenColumns ?? []) : []))
    if (activeView.user) {
      const next: Record<string, { op: string; value: any }> = {}
      for (const r of (activeView.filterRules || [])) next[r.colId] = { op: r.op, value: r.value }
      setColumnFilters(next)
    } else {
      // Switching to a config view clears any in-flight user filter chips so
      // the user gets a clean slate.
      setColumnFilters({})
    }
  }, [activeView])

  const saveCurrentAsView = () => {
    const name = window.prompt('Name this view:')
    if (!name) return
    const filterRules = Object.entries(columnFilters).map(([colId, f]) => ({ colId, op: f.op, value: f.value }))
    const sort = sorting.map(s => ({ id: s.id, desc: s.desc }))
    const newView: ViewConfig = {
      id: `u_${Date.now().toString(36)}`,
      name,
      type: 'grid',
      user: true,
      filterRules,
      sort,
      groupBy: userGroupBy ?? undefined,
      hiddenColumns: Array.from(userHidden),
    }
    persistUserViews([...userViews, newView])
    setActiveViewId(newView.id)
  }

  const deleteUserView = (viewId: string) => {
    const next = userViews.filter(v => v.id !== viewId)
    persistUserViews(next)
    if (activeViewId === viewId) setActiveViewId(allViews.find(v => !next.some(u => u.id === v.id))?.id ?? views?.[0]?.id ?? null)
  }

  const columnVisibility = useMemo<VisibilityState>(() => {
    const v: VisibilityState = {}
    if (activeView?.hiddenColumns?.length) {
      for (const id of activeView.hiddenColumns) v[id] = false
    }
    for (const id of userHidden) v[id] = false
    return v
  }, [activeView, userHidden])

  // Apply per-column user filters on top of the active view's filter. Each
  // entry in columnFilters maps column id → { op, value }. Type-aware operators.
  const matchesColFilter = (row: any, colId: string, op: string, val: any): boolean => {
    const raw = row[colId]
    switch (op) {
      case 'contains':    return raw != null && String(raw).toLowerCase().includes(String(val).toLowerCase())
      case 'eq':          return raw == val || (Array.isArray(raw) ? raw.includes(val) : String(raw ?? '') === String(val ?? ''))
      case 'neq':         return !(raw == val || (Array.isArray(raw) ? raw.includes(val) : String(raw ?? '') === String(val ?? '')))
      case 'empty':       return raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0)
      case 'notempty':    return !(raw == null || raw === '' || (Array.isArray(raw) && raw.length === 0))
      case 'gt':          return raw != null && Number(raw) > Number(val)
      case 'lt':          return raw != null && Number(raw) < Number(val)
      case 'gte':         return raw != null && Number(raw) >= Number(val)
      case 'lte':         return raw != null && Number(raw) <= Number(val)
      case 'before':      return raw != null && String(raw).slice(0, 10) < String(val)
      case 'after':       return raw != null && String(raw).slice(0, 10) > String(val)
      case 'is':          return raw != null && String(raw).slice(0, 10) === String(val)
      case 'checked':     return !!raw
      case 'notchecked':  return !raw
      default:            return true
    }
  }

  const filteredRows = useMemo(() => {
    let out = rows
    if (activeView?.filter) out = out.filter(activeView.filter)
    const filterEntries = Object.entries(columnFilters)
    if (filterEntries.length > 0) {
      out = out.filter(r => filterEntries.every(([colId, f]) => matchesColFilter(r, colId, f.op, f.value)))
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, activeView, columnFilters])

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
    const groupColId = userGroupBy ?? activeView?.groupBy
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
  }, [rowModel.rows, activeView, columns, collapsedGroups, userGroupBy])

  const toggleGroup = (key: string) =>
    setCollapsedGroups(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })

  const virtualizer = useVirtualizer({
    count: groupedItems.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })

  // Infinite scroll: when the last virtualized item is within ~10 rows of the
  // end, fetch the next page. Guarded by hasMore + loadingMore so we never
  // call onLoadMore concurrently or after exhausting the source.
  useEffect(() => {
    if (!onLoadMore || !hasMore || loadingMore) return
    const items = virtualizer.getVirtualItems()
    const last = items[items.length - 1]
    if (!last) return
    if (last.index >= groupedItems.length - 10) {
      const r = onLoadMore()
      if (r && typeof (r as any).then === 'function') (r as Promise<void>).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [virtualizer.getVirtualItems(), hasMore, loadingMore, groupedItems.length])

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
      {/* View tab strip — Airtable-style. Renders when any view is available
          (config or user-saved). */}
      {(allViews.length > 0 || persistKey) && (
        <div className="flex items-center gap-1 px-2 pt-2 pb-0 border-b border-zinc-100 bg-zinc-50/40 overflow-x-auto">
          {allViews.map(v => {
            const active = v.id === activeViewId
            const supported = !v.type || v.type === 'grid' || v.type === 'calendar' || v.type === 'gallery' || v.type === 'kanban'
            return (
              <div
                key={v.id}
                className={
                  'group/tab inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-md border-b-2 transition-colors ' +
                  (active
                    ? 'border-[#0A52EF] text-[#0A52EF] bg-white'
                    : 'border-transparent text-zinc-500 hover:text-zinc-800 hover:bg-white/60')
                }
                title={supported ? v.name : `${v.name} — coming soon`}
              >
                <button onClick={() => setActiveViewId(v.id)} className="inline-flex items-center gap-1.5">
                  <span className="text-[11px] leading-none opacity-70">{viewIcon(v.type)}</span>
                  <span>{v.name}</span>
                  {v.locked && (
                    <svg className="h-3 w-3 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="Locked">
                      <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  )}
                  {v.user && (
                    <span className="text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">mine</span>
                  )}
                  {!supported && (
                    <span className="ml-1 text-[9px] uppercase tracking-wider px-1 py-0.5 rounded bg-amber-100 text-amber-700">soon</span>
                  )}
                </button>
                {v.user && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (window.confirm(`Delete view "${v.name}"?`)) deleteUserView(v.id)
                    }}
                    className="opacity-0 group-hover/tab:opacity-100 ml-0.5 h-4 w-4 inline-flex items-center justify-center rounded text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-opacity"
                    aria-label="Delete view"
                  >
                    ×
                  </button>
                )}
              </div>
            )
          })}
          {persistKey && (
            <button
              onClick={saveCurrentAsView}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium text-zinc-500 hover:text-[#0A52EF] hover:bg-white/60 rounded-t-md ml-1"
              title="Save the current sort, filters, group, and hidden columns as a new view"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
              Save view
            </button>
          )}
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
        {userHidden.size > 0 && (
          <button
            onClick={() => setUserHidden(new Set())}
            className="px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-800 border border-zinc-200 rounded-md"
            title="Restore hidden columns"
          >
            Show {userHidden.size} hidden
          </button>
        )}
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

      {/* Active filter chips — render below the toolbar when any column
          filter is set. Click ✕ to remove. */}
      {Object.keys(columnFilters).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3 py-2 border-b border-zinc-200 bg-zinc-50/40">
          <span className="text-[10px] uppercase tracking-[0.1em] font-semibold text-zinc-500 mr-1">Filters</span>
          {Object.entries(columnFilters).map(([colId, f]) => {
            const col = columns.find(c => c.id === colId)
            if (!col) return null
            const opLabel = (operatorsFor(col.type).find(o => o.value === f.op)?.label) || f.op
            const valueLabel = ['empty', 'notempty', 'checked', 'notchecked'].includes(f.op)
              ? ''
              : (col.type === 'singleSelect'
                  ? (col.options?.find(o => o.value === f.value)?.label ?? String(f.value))
                  : String(f.value))
            return (
              <span
                key={colId}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-white border border-[#0A52EF]/30 rounded-md text-[11px]"
              >
                <span className="font-medium text-zinc-800">{col.header}</span>
                <span className="text-zinc-500">{opLabel}</span>
                {valueLabel && <span className="font-medium text-[#0A52EF]">{valueLabel}</span>}
                <button
                  onClick={() => setColumnFilters(prev => { const n = { ...prev }; delete n[colId]; return n })}
                  className="text-zinc-400 hover:text-rose-600"
                  aria-label="Clear filter"
                >
                  ×
                </button>
              </span>
            )
          })}
          <button
            onClick={() => setColumnFilters({})}
            className="px-1.5 py-0.5 text-[10px] text-zinc-500 hover:text-zinc-800 underline"
          >
            Clear all
          </button>
        </div>
      )}

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
              const hasFilter = !!columnFilters[cfg.id]
              return (
                <div
                  key={h.id}
                  className={
                    'flex items-center px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-500 border-r border-zinc-200 group/hdr relative ' +
                    (cfg?.primary ? 'sticky left-14 z-20 bg-zinc-50 ' : '')
                  }
                  style={{ width: h.getSize(), minWidth: h.getSize() }}
                >
                  <button
                    type="button"
                    onClick={h.column.getToggleSortingHandler()}
                    className={'flex-1 flex items-center gap-1 truncate text-left ' + (h.column.getCanSort() ? 'cursor-pointer hover:text-zinc-800' : '')}
                  >
                    <span className="truncate">{cfg?.header ?? h.id}</span>
                    {sort === 'asc' && <span>↑</span>}
                    {sort === 'desc' && <span>↓</span>}
                    {hasFilter && <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-[#0A52EF]" title="Filter active" />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setMenuOpenFor(prev => prev === cfg.id ? null : cfg.id) }}
                    className="opacity-0 group-hover/hdr:opacity-100 ml-1 h-5 w-5 inline-flex items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 transition-opacity"
                    title="Column menu"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
                    </svg>
                  </button>
                  {menuOpenFor === cfg.id && (
                    <ColumnHeaderMenu
                      column={cfg}
                      onClose={() => setMenuOpenFor(null)}
                      onSortAsc={() => { setSorting([{ id: cfg.id, desc: false }]); setMenuOpenFor(null) }}
                      onSortDesc={() => { setSorting([{ id: cfg.id, desc: true }]); setMenuOpenFor(null) }}
                      onClearSort={() => { setSorting([]); setMenuOpenFor(null) }}
                      onGroupBy={() => { setUserGroupBy(cfg.id); setMenuOpenFor(null) }}
                      onClearGroupBy={() => { setUserGroupBy(null); setMenuOpenFor(null) }}
                      groupActive={(userGroupBy ?? activeView?.groupBy) === cfg.id}
                      onHide={() => { setUserHidden(s => new Set(s).add(cfg.id)); setMenuOpenFor(null) }}
                      currentFilter={columnFilters[cfg.id] || null}
                      onSetFilter={(f) => {
                        setColumnFilters(prev => {
                          const n = { ...prev }
                          if (f == null) delete n[cfg.id]
                          else n[cfg.id] = f
                          return n
                        })
                      }}
                    />
                  )}
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

          {/* Pagination indicator — visible whenever there's more to load.
              Auto-fetches on scroll-near-bottom; this just gives feedback. */}
          {hasMore && !loading && (
            <div
              className="flex items-center justify-center w-full px-2 py-2 text-[11px] text-zinc-500 border-b border-zinc-100"
              style={{ width: totalWidth }}
            >
              {loadingMore ? (
                <span className="inline-flex items-center gap-1.5">
                  <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.22-8.56" /></svg>
                  Loading more…
                </span>
              ) : (
                <button
                  onClick={() => { const r = onLoadMore?.(); if (r && typeof (r as any).then === 'function') (r as Promise<void>).catch(() => {}) }}
                  className="text-zinc-500 hover:text-[#0A52EF]"
                >
                  Scroll for more — or click to load now
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      </>
      )}
    </div>
  )
}
