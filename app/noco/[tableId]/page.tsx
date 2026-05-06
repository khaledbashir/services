'use client'

// /noco/[tableId] — generic NocoDB table viewer. The column config is built
// from NocoDB's metadata (UIDT → FieldType, single-select options + colors),
// records reshaped via the same util. Inline cell edits PATCH back through
// the generic /api/noco/[tableId] endpoint.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { DataGrid, RecordDrawer, type ColumnConfig, type ViewConfig } from '@/components/data-grid'

export default function GenericNocoTablePage({ params }: { params: { tableId: string } }) {
  const router = useRouter()
  const [columns, setColumns] = useState<ColumnConfig<any>[]>([])
  const [tableTitle, setTableTitle] = useState<string>('Loading…')
  const [rows, setRows] = useState<any[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drawerRow, setDrawerRow] = useState<any | null>(null)
  const PAGE_SIZE = 500
  const [serverFilter, setServerFilter] = useState<{ colId: string; op: string; value: any }[]>([])
  const [serverSort, setServerSort] = useState<{ id: string; desc?: boolean }[]>([])

  const buildListUrl = (offset: number) => {
    const qs = new URLSearchParams()
    qs.set('action', 'list')
    qs.set('limit', String(PAGE_SIZE))
    qs.set('offset', String(offset))
    if (serverFilter.length) qs.set('filter', JSON.stringify(serverFilter))
    if (serverSort.length)   qs.set('sort', JSON.stringify(serverSort))
    return `/api/noco/${params.tableId}?${qs.toString()}`
  }

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [schemaRes, listRes] = await Promise.all([
        fetch(`/api/noco/${params.tableId}?action=schema`),
        fetch(buildListUrl(0)),
      ])
      if (!schemaRes.ok) throw new Error('schema fetch failed')
      if (!listRes.ok) throw new Error('list fetch failed')
      const schema = await schemaRes.json()
      const list = await listRes.json()
      setColumns(schema.columns || [])
      setTableTitle(schema.table?.title || 'Table')
      setRows(list.items || [])
      setTotal(typeof list.total === 'number' ? list.total : null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const loadMore = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const r = await fetch(buildListUrl(rows.length))
      if (!r.ok) throw new Error('load more failed')
      const d = await r.json()
      const next = d.items || []
      setRows(prev => {
        const seen = new Set(prev.map((p: any) => p.id))
        return [...prev, ...next.filter((n: any) => !seen.has(n.id))]
      })
      if (typeof d.total === 'number') setTotal(d.total)
    } catch (e) {
      console.error('[noco loadMore]', e)
    } finally {
      setLoadingMore(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [params.tableId])

  // ?record=<id> deep link → after rows load, auto-open the drawer for that
  // record. Useful for sharing a single record's URL or for linked-record
  // navigation that wants to preselect a row.
  useEffect(() => {
    if (loading || !rows.length) return
    try {
      const sp = new URLSearchParams(window.location.search)
      const rid = sp.get('record')
      if (!rid) return
      const found = rows.find(r => String(r.id) === String(rid))
      if (found) setDrawerRow(found)
    } catch {}
  }, [loading, rows])

  // Push the active record id into the URL while the drawer is open so links
  // are shareable and back-button closes the drawer.
  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      if (drawerRow) url.searchParams.set('record', drawerRow.id)
      else url.searchParams.delete('record')
      window.history.replaceState(null, '', url.toString())
    } catch {}
  }, [drawerRow])

  // Refetch from offset 0 when server filter or sort changes — these always
  // require a fresh page since the source ordering changes.
  useEffect(() => {
    if (loading) return
    setRows([])
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(serverFilter), JSON.stringify(serverSort)])

  const updateCell = async (rowId: string, columnId: string, value: any) => {
    // The generic page sends NocoDB column titles directly (column ids ARE
    // titles for this surface — see lib/nocodb-schema.ts).
    const r = await fetch(`/api/noco/${params.tableId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rowId, fields: { [columnId]: value } }),
    })
    if (!r.ok) throw new Error('save failed')
    setRows(prev => prev.map(p => (p.id === rowId ? { ...p, [columnId]: value } : p)))
  }

  const addRow = async () => {
    const r = await fetch(`/api/noco/${params.tableId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (!r.ok) throw new Error('create failed')
    const d = await r.json()
    const created = d.row || { id: String(Date.now()) }
    setRows(prev => [created, ...prev])
    return created
  }

  const deleteRow = async (rowId: string) => {
    const r = await fetch(`/api/noco/${params.tableId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rowId }),
    })
    if (!r.ok) throw new Error('delete failed')
    setRows(prev => prev.filter(p => p.id !== rowId))
  }

  const bulkDelete = async (rowIds: string[]) => {
    // Sequential delete for v1 — keeps the rate at one DELETE/sec which is
    // well under any sensible NocoDB limit. Errors are tracked but don't
    // halt the run; surviving rows stay selected for the user to retry.
    const failed: string[] = []
    for (const id of rowIds) {
      try {
        const r = await fetch(`/api/noco/${params.tableId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        })
        if (!r.ok) failed.push(id)
      } catch { failed.push(id) }
    }
    setRows(prev => prev.filter(p => !rowIds.includes(p.id) || failed.includes(p.id)))
    if (failed.length) {
      // eslint-disable-next-line no-alert
      alert(`${failed.length} record${failed.length === 1 ? '' : 's'} failed to delete.`)
    }
  }

  // Auto-derive a sensible default view set: All, plus group-by-status if a
  // singleSelect with a "Status" or "Result" column exists, plus calendar
  // if a date column exists.
  const VIEWS: ViewConfig<any>[] = [
    { id: 'all', name: 'All', type: 'grid' },
    ...columns
      .filter(c => c.type === 'singleSelect' && /^(status|result|state|priority|type|stage)$/i.test(c.id.replace(/\s+/g, '')))
      .slice(0, 1)
      .map(c => ({ id: 'group-' + c.id, name: 'Group by ' + c.header, type: 'grid' as const, groupBy: c.id })),
    ...(columns.find(c => c.type === 'date' || c.type === 'dateTime')
      ? [{
          id: 'cal',
          name: 'Calendar',
          type: 'calendar' as const,
          dateField: columns.find(c => c.type === 'date' || c.type === 'dateTime')!.id,
        }]
      : []),
    ...(columns.find(c => c.type === 'attachment')
      ? [{ id: 'gallery', name: 'Gallery', type: 'gallery' as const }]
      : []),
    ...(columns.find(c => c.type === 'singleSelect')
      ? [{
          id: 'kanban',
          name: 'Kanban',
          type: 'kanban' as const,
          groupBy: columns.find(c => c.type === 'singleSelect')!.id,
        }]
      : []),
  ]

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <button
              onClick={() => router.push('/noco')}
              className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-800 mb-2"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6" /></svg>
              All Tables
            </button>
            <h1 className="text-2xl font-semibold text-zinc-900">{tableTitle}</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {error
                ? <span className="text-rose-600">{error}</span>
                : <>Live from NocoDB — {rows.length}{total != null && total !== rows.length ? ` of ${total.toLocaleString()}` : ''} records.</>
              }
            </p>
          </div>
        </div>

        <DataGrid
          columns={columns}
          rows={rows}
          loading={loading}
          views={VIEWS}
          persistKey={`noco:${params.tableId}`}
          onUpdateCell={updateCell}
          onAddRow={addRow}
          onOpenRecord={r => setDrawerRow(r)}
          hasMore={total != null && rows.length < total}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          onFilterChange={setServerFilter}
          onSortChange={setServerSort}
          enableSelection
          onBulkDelete={bulkDelete}
          emptyText={loading ? 'Loading…' : 'No records.'}
        />

        <RecordDrawer
          open={!!drawerRow}
          row={drawerRow}
          columns={columns}
          onClose={() => setDrawerRow(null)}
          onUpdate={updateCell}
          onDelete={deleteRow}
          title={r => {
            const primary = columns.find(c => c.primary)
            return (primary && r[primary.id]) ? String(r[primary.id]) : tableTitle
          }}
        />
      </div>
    </DashboardLayout>
  )
}
