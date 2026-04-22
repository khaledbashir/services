'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { formatDate } from '@/lib/format-date'

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
}

interface Venue { id: string; name: string }

const STATUS_OPTIONS = ['received', 'in_repair', 'returned_to_vendor', 'shipped_back', 'closed']
const STATUS_STYLE: Record<string, string> = {
  received: 'bg-amber-50 text-amber-700 border-amber-200',
  in_repair: 'bg-sky-50 text-sky-700 border-sky-200',
  returned_to_vendor: 'bg-violet-50 text-violet-700 border-violet-200',
  shipped_back: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  closed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

export default function RmaPage() {
  const [rmas, setRmas] = useState<Rma[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    venue_id: '', company_name: '', client_name: '', submission_contact: '',
    date_received: '', project_code: '', part_number: '', part_name: '',
    model_number: '', led_manufacturer: '', description: '', quantities: '',
    parts_details: '', repair_vendor: '', shipping_method: '',
    shipment_tracking: '', remit_to_stock: false, status: 'received', notes: '',
  })

  const load = async () => {
    setLoading(true)
    const qs = filter !== 'all' ? `?status=${filter}` : ''
    const r = await fetch(`/api/rma${qs}`)
    if (r.ok) setRmas((await r.json()).rmas || [])
    setLoading(false)
  }

  useEffect(() => {
    fetch('/api/venues').then(r => r.ok ? r.json() : { venues: [] }).then(d => setVenues(d.venues || []))
  }, [])
  useEffect(() => { load() }, [filter])

  const submit = async () => {
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
  }

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/rma/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    load()
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">RMA Tracker</h1>
            <p className="mt-1 text-sm text-zinc-500">Hardware returns & repair tracking.</p>
          </div>
          <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium">
            {showCreate ? 'Cancel' : '+ New RMA'}
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {['all', ...STATUS_OPTIONS].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded text-xs font-medium border ${filter === s ? 'bg-[#0A52EF] text-white border-[#0A52EF]' : 'bg-white text-zinc-600 border-[#E8E8E8]'}`}>
              {s.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {showCreate && (
          <div className="rounded-2xl border border-[#E8E8E8] bg-white p-5 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-xs text-zinc-500 block mb-1">Venue</label>
                <select value={form.venue_id} onChange={e => setForm({ ...form, venue_id: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm">
                  <option value="">— None —</option>
                  {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Company</label>
                <input value={form.company_name} onChange={e => setForm({ ...form, company_name: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Client</label>
                <input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Date Received</label>
                <input type="date" value={form.date_received} onChange={e => setForm({ ...form, date_received: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Project Code</label>
                <input value={form.project_code} onChange={e => setForm({ ...form, project_code: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Quantity</label>
                <input type="number" value={form.quantities} onChange={e => setForm({ ...form, quantities: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Part #</label>
                <input value={form.part_number} onChange={e => setForm({ ...form, part_number: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Part Name</label>
                <input value={form.part_name} onChange={e => setForm({ ...form, part_name: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Model #</label>
                <input value={form.model_number} onChange={e => setForm({ ...form, model_number: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">LED Manufacturer</label>
                <input value={form.led_manufacturer} onChange={e => setForm({ ...form, led_manufacturer: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Submission Contact</label>
                <input value={form.submission_contact} onChange={e => setForm({ ...form, submission_contact: e.target.value })} placeholder="Who submitted this RMA" className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Repair Vendor</label>
                <input value={form.repair_vendor} onChange={e => setForm({ ...form, repair_vendor: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Shipping Method</label>
                <input value={form.shipping_method} onChange={e => setForm({ ...form, shipping_method: e.target.value })} placeholder="UPS Ground, FedEx, …" className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Tracking #</label>
                <input value={form.shipment_tracking} onChange={e => setForm({ ...form, shipment_tracking: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm font-mono" /></div>
              <div className="col-span-3"><label className="text-xs text-zinc-500 block mb-1">Description</label>
                <textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div className="col-span-3"><label className="text-xs text-zinc-500 block mb-1">Parts Details</label>
                <textarea rows={3} value={form.parts_details} onChange={e => setForm({ ...form, parts_details: e.target.value })} placeholder="Module / PSU / LED panel breakdown, serial numbers, quantities per part" className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <label className="col-span-3 flex items-center gap-2 text-sm text-zinc-700 px-1">
                <input type="checkbox" checked={form.remit_to_stock} onChange={e => setForm({ ...form, remit_to_stock: e.target.checked })} className="h-4 w-4 accent-[#0A52EF]" />
                <span>Remit repaired parts to stock (don't return to venue)</span>
              </label>
            </div>
            <button onClick={submit} className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium">Create RMA</button>
          </div>
        )}

        <div className="rounded-2xl border border-[#E8E8E8] bg-white overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-zinc-500">Loading…</div>
          ) : rmas.length === 0 ? (
            <div className="p-12 text-center text-sm text-zinc-500">No RMAs yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                  <th className="px-5 py-3 text-left">Received</th>
                  <th className="px-5 py-3 text-left">Venue / Company</th>
                  <th className="px-5 py-3 text-left">Part</th>
                  <th className="px-5 py-3 text-left">Model</th>
                  <th className="px-5 py-3 text-left">Qty</th>
                  <th className="px-5 py-3 text-left">Vendor</th>
                  <th className="px-5 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rmas.map(r => (
                  <tr key={r.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-5 py-3 text-zinc-600">{formatDate(r.date_received)}</td>
                    <td className="px-5 py-3 text-zinc-700">{r.venue_name || r.company_name || '—'}</td>
                    <td className="px-5 py-3 text-zinc-700">{[r.part_name, r.part_number].filter(Boolean).join(' / ') || '—'}</td>
                    <td className="px-5 py-3 text-zinc-600">{r.model_number || '—'}</td>
                    <td className="px-5 py-3 text-zinc-600 font-mono text-xs">{r.quantities ?? '—'}</td>
                    <td className="px-5 py-3 text-zinc-600">{r.repair_vendor || '—'}</td>
                    <td className="px-5 py-3">
                      <select value={r.status} onChange={e => updateStatus(r.id, e.target.value)}
                        className={`px-2 py-1 rounded-full text-xs font-medium border appearance-none pr-6 ${STATUS_STYLE[r.status] || STATUS_STYLE.received}`}>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
