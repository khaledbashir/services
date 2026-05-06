'use client'

// Displays — backed by NocoDB NY base (495 records). Nick's display-asset
// inventory. Type / Make / Orientation / Ownership / Phase pills.

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { DataGrid, RecordDrawer, type ColumnConfig, type ViewConfig } from '@/components/data-grid'

interface Display {
  id: string
  display_name: string
  nick_name: string | null
  type: string | null
  make: string | null
  model: string | null
  orientation: string | null
  resolution: string | null
  ownership: string | null
  moynihan_phase: string | null
  screen_number: string | null
  serial_number: string | null
  three_letter_code: string | null
  location_label: string | null
  venue_label: string | null
  connected_devices: string | null
  active_issues: number
  lcd_ip_address: string | null
  planned: boolean
  notes: string | null
  images: { url: string; name?: string; thumbnail?: string; contentType?: string }[] | null
  updated_at: string | null
}

const TYPE_OPTIONS = [
  { value: 'LED',         label: 'LED',         color: 'sky' },
  { value: 'LCD',         label: 'LCD',         color: 'cyan' },
  { value: 'Matrix LCD',  label: 'Matrix LCD',  color: 'teal' },
  { value: 'Versa',       label: 'Versa',       color: 'emerald' },
  { value: 'Glass Fins',  label: 'Glass Fins',  color: 'violet' },
]

const MAKE_OPTIONS = [
  { value: 'LG',         label: 'LG',         color: 'cyan' },
  { value: 'Samsung',    label: 'Samsung',    color: 'sky' },
  { value: 'Pearless',   label: 'Pearless',   color: 'teal' },
  { value: 'Peerless',   label: 'Peerless',   color: 'teal' },
  { value: 'Novastar',   label: 'Novastar',   color: 'emerald' },
  { value: 'DigiLED',    label: 'DigiLED',    color: 'amber' },
  { value: 'NEC',        label: 'NEC',        color: 'violet' },
  { value: 'GLAMM',      label: 'GLAMM',      color: 'fuchsia' },
  { value: 'Planar',     label: 'Planar',     color: 'lime' },
  { value: 'Lighthouse', label: 'Lighthouse', color: 'rose' },
]

const ORIENTATION_OPTIONS = [
  { value: 'Portrait',  label: 'Portrait',  color: 'cyan' },
  { value: 'Landscape', label: 'Landscape', color: 'sky' },
]

const PHASE_OPTIONS = [
  { value: 'P1', label: 'P1', color: 'sky' },
  { value: 'P2', label: 'P2', color: 'cyan' },
  { value: 'P3', label: 'P3', color: 'teal' },
]

const COLUMNS: ColumnConfig<Display>[] = [
  { id: 'display_name',      header: 'Display Name',  type: 'text',         width: 220, primary: true, editable: false },
  { id: 'nick_name',         header: 'Nick Name',     type: 'text',         width: 160 },
  { id: 'venue_label',       header: 'Venue',         type: 'text',         width: 180, editable: false },
  { id: 'location_label',    header: 'Location',      type: 'text',         width: 200, editable: false },
  { id: 'type',              header: 'Type',          type: 'singleSelect', width: 130, options: TYPE_OPTIONS },
  { id: 'make',              header: 'Make',          type: 'singleSelect', width: 140, options: MAKE_OPTIONS },
  { id: 'model',             header: 'Model',         type: 'text',         width: 140 },
  { id: 'orientation',       header: 'Orientation',   type: 'singleSelect', width: 130, options: ORIENTATION_OPTIONS },
  { id: 'resolution',        header: 'Resolution',    type: 'text',         width: 120 },
  { id: 'moynihan_phase',    header: 'Moynihan Phase',type: 'singleSelect', width: 130, options: PHASE_OPTIONS },
  { id: 'three_letter_code', header: 'Code',          type: 'text',         width: 80,  editable: false },
  { id: 'screen_number',     header: 'Screen #',      type: 'text',         width: 100 },
  { id: 'serial_number',     header: 'Serial #',      type: 'text',         width: 140 },
  { id: 'lcd_ip_address',    header: 'LCD IP',        type: 'text',         width: 130 },
  { id: 'connected_devices', header: 'Connected',     type: 'text',         width: 200, editable: false },
  { id: 'active_issues',     header: 'Issues',        type: 'number',       width: 80,  editable: false },
  { id: 'ownership',         header: 'Ownership',     type: 'text',         width: 150 },
  { id: 'planned',           header: 'Planned',       type: 'checkbox',     width: 90 },
  { id: 'images',            header: 'Image',         type: 'attachment',   width: 130, editable: false },
  { id: 'notes',             header: 'Notes',         type: 'longText',     width: 240 },
]

const VIEWS: ViewConfig<Display>[] = [
  { id: 'all',       name: 'All',               type: 'grid', sort: [{ id: 'display_name' }] },
  { id: 'active',    name: 'Active issues',     type: 'grid', filter: r => r.active_issues > 0, sort: [{ id: 'active_issues', desc: true }] },
  { id: 'led',       name: 'LED only',          type: 'grid', filter: r => r.type === 'LED', sort: [{ id: 'display_name' }] },
  { id: 'planned',   name: 'Planned',           type: 'grid', filter: r => !!r.planned },
  { id: 'by-venue',  name: 'Group by Venue',    type: 'grid', groupBy: 'venue_label', sort: [{ id: 'display_name' }] },
  { id: 'by-loc',    name: 'Group by Location', type: 'grid', groupBy: 'location_label', sort: [{ id: 'display_name' }] },
  { id: 'by-type',   name: 'Group by Type',     type: 'grid', groupBy: 'type' },
  { id: 'by-make',   name: 'Group by Make',     type: 'grid', groupBy: 'make' },
  { id: 'gallery',   name: 'Gallery',           type: 'gallery' },
]

const NOCO_FIELD_NAME: Record<string, string> = {
  nick_name: 'Nick Name',
  type: 'Type',
  make: 'Make',
  model: 'Model',
  orientation: 'Orientation',
  resolution: 'Resolution',
  moynihan_phase: 'Moynihan Phase#',
  screen_number: 'Screen Number',
  serial_number: 'Serial #',
  lcd_ip_address: 'LCD IP Address',
  ownership: 'Ownership',
  planned: 'Planned',
  notes: 'Notes',
}

export default function DisplaysPage() {
  const [rows, setRows] = useState<Display[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerRow, setDrawerRow] = useState<Display | null>(null)

  const load = async () => {
    setLoading(true)
    const r = await fetch('/api/displays/nocodb?action=list&limit=500')
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
    const r = await fetch('/api/displays/nocodb', {
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
            <h1 className="text-2xl font-semibold text-zinc-900">Displays</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Live from NocoDB — {rows.length}{total != null && total !== rows.length ? ` of ${total.toLocaleString()}` : ''} display assets across NY venues.
            </p>
          </div>
        </div>

        <DataGrid<Display>
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          views={VIEWS}
          persistKey="displays"
          onUpdateCell={updateCell}
          onOpenRecord={r => setDrawerRow(r)}
          emptyText="No displays match this view."
        />

        <RecordDrawer<Display>
          open={!!drawerRow}
          row={drawerRow}
          columns={COLUMNS}
          onClose={() => setDrawerRow(null)}
          onUpdate={updateCell}
          title={r => `${r.display_name || 'Display'}${r.venue_label ? ' · ' + r.venue_label : ''}`}
        />
      </div>
    </DashboardLayout>
  )
}
