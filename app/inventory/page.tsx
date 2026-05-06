'use client'

// Inventory list — DataGrid migration. Replaces the bespoke search/filter/table
// from the prior version with the canonical <DataGrid> + <RecordDrawer> engine.
// Add-item modal kept as-is so Joe's existing create flow doesn't change.

import { useEffect, useState, FormEvent } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useToast } from '@/components/toast'
import { useAuth } from '@/lib/useAuth'
import { DataGrid, RecordDrawer, type ColumnConfig, type ViewConfig } from '@/components/data-grid'

interface InventoryItem {
  id: string
  item_name: string
  sku: string | null
  quantity: number
  threshold_low: number
  venue_name: string
  venue_id: string | null
  last_updated: string
  updated_by_name: string | null
  asset_number?: string | null
  three_letter_code?: string | null
  location_code?: string | null
  location_room?: string | null
  screen_location?: string | null
  manufacturer?: string | null
  display_type?: string | null
  orientation?: string | null
  ip_address?: string | null
  connected_devices?: string | null
  render_name?: string | null
  project_code?: string | null
  part_number?: string | null
  resolution?: string | null
}

interface Venue { id: string; name: string }

const DISPLAY_TYPE_OPTIONS = [
  { value: 'LED', label: 'LED', color: 'sky' },
  { value: 'LCD', label: 'LCD', color: 'cyan' },
  { value: 'PROJECTOR', label: 'Projector', color: 'violet' },
  { value: 'OTHER', label: 'Other', color: 'zinc' },
]

const ORIENTATION_OPTIONS = [
  { value: 'LANDSCAPE', label: 'Landscape', color: 'sky' },
  { value: 'PORTRAIT', label: 'Portrait', color: 'cyan' },
]

// Mirrors Nick's Airtable Inventory Tracking views — group-by replicated
// natively (Nick uses these daily).
const VIEWS: ViewConfig<InventoryItem>[] = [
  { id: 'overview',  name: 'Inventory Overview', type: 'grid' },
  { id: 'low',       name: 'Below threshold',    type: 'grid', filter: r => (r.quantity ?? 0) <= (r.threshold_low ?? 5) },
  { id: 'by-venue',  name: 'Group by Venue',     type: 'grid', groupBy: 'venue_name', sort: [{ id: 'item_name' }] },
  { id: 'by-make',   name: 'Group by Make',      type: 'grid', groupBy: 'manufacturer', sort: [{ id: 'item_name' }] },
  { id: 'by-type',   name: 'Group by Type',      type: 'grid', groupBy: 'display_type', sort: [{ id: 'item_name' }] },
  { id: 'gallery',   name: 'Product Gallery',    type: 'gallery' },
]

const COLUMNS: ColumnConfig<InventoryItem>[] = [
  { id: 'item_name', header: 'Item', type: 'text', width: 220, primary: true },
  { id: 'venue_name', header: 'Venue', type: 'text', width: 180, editable: false },
  { id: 'quantity', header: 'Qty', type: 'number', width: 80 },
  { id: 'threshold_low', header: 'Low @', type: 'number', width: 80 },
  { id: 'asset_number', header: 'Asset #', type: 'text', width: 130 },
  { id: 'three_letter_code', header: 'Tri-code', type: 'text', width: 90 },
  { id: 'manufacturer', header: 'Make', type: 'text', width: 130 },
  { id: 'display_type', header: 'Type', type: 'singleSelect', width: 130, options: DISPLAY_TYPE_OPTIONS },
  { id: 'orientation', header: 'Orient.', type: 'singleSelect', width: 130, options: ORIENTATION_OPTIONS },
  { id: 'resolution', header: 'Res.', type: 'text', width: 110 },
  { id: 'location_code', header: 'Loc code', type: 'text', width: 100 },
  { id: 'location_room', header: 'Room', type: 'text', width: 160 },
  { id: 'screen_location', header: 'Screen loc', type: 'text', width: 160 },
  { id: 'ip_address', header: 'IP', type: 'text', width: 130 },
  { id: 'connected_devices', header: 'Connected', type: 'text', width: 180 },
  { id: 'render_name', header: 'Render', type: 'text', width: 180 },
  { id: 'part_number', header: 'Part #', type: 'text', width: 130 },
  { id: 'project_code', header: 'Project', type: 'text', width: 130 },
  { id: 'last_updated', header: 'Updated', type: 'dateTime', width: 150, editable: false },
]

