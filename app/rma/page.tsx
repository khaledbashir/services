'use client'

// RMA Tracker — DataGrid migration. Same pattern as the rest of the
// list pages.

import { useEffect, useState, FormEvent } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { DataGrid, RecordDrawer, type ColumnConfig, type ViewConfig } from '@/components/data-grid'

interface Rma {
  id: string
  venue_id: string | null
  venue_name: string | null
  company_name: string | null
  client_name: string | null
  date_received: string | null
  project_code: string | null
  part_number: string | null
  part_name: string | null
  model_number: string | null
  led_manufacturer: string | null
  description: string | null
  quantities: number | null
  repair_vendor: string | null
  shipment_tracking: string | null
  status: string
  remit_to_stock: boolean
  notes?: string | null
}

interface Venue { id: string; name: string }

const STATUS_OPTIONS = [
  { value: 'received',           label: 'Received',         color: 'amber' },
  { value: 'in_repair',          label: 'In repair',        color: 'sky' },
  { value: 'returned_to_vendor', label: 'Returned to vendor', color: 'violet' },
  { value: 'shipped_back',       label: 'Shipped back',     color: 'fuchsia' },
  { value: 'closed',             label: 'Closed',           color: 'emerald' },
]

const COLUMNS: ColumnConfig<Rma>[] = [
  { id: 'part_name',         header: 'Part',          type: 'text',         width: 220, primary: true },
  { id: 'venue_name',        header: 'Venue',         type: 'text',         width: 180, editable: false },
  { id: 'company_name',      header: 'Company',       type: 'text',         width: 180 },
  { id: 'status',            header: 'Status',        type: 'singleSelect', width: 170, options: STATUS_OPTIONS },
  { id: 'date_received',     header: 'Received',      type: 'date',         width: 130 },
  { id: 'quantities',        header: 'Qty',           type: 'number',       width: 80 },
  { id: 'part_number',       header: 'Part #',        type: 'text',         width: 140 },
  { id: 'model_number',      header: 'Model #',       type: 'text',         width: 140 },
  { id: 'led_manufacturer',  header: 'LED maker',     type: 'text',         width: 140 },
  { id: 'project_code',      header: 'Project',       type: 'text',         width: 130 },
  { id: 'repair_vendor',     header: 'Repair vendor', type: 'text',         width: 180 },
  { id: 'shipment_tracking', header: 'Tracking',      type: 'text',         width: 180 },
  { id: 'remit_to_stock',    header: 'Remit→stock',   type: 'checkbox',     width: 110 },
  { id: 'description',       header: 'Description',   type: 'longText',     width: 280 },
  { id: 'client_name',       header: 'Client',        type: 'text',         width: 160 },
]

const VIEWS: ViewConfig<Rma>[] = [
  { id: 'active',    name: 'Active',         type: 'grid', filter: r => r.status !== 'closed', sort: [{ id: 'date_received', desc: true }] },
  { id: 'all',       name: 'All',            type: 'grid', sort: [{ id: 'date_received', desc: true }] },
  { id: 'by-status', name: 'Group by Status',type: 'grid', groupBy: 'status', sort: [{ id: 'date_received', desc: true }] },
  { id: 'by-vendor', name: 'Group by Vendor',type: 'grid', groupBy: 'repair_vendor', sort: [{ id: 'date_received', desc: true }] },
  { id: 'by-venue',  name: 'Group by Venue', type: 'grid', groupBy: 'venue_name', sort: [{ id: 'date_received', desc: true }] },
  { id: 'closed',    name: 'Closed',         type: 'grid', filter: r => r.status === 'closed', sort: [{ id: 'date_received', desc: true }] },
]

