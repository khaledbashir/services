'use client'

// Display Locations — backed by NocoDB NY base. Per Nick 5/4 ("Can we
// also add in Display Locations? Example: Amtrak Ticketing, Concourse
// Mezzanine..."). Group-by venue gives the clean per-venue tree he asked
// for.

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { DataGrid, RecordDrawer, type ColumnConfig, type ViewConfig } from '@/components/data-grid'

interface Loc {
  id: string
  name: string
  install_type: string[] | null
  three_letter_code: string | null
  location_abbreviation: string | null
  venue_label: string | null
  displays_count: number
  interface_access: string | null
  server_location: string | null
  notes: string | null
  photo: { url: string; name?: string; thumbnail?: string; contentType?: string }[] | null
  map_attachment: { url: string; name?: string; thumbnail?: string; contentType?: string }[] | null
  updated_at: string | null
}

const COLUMNS: ColumnConfig<Loc>[] = [
  { id: 'name',                  header: 'Name',          type: 'text',     width: 240, primary: true },
  { id: 'venue_label',           header: 'Venue',         type: 'text',     width: 180, editable: false },
  { id: 'install_type',          header: 'Install type',  type: 'multiSelect', width: 220, options: [
    { value: 'LED Wall',      label: 'LED Wall',      color: 'sky' },
    { value: 'Matrix LCD',    label: 'Matrix LCD',    color: 'cyan' },
    { value: 'Touch Kiosk',   label: 'Touch Kiosk',   color: 'violet' },
    { value: 'LCD Enclosure', label: 'LCD Enclosure', color: 'emerald' },
  ] },
  { id: 'three_letter_code',     header: 'Code',          type: 'text',     width: 80 },
  { id: 'location_abbreviation', header: 'Abbrev.',       type: 'text',     width: 110 },
  { id: 'displays_count',        header: 'Displays',      type: 'number',   width: 100, editable: false },
  { id: 'interface_access',      header: 'Interface',     type: 'text',     width: 220, editable: false },
  { id: 'server_location',       header: 'Server loc',    type: 'text',     width: 180, editable: false },
  { id: 'photo',                 header: 'Photo',         type: 'attachment', width: 130, editable: false },
  { id: 'map_attachment',        header: 'Map',           type: 'attachment', width: 130, editable: false },
  { id: 'notes',                 header: 'Notes',         type: 'longText', width: 280 },
]

const VIEWS: ViewConfig<Loc>[] = [
  { id: 'all',      name: 'All',              type: 'grid', sort: [{ id: 'name' }] },
  { id: 'by-venue', name: 'Group by Venue',   type: 'grid', groupBy: 'venue_label', sort: [{ id: 'name' }] },
  { id: 'with',     name: 'With displays',    type: 'grid', filter: r => r.displays_count > 0, sort: [{ id: 'displays_count', desc: true }] },
  { id: 'orphans',  name: 'Empty / orphan',   type: 'grid', filter: r => r.displays_count === 0 },
  { id: 'gallery',  name: 'Gallery',          type: 'gallery' },
]

const NOCO_FIELD_NAME: Record<string, string> = {
  name: 'Name',
  install_type: 'Install Type',
  three_letter_code: 'Three Letter Code',
  location_abbreviation: 'Location Abbreviation',
  notes: 'Notes',
}

export default function DisplayLocationsPage() {
  const [rows, setRows] = useState<Loc[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerRow, setDrawerRow] = useState<Loc | null>(null)

  const load = async () => {
    setLoading(true)
    const r = await fetch('/api/display-locations/nocodb?action=list&limit=500')
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
    const r = await fetch('/api/display-locations/nocodb', {
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
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Display Locations</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Live from NocoDB — {rows.length}{total != null && total !== rows.length ? ` of ${total.toLocaleString()}` : ''} locations across NY venues.
          </p>
        </div>

        <DataGrid<Loc>
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          views={VIEWS}
          persistKey="display-locations"
          onUpdateCell={updateCell}
          onOpenRecord={r => setDrawerRow(r)}
          emptyText="No locations match this view."
        />

        <RecordDrawer<Loc>
          open={!!drawerRow}
          row={drawerRow}
          columns={COLUMNS}
          onClose={() => setDrawerRow(null)}
          onUpdate={updateCell}
          title={r => r.name || 'Display Location'}
        />
      </div>
    </DashboardLayout>
  )
}
