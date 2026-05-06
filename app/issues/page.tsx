'use client'

// Issues — backed by NocoDB NY base (929 records). Surfaces Nick's
// open/resolved issue queue natively.

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { DataGrid, RecordDrawer, type ColumnConfig, type ViewConfig } from '@/components/data-grid'

interface Issue {
  id: string
  issue_id: string
  status: string | null
  priority: string | null
  summary: string | null
  player_name: string | null
  venue: string | null
  assign_to: string | null
  observed_state: string | null
  anc_action: string | null
  three_letter_code: string | null
  ownership: string | null
  created_by: string | null
  date_reported: string | null
  closed_date: string | null
  time_to_close: string | null
  affected_displays: string | null
  details: string | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

const STATUS_OPTIONS = [
  { value: 'Unresolved',  label: 'Unresolved',  color: 'rose' },
  { value: 'In Progress', label: 'In Progress', color: 'amber' },
  { value: 'On Hold',     label: 'On Hold',     color: 'violet' },
  { value: 'Resolved',    label: 'Resolved',    color: 'emerald' },
]

const PRIORITY_OPTIONS = [
  { value: 'Critical', label: 'Critical', color: 'rose' },
  { value: 'High',     label: 'High',     color: 'amber' },
  { value: 'Normal',   label: 'Normal',   color: 'sky' },
  { value: 'Low',      label: 'Low',      color: 'zinc' },
  { value: 'Trivial',  label: 'Trivial',  color: 'zinc' },
]

const OBSERVED_STATE_OPTIONS = [
  { value: 'Offline',       label: 'Offline',       color: 'rose' },
  { value: 'Quality Issue', label: 'Quality Issue', color: 'amber' },
  { value: 'Control Issue', label: 'Control Issue', color: 'violet' },
  { value: 'Unknown',       label: 'Unknown',       color: 'zinc' },
]

const ANC_ACTION_OPTIONS = [
  { value: 'Forward to Client',         label: 'Forward to Client',         color: 'sky' },
  { value: 'Replace and RMA',           label: 'Replace and RMA',           color: 'violet' },
  { value: 'Replace and Invoice',       label: 'Replace and Invoice',       color: 'fuchsia' },
  { value: 'Troubleshoot',              label: 'Troubleshoot',              color: 'amber' },
  { value: 'Collecting Client Feedback',label: 'Collecting Client Feedback',color: 'cyan' },
]

const COLUMNS: ColumnConfig<Issue>[] = [
  { id: 'issue_id',          header: 'Issue ID',     type: 'text',         width: 280, primary: true, editable: false },
  { id: 'status',            header: 'Status',       type: 'singleSelect', width: 140, options: STATUS_OPTIONS },
  { id: 'priority',          header: 'Priority',     type: 'singleSelect', width: 110, options: PRIORITY_OPTIONS },
  { id: 'venue',             header: 'Venue',        type: 'text',         width: 180 },
  { id: 'summary',           header: 'Summary',      type: 'text',         width: 320 },
  { id: 'observed_state',    header: 'Observed',     type: 'singleSelect', width: 150, options: OBSERVED_STATE_OPTIONS },
  { id: 'anc_action',        header: 'ANC Action',   type: 'singleSelect', width: 200, options: ANC_ACTION_OPTIONS },
  { id: 'assign_to',         header: 'Assigned',     type: 'text',         width: 160 },
  { id: 'date_reported',     header: 'Reported',     type: 'date',         width: 130 },
  { id: 'closed_date',       header: 'Closed',       type: 'date',         width: 130 },
  { id: 'player_name',       header: 'Player',       type: 'text',         width: 160 },
  { id: 'affected_displays', header: 'Displays',     type: 'text',         width: 240, editable: false },
  { id: 'three_letter_code', header: 'Code',         type: 'text',         width: 80 },
  { id: 'created_by',        header: 'Created by',   type: 'text',         width: 160, editable: false },
  { id: 'time_to_close',     header: 'Time-to-close',type: 'text',         width: 130, editable: false },
  { id: 'notes',             header: 'Notes',        type: 'longText',     width: 280 },
]

const VIEWS: ViewConfig<Issue>[] = [
  { id: 'open',      name: 'Open',              type: 'grid', filter: r => r.status !== 'Resolved', sort: [{ id: 'date_reported', desc: true }], locked: true },
  { id: 'unres',     name: 'Unresolved',        type: 'grid', filter: r => r.status === 'Unresolved', sort: [{ id: 'date_reported', desc: true }] },
  { id: 'critical',  name: 'Critical / High',   type: 'grid', filter: r => r.priority === 'Critical' || r.priority === 'High', sort: [{ id: 'date_reported', desc: true }] },
  { id: 'all',       name: 'All',               type: 'grid', sort: [{ id: 'date_reported', desc: true }] },
  { id: 'by-status', name: 'Group by Status',   type: 'grid', groupBy: 'status', sort: [{ id: 'date_reported', desc: true }] },
  { id: 'by-venue',  name: 'Group by Venue',    type: 'grid', groupBy: 'venue', sort: [{ id: 'date_reported', desc: true }] },
  { id: 'by-prio',   name: 'Group by Priority', type: 'grid', groupBy: 'priority', sort: [{ id: 'date_reported', desc: true }] },
  { id: 'cal',       name: 'Calendar',          type: 'calendar', dateField: 'date_reported' },
  { id: 'kanban',    name: 'Kanban',            type: 'kanban', groupBy: 'status' },
]

const NOCO_FIELD_NAME: Record<string, string> = {
  status: 'Status',
  priority: 'Priority',
  summary: 'Issue Summary',
  player_name: 'Player Name',
  venue: 'Venue',
  assign_to: 'Assign to',
  observed_state: 'Observed State',
  anc_action: 'ANC Action',
  three_letter_code: 'Three Letter Code',
  date_reported: 'Date Reported',
  closed_date: 'Closed Date',
  notes: 'Notes',
  details: 'Details',
}

export default function IssuesPage() {
  const [rows, setRows] = useState<Issue[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerRow, setDrawerRow] = useState<Issue | null>(null)

  const load = async () => {
    setLoading(true)
    const r = await fetch('/api/issues/nocodb?action=list&limit=500')
    if (r.ok) {
      const d = await r.json()
      setRows(d.items || [])
      setTotal(typeof d.total === 'number' ? d.total : null)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const updateCell = async (rowId: string, columnId: string, value: any) => {
    const fieldName = NOCO_FIELD_NAME[columnId]
    if (!fieldName) throw new Error(`Field '${columnId}' is not editable from the grid`)
    const r = await fetch('/api/issues/nocodb', {
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
            <h1 className="text-2xl font-semibold text-zinc-900">Issues</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Live from NocoDB — {rows.length}{total != null && total !== rows.length ? ` of ${total.toLocaleString()}` : ''} records. Edits write straight back.
            </p>
          </div>
        </div>

        <DataGrid<Issue>
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          views={VIEWS}
          persistKey="issues"
          onUpdateCell={updateCell}
          onOpenRecord={r => setDrawerRow(r)}
          emptyText="No issues match this view."
        />

        <RecordDrawer<Issue>
          open={!!drawerRow}
          row={drawerRow}
          columns={COLUMNS}
          onClose={() => setDrawerRow(null)}
          onUpdate={updateCell}
          title={r => r.issue_id || 'Issue'}
        />
      </div>
    </DashboardLayout>
  )
}
