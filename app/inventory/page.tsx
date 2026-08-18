'use client'

// Inventory — two lists, one page (Joe 2026-08-17).
//
//   Venue Stock    what is on the shelf at a named venue. Every row carries a
//                  reorder level, and THIS is the list the 8am low-stock sweep
//                  reads and the list an RMA repair is credited back into.
//                  Backed by the dashboard database via /api/inventory.
//
//   Product Catalog  the product register — product ids, manufacturers, prices,
//                  restock orders. Backed by the ops data tables, unchanged.
//
// They were previously two different systems with only the catalog visible, so
// the reorder level that drove the alerts was a number nobody could see or set.
// Both are here now, and the tab that drives the alerts says so on its face.

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuth } from '@/lib/useAuth'
import { DataGrid, RecordDrawer, type ColumnConfig, type ViewConfig } from '@/components/data-grid'

// ── Venue stock ─────────────────────────────────────────────────────────────

interface StockItem {
  id: string
  item_name: string
  venue_id: string | null
  venue_name: string | null
  quantity: number
  threshold_low: number | null
  part_number: string | null
  manufacturer: string | null
  model_number: string | null
  location_code: string | null
  location_room: string | null
  sku: string | null
  last_updated: string | null
  updated_by_name: string | null
}

const STOCK_COLUMNS: ColumnConfig<StockItem>[] = [
  { id: 'item_name',      header: 'Item',          type: 'text',     width: 260, primary: true },
  { id: 'venue_name',     header: 'Venue',         type: 'text',     width: 200, editable: false },
  { id: 'quantity',       header: 'On hand',       type: 'number',   width: 100 },
  { id: 'threshold_low',  header: 'Reorder level', type: 'number',   width: 130 },
  { id: 'part_number',    header: 'Part #',        type: 'text',     width: 150 },
  { id: 'manufacturer',   header: 'Manufacturer',  type: 'text',     width: 170 },
  { id: 'model_number',   header: 'Model #',       type: 'text',     width: 140 },
  { id: 'location_code',  header: 'Location',      type: 'text',     width: 140 },
  { id: 'location_room',  header: 'Room',          type: 'text',     width: 140 },
  { id: 'last_updated',   header: 'Updated',       type: 'dateTime', width: 150, editable: false },
  { id: 'updated_by_name', header: 'Updated by',   type: 'text',     width: 160, editable: false },
]

// `?? 0` not `?? 999`: an item with no count recorded is not "plenty in stock",
// it is the one most likely to be empty.
const isLow = (r: StockItem) => (r.quantity ?? 0) <= (r.threshold_low ?? 5)

const STOCK_VIEWS: ViewConfig<StockItem>[] = [
  { id: 'all',      name: 'All stock',      type: 'grid', sort: [{ id: 'venue_name' }] },
  { id: 'low',      name: 'Running low',    type: 'grid', filter: isLow },
  { id: 'by-venue', name: 'Group by Venue', type: 'grid', groupBy: 'venue_name', sort: [{ id: 'item_name' }] },
]

// ── Product catalog (ops data tables) ───────────────────────────────────────