export default function InventoryPage() {
  useAuth('manager')
  const { showToast } = useToast()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [lowStockCount, setLowStockCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [drawerRow, setDrawerRow] = useState<InventoryItem | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    venue_id: '', item_name: '', sku: '', quantity: '0', threshold_low: '5',
    asset_number: '', three_letter_code: '', location_code: '', location_room: '',
    screen_location: '', manufacturer: '', display_type: '', orientation: '',
    ip_address: '', connected_devices: '', render_name: '', project_code: '',
    model_name: '', resolution: '',
  })

  const fetchData = async () => {
    setLoading(true)
    try {
      const [invRes, venRes] = await Promise.all([
        fetch('/api/inventory').then(r => r.json()),
        fetch('/api/venues').then(r => r.json()),
      ])
      setItems(invRes.items || [])
      setLowStockCount(invRes.lowStockCount || 0)
      setVenues(venRes.venues || [])
    } catch {} finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [])

  // /api/inventory uses { id, ...fields } in PATCH body, not /:id route.
  const updateCell = async (rowId: string, columnId: string, value: any) => {
    const r = await fetch('/api/inventory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rowId, [columnId]: value }),
    })
    if (!r.ok) throw new Error('save failed')
    setItems(prev => prev.map(p => (p.id === rowId ? { ...p, [columnId]: value } : p)))
  }

  const deleteRow = async (rowId: string) => {
    const r = await fetch('/api/inventory', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rowId }),
    })
    if (!r.ok) throw new Error('delete failed')
    setItems(prev => prev.filter(p => p.id !== rowId))
  }

  const addItem = async (e: FormEvent) => {
    e.preventDefault()
    if (!formData.venue_id || !formData.item_name.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          quantity: parseInt(formData.quantity) || 0,
          threshold_low: parseInt(formData.threshold_low) || 5,
        }),
      })
      if (res.ok) {
        showToast('Item added', 'success')
        setFormData({
          venue_id: '', item_name: '', sku: '', quantity: '0', threshold_low: '5',
          asset_number: '', three_letter_code: '', location_code: '', location_room: '',
          screen_location: '', manufacturer: '', display_type: '', orientation: '',
          ip_address: '', connected_devices: '', render_name: '', project_code: '',
          model_name: '', resolution: '',
        })
        setShowForm(false)
        await fetchData()
      }
    } catch {} finally { setSubmitting(false) }
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Inventory</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {lowStockCount > 0 ? (
                <span className="text-rose-600">{lowStockCount} item{lowStockCount > 1 ? 's' : ''} below threshold · </span>
              ) : null}
              Click any cell to edit. Expand a row for the full asset record.
            </p>
          </div>
          <button onClick={() => setShowForm(s => !s)}
            className="px-4 py-2 bg-[#0A52EF] text-white rounded-md text-sm font-medium hover:bg-[#0840C0]">
            {showForm ? 'Cancel' : '+ Add asset'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded-2xl border border-[#E8E8E8] shadow-sm p-6">
            <form onSubmit={addItem} className="space-y-5">
              <div>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500 mb-2">Identity</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Venue *</label>
                    <select value={formData.venue_id} onChange={e => setFormData({ ...formData, venue_id: e.target.value })}
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm" required>
                      <option value="">Select…</option>
                      {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Item Name *</label>
                    <input type="text" value={formData.item_name} onChange={e => setFormData({ ...formData, item_name: e.target.value })}
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm" required />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Asset #</label>
                    <input type="text" value={formData.asset_number} onChange={e => setFormData({ ...formData, asset_number: e.target.value })}
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 mb-1">Tri-Code</label>
                    <input type="text" value={formData.three_letter_code} maxLength={3}
                      onChange={e => setFormData({ ...formData, three_letter_code: e.target.value.toUpperCase() })}
                      className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm font-mono uppercase" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Quantity</label>
                  <input type="number" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                    className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">Low Stock Threshold</label>
                  <input type="number" value={formData.threshold_low} onChange={e => setFormData({ ...formData, threshold_low: e.target.value })}
                    className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-500 mb-1">SKU / Part #</label>
                  <input type="text" value={formData.sku} onChange={e => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm font-mono" />
                </div>
                <div className="flex items-end">
                  <button type="submit" disabled={submitting}
                    className="w-full px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium hover:bg-[#0840C0] disabled:opacity-50">
                    {submitting ? 'Adding…' : 'Add Asset'}
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-zinc-400">More fields (location, display specs, connectivity) — set them inline in the grid or in the record drawer after creation.</p>
            </form>
          </div>
        )}

        <DataGrid<InventoryItem>
          columns={COLUMNS}
          rows={items}
          loading={loading}
          views={VIEWS}
          persistKey="inventory"
          onUpdateCell={updateCell}
          onOpenRecord={r => setDrawerRow(r)}
          emptyText="No inventory items yet. Click + Add asset."
        />

        <RecordDrawer<InventoryItem>
          open={!!drawerRow}
          row={drawerRow}
          columns={COLUMNS}
          onClose={() => setDrawerRow(null)}
          onUpdate={updateCell}
          onDelete={deleteRow}
          title={r => `${r.item_name || 'Asset'} — ${r.venue_name || 'No venue'}`}
        />
      </div>
    </DashboardLayout>
  )
}
