'use client'

// Walkthroughs list — backed by NocoDB (Joe/Nick canonical 5/4). Reads
// from /api/walkthroughs/nocodb?action=list which returns Nick's actual
// 20K+ records. Schema mirrors NocoDB column titles 1:1 so inline edits
// PATCH straight back to NocoDB.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { DataGrid, RecordDrawer, type ColumnConfig, type ViewConfig } from '@/components/data-grid'

interface Walk {
  id: string
  log_id: string
  venue_id: string | null
  venue_name: string
  technician_name: string | null
  log_date: string | null
  log_time: string | null
  type: string | null
  result: string | null
  locations_visited: string | null
  issues_found: string | null
  comments: string | null
  three_letter_code: string | null
  created_at: string | null
}

const TYPE_OPTIONS = [
  { value: 'In-Person', label: 'In-Person', color: 'sky' },
  { value: 'Remote',    label: 'Remote',    color: 'violet' },
]

// Mirrors NocoDB Walkthrough Log enum exactly (Nick parity spec).
const RESULT_OPTIONS = [
  { value: 'Open Issue Observed',   label: 'Open Issue Observed',   color: 'amber' },
  { value: 'No Action Required',    label: 'No Action Required',    color: 'emerald' },
  { value: 'New Issue Detected',    label: 'New Issue Detected',    color: 'rose' },
]

// Today's-Walkthroughs view filter — rolls forward daily per Nick 5/4.
const today = () => new Date().toISOString().slice(0, 10)

const VIEWS: ViewConfig<Walk>[] = [
  { id: 'today',     name: "Today's Walkthroughs", type: 'grid', filter: r => r.log_date === today(), sort: [{ id: 'log_date', desc: true }], locked: true },
  { id: 'all',       name: 'All',                  type: 'grid', sort: [{ id: 'log_date', desc: true }] },
  { id: 'by-venue',  name: 'Group by Venue',       type: 'grid', groupBy: 'venue_name', sort: [{ id: 'log_date', desc: true }] },
  { id: 'by-result', name: 'Group by Result',      type: 'grid', groupBy: 'result',     sort: [{ id: 'log_date', desc: true }] },
  { id: 'by-tech',   name: 'Group by Technician',  type: 'grid', groupBy: 'technician_name', sort: [{ id: 'log_date', desc: true }] },
  { id: 'cal',       name: 'Calendar',             type: 'calendar', dateField: 'log_date' },
]

const COLUMNS: ColumnConfig<Walk>[] = [
  { id: 'log_id',             header: 'Log ID',     type: 'text',         width: 130, primary: true, editable: false },
  { id: 'log_date',           header: 'Date',       type: 'date',         width: 120 },
  { id: 'venue_name',         header: 'Venue',      type: 'text',         width: 180, editable: false },
  { id: 'technician_name',    header: 'Technician', type: 'text',         width: 160, editable: false },
  { id: 'type',               header: 'Type',       type: 'singleSelect', width: 130, options: TYPE_OPTIONS },
  { id: 'result',             header: 'Result',     type: 'singleSelect', width: 200, options: RESULT_OPTIONS },
  { id: 'locations_visited',  header: 'Locations',  type: 'text',         width: 280, editable: false },
  { id: 'issues_found',       header: 'Issues',     type: 'text',         width: 260, editable: false },
  { id: 'comments',           header: 'Comments',   type: 'longText',     width: 320 },
  { id: 'three_letter_code',  header: 'Code',       type: 'text',         width: 80,  editable: false },
]

// Map DataGrid column ids → NocoDB column titles (what PATCH expects).
const NOCO_FIELD_NAME: Record<string, string> = {
  type: 'Type',
  result: 'Result',
  comments: 'Comments (log issues above)',
}

const PAGE_SIZE = 500

// NocoDB column titles for our local Walk fields — server-side filter passes
// these to the API which forwards to NocoDB's where clause.
const NOCO_COL_FOR_FIELD: Record<string, string> = {
  log_id: 'Log ID',
  log_date: 'Log Date Dt',
  type: 'Type',
  result: 'Result',
  comments: 'Comments (log issues above)',
  three_letter_code: 'Three Letter Code',
}