interface CatalogItem {
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

const CATALOG_COLUMNS: ColumnConfig<CatalogItem>[] = [
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

const CATALOG_VIEWS: ViewConfig<CatalogItem>[] = [
  { id: 'all',         name: 'Catalog Overview',      type: 'grid', sort: [{ id: 'part_name' }] },
  { id: 'low',         name: 'Low stock',             type: 'grid', filter: r => (r.inventory_count ?? 999) <= 5 },
  { id: 'by-type',     name: 'Group by Type',         type: 'grid', groupBy: 'type', sort: [{ id: 'part_name' }] },
  { id: 'by-make',     name: 'Group by Manufacturer', type: 'grid', groupBy: 'manufacturer_label', sort: [{ id: 'part_name' }] },
  { id: 'by-storage',  name: 'Group by Storage',      type: 'grid', groupBy: 'storage_label', sort: [{ id: 'part_name' }] },
  { id: 'gallery',     name: 'Product Gallery',       type: 'gallery' },
]

const CATALOG_FIELD_NAME: Record<string, string> = {
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

// ── Page ────────────────────────────────────────────────────────────────────

type Tab = 'stock' | 'catalog'

export default function InventoryPage() {
  useAuth('manager')
  const [tab, setTab] = useState<Tab>('stock')

  const [stock, setStock] = useState<StockItem[]>([])
  const [lowCount, setLowCount] = useState(0)
  const [stockLoading, setStockLoading] = useState(true)
  const [stockRow, setStockRow] = useState<StockItem | null>(null)

  const [catalog, setCatalog] = useState<CatalogItem[]>([])
  const [catalogTotal, setCatalogTotal] = useState<number | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogRow, setCatalogRow] = useState<CatalogItem | null>(null)

  const loadStock = async () => {
    setStockLoading(true)
    const r = await fetch('/api/inventory')
    if (r.ok) {
      const d = await r.json()
      setStock(d.items || [])
      setLowCount(Number(d.lowStockCount) || 0)
    }
    setStockLoading(false)
  }

  const loadCatalog = async () => {
    setCatalogLoading(true)
    const r = await fetch('/api/inventory/nocodb?action=list&limit=500')
    if (r.ok) {
      const d = await r.json()
      setCatalog(d.items || [])
      setCatalogTotal(typeof d.total === 'number' ? d.total : null)
    }
    setCatalogLoading(false)
  }

  useEffect(() => { loadStock(); loadCatalog() }, [])

  const updateStockCell = async (rowId: string, columnId: string, value: any) => {
    const r = await fetch('/api/inventory', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rowId, [columnId]: value }),
    })
    if (!r.ok) throw new Error('save failed')
    // Re-read rather than patching state locally: changing a count or a level
    // can move the row in and out of "Running low", and the badge has to follow.
    setStock(prev => prev.map(p => (p.id === rowId ? { ...p, [columnId]: value } : p)))
    loadStock()
  }

  const updateCatalogCell = async (rowId: string, columnId: string, value: any) => {
    const fieldName = CATALOG_FIELD_NAME[columnId]
    if (!fieldName) throw new Error(`Field '${columnId}' is not editable from the grid`)
    const r = await fetch('/api/inventory/nocodb', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rowId, fields: { [fieldName]: value } }),
    })
    if (!r.ok) throw new Error('save failed')
    setCatalog(prev => prev.map(p => (p.id === rowId ? { ...p, [columnId]: value } : p)))
  }

  const tabClass = (active: boolean) =>
    `h-9 rounded-md px-4 text-sm font-medium transition-colors ${
      active ? 'bg-[#0A52EF] text-white' : 'border border-[#E8E8E8] bg-white text-zinc-600 hover:border-zinc-300'
    }`

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Inventory</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {tab === 'stock'
              ? 'What is on the shelf at each venue. Set a reorder level and the daily check emails you the moment an item drops to it.'
              : 'The product register — product ids, manufacturers, prices and restock orders.'}
            {' '}Double-click a cell to edit.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button className={tabClass(tab === 'stock')} onClick={() => setTab('stock')}>
            Venue Stock
            {lowCount > 0 && (
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${tab === 'stock' ? 'bg-white/20' : 'bg-red-50 text-red-700'}`}>
                {lowCount} low
              </span>
            )}
          </button>
          <button className={tabClass(tab === 'catalog')} onClick={() => setTab('catalog')}>
            Product Catalog
          </button>
        </div>

        {tab === 'stock' ? (
          <>
            <DataGrid<StockItem>
              columns={STOCK_COLUMNS}
              rows={stock}
              loading={stockLoading}
              views={STOCK_VIEWS}
              persistKey="inventory-venue-stock"
              onUpdateCell={updateStockCell}
              onOpenRecord={r => setStockRow(r)}
              emptyText="No venue stock recorded yet. Add items to a venue to start tracking levels."
            />
            <RecordDrawer<StockItem>
              open={!!stockRow}
              row={stockRow}
              columns={STOCK_COLUMNS}
              onClose={() => setStockRow(null)}
              onUpdate={updateStockCell}
              title={r => `${r.item_name}${r.venue_name ? ' · ' + r.venue_name : ''}`}
            />
          </>
        ) : (
          <>
            <p className="text-xs text-zinc-400">
              {catalog.length}{catalogTotal != null && catalogTotal !== catalog.length ? ` of ${catalogTotal.toLocaleString()}` : ''} products.
            </p>
            <DataGrid<CatalogItem>
              columns={CATALOG_COLUMNS}
              rows={catalog}
              loading={catalogLoading}
              views={CATALOG_VIEWS}
              persistKey="inventory"
              onUpdateCell={updateCatalogCell}
              onOpenRecord={r => setCatalogRow(r)}
              emptyText="No products match this view."
            />
            <RecordDrawer<CatalogItem>
              open={!!catalogRow}
              row={catalogRow}
              columns={CATALOG_COLUMNS}
              onClose={() => setCatalogRow(null)}
              onUpdate={updateCatalogCell}
              title={r => `${r.part_name || 'Asset'}${r.product_id ? ' · ' + r.product_id : ''}`}
            />
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