export default function RmaPage() {
  const [rows, setRows] = useState<Rma[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [drawerRow, setDrawerRow] = useState<Rma | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    venue_id: '', company_name: '', client_name: '', submission_contact: '',
    date_received: '', project_code: '', part_number: '', part_name: '',
    model_number: '', led_manufacturer: '', description: '', quantities: '',
    parts_details: '', repair_vendor: '', shipping_method: '',
    shipment_tracking: '', remit_to_stock: false, status: 'received', notes: '',
  })

  const load = async () => {
    setLoading(true)
    const r = await fetch('/api/rma')
    if (r.ok) setRows((await r.json()).rmas || [])
    setLoading(false)
  }

  useEffect(() => {
    fetch('/api/venues').then(r => r.ok ? r.json() : { venues: [] }).then(d => setVenues(d.venues || []))
    load()
  }, [])

  const updateCell = async (rowId: string, columnId: string, value: any) => {
    const r = await fetch(`/api/rma/${rowId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [columnId]: value }),
    })
    if (!r.ok) throw new Error('save failed')
    setRows(prev => prev.map(p => (p.id === rowId ? { ...p, [columnId]: value } : p)))
  }

  const deleteRow = async (rowId: string) => {
    const r = await fetch(`/api/rma/${rowId}`, { method: 'DELETE' })
    if (!r.ok) throw new Error('delete failed')
    setRows(prev => prev.filter(p => p.id !== rowId))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = { ...form }
      payload.venue_id = form.venue_id || null
      payload.date_received = form.date_received || null
      payload.quantities = form.quantities ? Number(form.quantities) : null
      const r = await fetch('/api/rma', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (r.ok) {
        setShowCreate(false)
        setForm({ venue_id: '', company_name: '', client_name: '', submission_contact: '', date_received: '', project_code: '', part_number: '', part_name: '', model_number: '', led_manufacturer: '', description: '', quantities: '', parts_details: '', repair_vendor: '', shipping_method: '', shipment_tracking: '', remit_to_stock: false, status: 'received', notes: '' })
        load()
      } else { alert('Failed') }
    } finally { setSubmitting(false) }
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">RMA Tracker</h1>
            <p className="mt-1 text-sm text-zinc-500">Hardware returns &amp; repair tracking. Click any cell to edit, expand a row for the full record.</p>
          </div>
          <button onClick={() => setShowCreate(s => !s)} className="px-4 py-2 bg-[#0A52EF] text-white rounded-md text-sm font-medium hover:bg-[#0840C0]">
            {showCreate ? 'Cancel' : '+ New RMA'}
          </button>
        </div>

        {showCreate && (
          <form onSubmit={submit} className="rounded-2xl border border-[#E8E8E8] bg-white p-5 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-xs text-zinc-500 block mb-1">Venue</label>
                <select value={form.venue_id} onChange={e => setForm({ ...form, venue_id: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm">
                  <option value="">— None —</option>
                  {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Company</label>
                <input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Date Received</label>
                <input type="date" value={form.date_received} onChange={e => setForm({ ...form, date_received: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Part Name</label>
                <input value={form.part_name} onChange={e => setForm({ ...form, part_name: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" required /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Part #</label>
                <input value={form.part_number} onChange={e => setForm({ ...form, part_number: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Quantity</label>
                <input type="number" value={form.quantities} onChange={e => setForm({ ...form, quantities: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
            </div>
            <p className="text-[11px] text-zinc-400">More fields (vendor, model, tracking, description) — set them inline in the grid or in the record drawer after creation.</p>
            <button type="submit" disabled={submitting} className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium disabled:opacity-50">
              {submitting ? 'Creating…' : 'Create RMA'}
            </button>
          </form>
        )}

        <DataGrid<Rma>
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          views={VIEWS}
          persistKey="rma"
          onUpdateCell={updateCell}
          onOpenRecord={r => setDrawerRow(r)}
          emptyText="No RMAs yet. Click + New RMA."
        />

        <RecordDrawer<Rma>
          open={!!drawerRow}
          row={drawerRow}
          columns={COLUMNS}
          onClose={() => setDrawerRow(null)}
          onUpdate={updateCell}
          onDelete={deleteRow}
          title={r => `${r.part_name || 'RMA'} — ${r.venue_name || r.company_name || ''}`}
        />
      </div>
    </DashboardLayout>
  )
}