export default function WalkthroughsPage() {
  const router = useRouter()
  const [rows, setRows] = useState<Walk[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [drawerRow, setDrawerRow] = useState<Walk | null>(null)
  const [serverFilter, setServerFilter] = useState<{ colId: string; op: string; value: any }[]>([])
  const [serverSort, setServerSort] = useState<{ id: string; desc?: boolean }[]>([])

  // Translate the grid's local column ids → NocoDB column titles for the
  // server-side filter. Drops any rule we don't have a NocoDB mapping for so
  // the filter stays in-memory only for those.
  const buildServerFilter = () => serverFilter
    .filter(r => NOCO_COL_FOR_FIELD[r.colId])
    .map(r => ({ colId: NOCO_COL_FOR_FIELD[r.colId], op: r.op, value: r.value }))
  const buildServerSort = () => serverSort
    .filter(s => NOCO_COL_FOR_FIELD[s.id])
    .map(s => ({ id: NOCO_COL_FOR_FIELD[s.id], desc: s.desc }))

  const buildUrl = (offset: number) => {
    const qs = new URLSearchParams()
    qs.set('action', 'list')
    qs.set('limit', String(PAGE_SIZE))
    qs.set('offset', String(offset))
    const f = buildServerFilter(); const s = buildServerSort()
    if (f.length) qs.set('filter', JSON.stringify(f))
    if (s.length) qs.set('sort', JSON.stringify(s))
    return `/api/walkthroughs/nocodb?${qs.toString()}`
  }

  const load = async () => {
    setLoading(true)
    const r = await fetch(buildUrl(0))
    if (r.ok) {
      const d = await r.json()
      setRows(d.walkthroughs || [])
      setTotal(typeof d.total === 'number' ? d.total : null)
    }
    setLoading(false)
  }

  const loadMore = async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const r = await fetch(buildUrl(rows.length))
      if (!r.ok) throw new Error('load more failed')
      const d = await r.json()
      const next = d.walkthroughs || []
      setRows(prev => {
        const seen = new Set(prev.map(p => p.id))
        return [...prev, ...next.filter((n: Walk) => !seen.has(n.id))]
      })
      if (typeof d.total === 'number') setTotal(d.total)
    } catch (e) { console.error('[walkthroughs loadMore]', e) }
    finally { setLoadingMore(false) }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (loading) return
    setRows([])
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(serverFilter), JSON.stringify(serverSort)])

  const updateCell = async (rowId: string, columnId: string, value: any) => {
    const fieldName = NOCO_FIELD_NAME[columnId]
    if (!fieldName) throw new Error(`Field '${columnId}' is not editable from the grid`)
    const r = await fetch('/api/walkthroughs/nocodb', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rowId, fields: { [fieldName]: value } }),
    })
    if (!r.ok) throw new Error('save failed')
    setRows(prev => prev.map(p => (p.id === rowId ? { ...p, [columnId]: value } : p)))
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Walkthrough Log</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Live from NocoDB — {rows.length}{total != null && total !== rows.length ? ` of ${total.toLocaleString()}` : ''} most-recent records. Double-click a cell to edit Type / Result / Comments.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push('/walkthroughs/new')}
              className="px-4 py-2 bg-[#0A52EF] text-white rounded-md text-sm font-medium hover:bg-[#0840C0]"
            >
              + Guided new walkthrough
            </button>
          </div>
        </div>

        <DataGrid<Walk>
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          views={VIEWS}
          persistKey="walkthroughs"
          onUpdateCell={updateCell}
          onOpenRecord={r => setDrawerRow(r)}
          hasMore={total != null && rows.length < total}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          onFilterChange={setServerFilter}
          onSortChange={setServerSort}
          emptyText="No walkthroughs match this view."
        />

        <RecordDrawer<Walk>
          open={!!drawerRow}
          row={drawerRow}
          columns={COLUMNS}
          onClose={() => setDrawerRow(null)}
          onUpdate={updateCell}
          title={r => `${r.log_id || 'Walkthrough'}${r.venue_name ? ' · ' + r.venue_name : ''}`}
          extraContent={(r) => {
            // Nick parity 5/13 — historic walkthrough history at this venue or
            // location. Server resolves venue/location IDs by display name
            // (NocoDB Link fields filter by display title), so we pass the
            // name as a `label=` hint and let the history page render the
            // header from the URL.
            const venueQs = r.venue_name ? `label=${encodeURIComponent(r.venue_name)}&venue_name=${encodeURIComponent(r.venue_name)}` : ''
            // Click-through is by name for now — the list view doesn't surface
            // venue_id (NocoDB Link fields return name+Id only when expanded).
            // The history endpoint accepts venue_id; we'll need to resolve it.
            // Quick win: link by name via a separate resolver query param.
            return (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-xs">
                <div className="font-semibold text-zinc-700 mb-2">Walkthrough history</div>
                <div className="flex flex-wrap gap-2">
                  {r.venue_name && r.venue_name !== '—' && (
                    <button
                      onClick={() => router.push(`/walkthroughs/history?venue_name=${encodeURIComponent(r.venue_name)}&label=${encodeURIComponent(r.venue_name)}`)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-300 rounded text-zinc-700 hover:border-[#0A52EF] hover:text-[#0A52EF] transition-colors"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="9" /></svg>
                      All walkthroughs at {r.venue_name}
                    </button>
                  )}
                  {r.locations_visited && (
                    r.locations_visited.split(',').map(l => l.trim()).filter(Boolean).slice(0, 4).map(locName => (
                      <button
                        key={locName}
                        onClick={() => router.push(`/walkthroughs/history?location_name=${encodeURIComponent(locName)}&label=${encodeURIComponent(locName)}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-zinc-300 rounded text-zinc-700 hover:border-[#0A52EF] hover:text-[#0A52EF] transition-colors"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2L3 7v6c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7l-9-5z" /></svg>
                        {locName}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )
          }}
        />
      </div>
    </DashboardLayout>
  )
}
