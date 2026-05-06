'use client'

// Parts Catalog — DataGrid migration. Master list of service parts with
// on-hand quantities, low-stock filter, group-by manufacturer.

import { useEffect, useState, FormEvent } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { DataGrid, RecordDrawer, type ColumnConfig, type ViewConfig } from '@/components/data-grid'

interface Part {
  id: string
  part_number: string | null
  part_name: string
  manufacturer: string | null
  model_name: string | null
  description: string | null
  unit_cost: string | number | null
  quantity_on_hand: number
  reorder_threshold: number | null
  notes: string | null
}

const COLUMNS: ColumnConfig<Part>[] = [
  { id: 'part_name',         header: 'Name',          type: 'text',     width: 240, primary: true },
  { id: 'part_number',       header: 'Part #',        type: 'text',     width: 140 },
  { id: 'manufacturer',      header: 'Manufacturer',  type: 'text',     width: 180 },
  { id: 'model_name',        header: 'Model',         type: 'text',     width: 160 },
  { id: 'unit_cost',         header: 'Unit $',        type: 'number',   width: 100 },
  { id: 'quantity_on_hand',  header: 'On hand',       type: 'number',   width: 100 },
  { id: 'reorder_threshold', header: 'Reorder @',     type: 'number',   width: 110 },
  { id: 'description',       header: 'Description',   type: 'longText', width: 280 },
  { id: 'notes',             header: 'Notes',         type: 'longText', width: 240 },
]

const VIEWS: ViewConfig<Part>[] = [
  { id: 'all',      name: 'All Parts',          type: 'grid', sort: [{ id: 'part_name' }] },
  { id: 'low',      name: 'Reorder needed',     type: 'grid', filter: r => (r.reorder_threshold ?? 0) > 0 && r.quantity_on_hand <= (r.reorder_threshold ?? 0) },
  { id: 'by-make',  name: 'Group by Manufacturer', type: 'grid', groupBy: 'manufacturer', sort: [{ id: 'part_name' }] },
  { id: 'by-model', name: 'Group by Model',     type: 'grid', groupBy: 'model_name',    sort: [{ id: 'part_name' }] },
  { id: 'oos',      name: 'Out of stock',       type: 'grid', filter: r => (r.quantity_on_hand ?? 0) === 0 },
]

export default function PartsPage() {
  const [rows, setRows] = useState<Part[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerRow, setDrawerRow] = useState<Part | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    part_number: '', part_name: '', manufacturer: '', model_name: '',
    description: '', unit_cost: '', quantity_on_hand: '0', reorder_threshold: '5', notes: '',
  })

  const load = async () => {
    setLoading(true)
    const r = await fetch('/api/parts')
    if (r.ok) setRows((await r.json()).parts || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const updateCell = async (rowId: string, columnId: string, value: any) => {
    const r = await fetch(`/api/parts/${rowId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [columnId]: value }),
    })
    if (!r.ok) throw new Error('save failed')
    setRows(prev => prev.map(p => (p.id === rowId ? { ...p, [columnId]: value } : p)))
  }

  const deleteRow = async (rowId: string) => {
    const r = await fetch(`/api/parts/${rowId}`, { method: 'DELETE' })
    if (!r.ok) throw new Error('delete failed')
    setRows(prev => prev.filter(p => p.id !== rowId))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.part_name.trim()) return
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        unit_cost: form.unit_cost ? Number(form.unit_cost) : null,
        quantity_on_hand: Number(form.quantity_on_hand) || 0,
        reorder_threshold: Number(form.reorder_threshold) || 5,
      }
      const r = await fetch('/api/parts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (r.ok) {
        setShowCreate(false)
        setForm({ part_number: '', part_name: '', manufacturer: '', model_name: '', description: '', unit_cost: '', quantity_on_hand: '0', reorder_threshold: '5', notes: '' })
        load()
      } else { alert('Failed') }
    } finally { setSubmitting(false) }
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Parts Catalog</h1>
            <p className="mt-1 text-sm text-zinc-500">Master list of service parts and on-hand quantities. Click any cell to edit.</p>
          </div>
          <button onClick={() => setShowCreate(s => !s)} className="px-4 py-2 bg-[#0A52EF] text-white rounded-md text-sm font-medium hover:bg-[#0840C0]">
            {showCreate ? 'Cancel' : '+ Add Part'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={submit} className="rounded-2xl border border-[#E8E8E8] bg-white p-5 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-xs text-zinc-500 block mb-1">Part #</label>
                <input value={form.part_number} onChange={e => setForm({ ...form, part_number: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Name *</label>
                <input value={form.part_name} onChange={e => setForm({ ...form, part_name: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" required /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Manufacturer</label>
                <input value={form.manufacturer} onChange={e => setForm({ ...form, manufacturer: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Model</label>
                <input value={form.model_name} onChange={e => setForm({ ...form, model_name: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Unit Cost $</label>
                <input type="number" step="0.01" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Qty On Hand</label>
                <input type="number" value={form.quantity_on_hand} onChange={e => setForm({ ...form, quantity_on_hand: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
            </div>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium disabled:opacity-50">
              {submitting ? 'Adding…' : 'Create'}
            </button>
          </form>
        )}

        <DataGrid<Part>
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          views={VIEWS}
          persistKey="parts"
          onUpdateCell={updateCell}
          onOpenRecord={r => setDrawerRow(r)}
          emptyText="No parts yet. Click + Add Part."
        />

        <RecordDrawer<Part>
          open={!!drawerRow}
          row={drawerRow}
          columns={COLUMNS}
          onClose={() => setDrawerRow(null)}
          onUpdate={updateCell}
          onDelete={deleteRow}
          title={r => `${r.part_name || 'Part'}${r.part_number ? ' · ' + r.part_number : ''}`}
        />
      </div>
    </DashboardLayout>
  )
}
