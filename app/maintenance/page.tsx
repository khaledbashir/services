'use client'

// Maintenance — DataGrid migration. Same pattern as /walkthroughs and
// /inventory: bespoke filter+table swapped for the canonical engine.
// Mirrors Airtable's "Maintenance Events" table views (Grid / Kanban /
// Calendar) — Kanban + Calendar render as soon-tabs in v1.

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { DataGrid, RecordDrawer, type ColumnConfig, type ViewConfig } from '@/components/data-grid'

interface Log {
  id: string
  venue_id: string | null
  venue_name: string
  technician_name: string | null
  asset_name: string | null
  maintenance_type: string
  issue: string | null
  issue_summary: string | null
  status: string
  reported_date: string | null
  scheduled_date: string | null
  completed_date: string | null
  location_reported: string | null
  techs_scheduled: string | null
  escort_information?: string | null
  details_to_resolve?: string | null
}

interface Venue { id: string; name: string }

const TYPE_OPTIONS = [
  { value: 'reactive',   label: 'Reactive',   color: 'rose' },
  { value: 'scheduled',  label: 'Scheduled',  color: 'sky' },
  { value: 'preventive', label: 'Preventive', color: 'emerald' },
]

const STATUS_OPTIONS = [
  { value: 'open',         label: 'Open',         color: 'amber' },
  { value: 'in_progress',  label: 'In progress',  color: 'sky' },
  { value: 'completed',    label: 'Completed',    color: 'emerald' },
  { value: 'cancelled',    label: 'Cancelled',    color: 'zinc' },
]

const COLUMNS: ColumnConfig<Log>[] = [
  { id: 'issue',              header: 'Issue',         type: 'text',         width: 280, primary: true },
  { id: 'venue_name',         header: 'Venue',         type: 'text',         width: 180, editable: false },
  { id: 'maintenance_type',   header: 'Type',          type: 'singleSelect', width: 130, options: TYPE_OPTIONS, editable: false },
  { id: 'status',             header: 'Status',        type: 'singleSelect', width: 140, options: STATUS_OPTIONS },
  { id: 'scheduled_date',     header: 'Scheduled',     type: 'date',         width: 130 },
  { id: 'reported_date',      header: 'Reported',      type: 'date',         width: 130, editable: false },
  { id: 'completed_date',     header: 'Completed',     type: 'date',         width: 130, editable: false },
  { id: 'asset_name',         header: 'Asset',         type: 'text',         width: 200, editable: false },
  { id: 'location_reported',  header: 'Location',      type: 'text',         width: 200 },
  { id: 'techs_scheduled',    header: 'Techs',         type: 'text',         width: 180 },
  { id: 'issue_summary',      header: 'Summary',       type: 'text',         width: 240 },
  { id: 'escort_information', header: 'Escort info',   type: 'longText',     width: 240 },
  { id: 'details_to_resolve', header: 'Details',       type: 'longText',     width: 280 },
]

const VIEWS: ViewConfig<Log>[] = [
  { id: 'open',     name: 'Open',           type: 'grid', filter: r => r.status === 'open' || r.status === 'in_progress', sort: [{ id: 'scheduled_date' }] },
  { id: 'all',      name: 'All',            type: 'grid', sort: [{ id: 'scheduled_date', desc: true }] },
  { id: 'by-venue', name: 'Group by Venue', type: 'grid', groupBy: 'venue_name', sort: [{ id: 'scheduled_date', desc: true }] },
  { id: 'by-stat',  name: 'Group by Status',type: 'grid', groupBy: 'status', sort: [{ id: 'scheduled_date', desc: true }] },
  { id: 'by-type',  name: 'Group by Type',  type: 'grid', groupBy: 'maintenance_type', sort: [{ id: 'scheduled_date', desc: true }] },
  { id: 'completed',name: 'Completed',      type: 'grid', filter: r => r.status === 'completed', sort: [{ id: 'completed_date', desc: true }] },
  { id: 'kanban',   name: 'Kanban',         type: 'kanban' },
  { id: 'cal',      name: 'Calendar',       type: 'calendar', dateField: 'scheduled_date' },
]

export default function MaintenancePage() {
  const [rows, setRows] = useState<Log[]>([])
  const [_venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerRow, setDrawerRow] = useState<Log | null>(null)

  const load = async () => {
    setLoading(true)
    const r = await fetch('/api/maintenance')
    if (r.ok) setRows((await r.json()).logs || [])
    setLoading(false)
  }

  useEffect(() => {
    fetch('/api/venues').then(r => r.ok ? r.json() : { venues: [] }).then(d => setVenues(d.venues || []))
    load()
  }, [])

  const updateCell = async (rowId: string, columnId: string, value: any) => {
    // Setting status to "completed" through the grid stamps completed_date so
    // the same UX you got from the prior dropdown is preserved.
    const body: Record<string, any> = { [columnId]: value }
    if (columnId === 'status' && value === 'completed') {
      body.completed_date = new Date().toISOString().slice(0, 10)
    }
    const r = await fetch(`/api/maintenance/${rowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error('save failed')
    setRows(prev => prev.map(p => (p.id === rowId ? { ...p, ...body } : p)))
  }

  const deleteRow = async (rowId: string) => {
    const r = await fetch(`/api/maintenance/${rowId}`, { method: 'DELETE' })
    if (!r.ok) throw new Error('delete failed')
    setRows(prev => prev.filter(p => p.id !== rowId))
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Maintenance</h1>
            <p className="mt-1 text-sm text-zinc-500">Scheduled + reactive work across all venues. Click a cell to edit, expand a row for the full record.</p>
          </div>
        </div>

        <DataGrid<Log>
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          views={VIEWS}
          onUpdateCell={updateCell}
          onOpenRecord={r => setDrawerRow(r)}
          emptyText="No maintenance logs yet."
        />

        <RecordDrawer<Log>
          open={!!drawerRow}
          row={drawerRow}
          columns={COLUMNS}
          onClose={() => setDrawerRow(null)}
          onUpdate={updateCell}
          onDelete={deleteRow}
          title={r => `${r.issue || 'Maintenance'} — ${r.venue_name || ''}`}
        />
      </div>
    </DashboardLayout>
  )
}
