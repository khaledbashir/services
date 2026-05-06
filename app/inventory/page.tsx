'use client'

// Inventory list — backed by NocoDB Inventory Tracking base. Reads
// /api/inventory/nocodb?action=list and PATCHes inline edits straight
// back to NocoDB. Schema mirrors NocoDB column titles.

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuth } from '@/lib/useAuth'
import { DataGrid, RecordDrawer, type ColumnConfig, type ViewConfig } from '@/components/data-grid'

interface InventoryItem {
  id: string
  part_name: string
  product_id: string | null
  model_number: string | null
  type: string | null
  inventory_label: string | null
  inventory_count: number | null
  units_ordered: number | null
  units_consumed: number | null
  manufacturer_label: string | null
  storage_label: string | null
  restock_label: string | null
  manufacturer_price: number | null
  notes: string | null
  created_at: string | null
  updated_at: string | null
}

// Mirrors NocoDB Inventory.Type singleSelect options exactly.
const TYPE_OPTIONS = [
  { value: 'Lighting Units',  label: 'Lighting Units',  color: 'sky' },
  { value: 'Power Supplies',  label: 'Power Supplies',  color: 'amber' },
  { value: 'Cables',          label: 'Cables',          color: 'cyan' },
  { value: 'Frames',          label: 'Frames',          color: 'violet' },
  { value: 'Spare Units',     label: 'Spare Units',     color: 'emerald' },
  { value: 'Miscellaneous',   label: 'Miscellaneous',   color: 'zinc' },
  { value: 'Player',          label: 'Player',          color: 'teal' },
  { value: 'Server',          label: 'Server',          color: 'fuchsia' },
]

const COLUMNS: ColumnConfig<InventoryItem>[] = [
  { id: 'part_name',           header: 'Part Name',     type: 'text',         width: 220, primary: true },
  { id: 'product_id',          header: 'Product ID',    type: 'text',         width: 130 },
  { id: 'type',                header: 'Type',          type: 'singleSelect', width: 160, options: TYPE_OPTIONS },
  { id: 'model_number',        header: 'Model #',       type: 'text',         width: 140 },
  { id: 'manufacturer_label',  header: 'Manufacturer',  type: 'text',         width: 180, editable: false },
  { id: 'storage_label',       header: 'Storage',       type: 'text',         width: 180, editable: false },
  { id: 'inventory_label',     header: 'Inventory',     type: 'text',         width: 110 },
  { id: 'units_ordered',       header: 'Ordered',       type: 'number',       width: 90 },
  { id: 'units_consumed',      header: 'Consumed',      type: 'number',       width: 100 },
  { id: 'manufacturer_price',  header: 'Mfr Price $',   type: 'number',       width: 110 },
  { id: 'restock_label',       header: 'Restock orders',type: 'text',         width: 180, editable: false },
  { id: 'notes',               header: 'Notes',         type: 'longText',     width: 280 },
  { id: 'updated_at',          header: 'Updated',       type: 'dateTime',     width: 150, editable: false },
]

const VIEWS: ViewConfig<InventoryItem>[] = [
  { id: 'all',         name: 'Inventory Overview', type: 'grid', sort: [{ id: 'part_name' }] },
  { id: 'low',         name: 'Low stock',          type: 'grid', filter: r => (r.inventory_count ?? 999) <= 5 },
  { id: 'by-type',     name: 'Group by Type',      type: 'grid', groupBy: 'type', sort: [{ id: 'part_name' }] },
  { id: 'by-make',     name: 'Group by Manufacturer', type: 'grid', groupBy: 'manufacturer_label', sort: [{ id: 'part_name' }] },
  { id: 'by-storage',  name: 'Group by Storage',   type: 'grid', groupBy: 'storage_label', sort: [{ id: 'part_name' }] },
  { id: 'gallery',     name: 'Product Gallery',    type: 'gallery' },
]

// Map DataGrid column ids → NocoDB column titles for PATCH writes.
const NOCO_FIELD_NAME: Record<string, string> = {
  part_name: 'Part Name',
  product_id: 'Product ID',
  model_number: 'Model Number',
  type: 'Type',
  inventory_label: 'Inventory',
  units_ordered: 'Units Ordered',
  units_consumed: 'Units Consumed',
  manufacturer_price: 'Manufacturer Price',
  notes: 'Notes',
}

export default function InventoryPage() {
  useAuth('manager')
  const [items, setItems] = useState<InventoryItem[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [drawerRow, setDrawerRow] = useState<InventoryItem | null>(null)

  const load = async () => {
    setLoading(true)
    const r = await fetch('/api/inventory/nocodb?action=list&limit=500')
    if (r.ok) {
      const d = await r.json()
      setItems(d.items || [])
      setTotal(typeof d.total === 'number' ? d.total : null)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const updateCell = async (rowId: string, columnId: string, value: any) => {
    const fieldName = NOCO_FIELD_NAME[columnId]
    if (!fieldName) throw new Error(`Field '${columnId}' is not editable from the grid`)
    const r = await fetch('/api/inventory/nocodb', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rowId, fields: { [fieldName]: value } }),
    })
    if (!r.ok) throw new Error('save failed')
    setItems(prev => prev.map(p => (p.id === rowId ? { ...p, [columnId]: value } : p)))
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Inventory</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Live from NocoDB Inventory Tracking — {items.length}{total != null && total !== items.length ? ` of ${total.toLocaleString()}` : ''} items. Double-click a cell to edit.
            </p>
          </div>
        </div>

        <DataGrid<InventoryItem>
          columns={COLUMNS}
          rows={items}
          loading={loading}
          views={VIEWS}
          persistKey="inventory"
          onUpdateCell={updateCell}
          onOpenRecord={r => setDrawerRow(r)}
          emptyText="No inventory items match this view."
        />

        <RecordDrawer<InventoryItem>
          open={!!drawerRow}
          row={drawerRow}
          columns={COLUMNS}
          onClose={() => setDrawerRow(null)}
          onUpdate={updateCell}
          title={r => `${r.part_name || 'Asset'}${r.product_id ? ' · ' + r.product_id : ''}`}
        />
      </div>
    </DashboardLayout>
  )
}
