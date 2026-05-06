'use client'

// Parts Orders — DataGrid migration. Reshapes the Twenty-backed response
// into a flat row shape and renders the canonical engine.

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { DataGrid, RecordDrawer, type ColumnConfig, type ViewConfig } from '@/components/data-grid'

interface Row {
  id: string
  created_at: string
  venue_label: string
  requester_name: string
  requester_email: string
  parts_summary: string
  status: string
}

const STATUS_OPTIONS = [
  { value: 'pending',   label: 'Pending',   color: 'amber' },
  { value: 'approved',  label: 'Approved',  color: 'sky' },
  { value: 'ordered',   label: 'Ordered',   color: 'violet' },
  { value: 'shipped',   label: 'Shipped',   color: 'cyan' },
  { value: 'received',  label: 'Received',  color: 'teal' },
  { value: 'complete',  label: 'Complete',  color: 'emerald' },
  { value: 'completed', label: 'Completed', color: 'emerald' },
]

const COLUMNS: ColumnConfig<Row>[] = [
  { id: 'venue_label',     header: 'Venue',     type: 'text',         width: 200, primary: true, editable: false },
  { id: 'status',          header: 'Status',    type: 'singleSelect', width: 150, options: STATUS_OPTIONS },
  { id: 'requester_name',  header: 'Requester', type: 'text',         width: 180 },
  { id: 'requester_email', header: 'Email',     type: 'text',         width: 220 },
  { id: 'parts_summary',   header: 'Parts',     type: 'longText',     width: 380 },
  { id: 'created_at',      header: 'Submitted', type: 'dateTime',     width: 170, editable: false },
]

const VIEWS: ViewConfig<Row>[] = [
  { id: 'open',     name: 'Open',           type: 'grid', filter: r => !['complete', 'completed'].includes(r.status), sort: [{ id: 'created_at', desc: true }] },
  { id: 'all',      name: 'All',            type: 'grid', sort: [{ id: 'created_at', desc: true }] },
  { id: 'by-status',name: 'Group by Status',type: 'grid', groupBy: 'status', sort: [{ id: 'created_at', desc: true }] },
  { id: 'by-venue', name: 'Group by Venue', type: 'grid', groupBy: 'venue_label', sort: [{ id: 'created_at', desc: true }] },
  { id: 'closed',   name: 'Closed',         type: 'grid', filter: r => ['complete', 'completed'].includes(r.status), sort: [{ id: 'created_at', desc: true }] },
]

function reshape(o: any): Row {
  const partsText = typeof o.partsNeeded === 'object'
    ? (o.partsNeeded?.markdown || o.partsNeeded?.blocknote || '')
    : (o.partsNeeded || '')
  return {
    id: o.id,
    created_at: o.createdAt,
    venue_label: o.venue?.name || o.name || o.venueId || '',
    requester_name: o.requestorName || o.requesterName || '',
    requester_email: o.requestorEmail || o.requesterEmail || '',
    parts_summary: partsText,
    status: ((o.status || 'pending') + '').replace(/^STATUS_/i, '').toLowerCase(),
  }
}

export default function PartsOrdersPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerRow, setDrawerRow] = useState<Row | null>(null)

  const load = async () => {
    setLoading(true)
    const r = await fetch('/api/parts-orders')
    if (r.ok) {
      const data = await r.json()
      setRows((data.parts_orders || []).map(reshape))
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const updateCell = async (rowId: string, columnId: string, value: any) => {
    // Translate the flat field names back to the Twenty-shaped patch body.
    const patch: Record<string, any> = {}
    if (columnId === 'status') patch.status = value
    else if (columnId === 'requester_name') patch.requestorName = value
    else if (columnId === 'requester_email') patch.requestorEmail = value
    else if (columnId === 'parts_summary') patch.partsNeeded = value
    else patch[columnId] = value

    const r = await fetch(`/api/parts-orders/${rowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!r.ok) throw new Error('save failed')
    setRows(prev => prev.map(p => (p.id === rowId ? { ...p, [columnId]: value } : p)))
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Parts Orders</h1>
          <p className="mt-1 text-sm text-zinc-500">Field requests for parts. Click any cell to edit, expand a row for the full record.</p>
        </div>

        <DataGrid<Row>
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          views={VIEWS}
          onUpdateCell={updateCell}
          onOpenRecord={r => setDrawerRow(r)}
          emptyText="No parts orders yet."
        />

        <RecordDrawer<Row>
          open={!!drawerRow}
          row={drawerRow}
          columns={COLUMNS}
          onClose={() => setDrawerRow(null)}
          onUpdate={updateCell}
          title={r => `${r.venue_label || 'Order'}${r.requester_name ? ' · ' + r.requester_name : ''}`}
        />
      </div>
    </DashboardLayout>
  )
}
