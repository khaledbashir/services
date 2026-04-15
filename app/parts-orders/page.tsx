'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'

interface Order {
  id: string
  venue_id: string | null
  venue_name: string | null
  part_id: string | null
  part_name: string | null
  part_number: string | null
  parts_needed: string
  quantity: number
  requestor_name: string | null
  requestor_email: string | null
  shipping_address: string | null
  notes: string | null
  photo_url: string | null
  status: string
}

interface Venue { id: string; name: string }
interface Part { id: string; part_name: string; part_number: string | null }

const STATUS_OPTIONS = ['requested', 'ordered', 'shipped', 'delivered', 'cancelled']
const STATUS_STYLE: Record<string, string> = {
  requested: 'bg-amber-50 text-amber-700 border-amber-200',
  ordered: 'bg-sky-50 text-sky-700 border-sky-200',
  shipped: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-zinc-50 text-zinc-500 border-zinc-200',
}

export default function PartsOrdersPage() {
  const [orders, setOrders] = useState<Order[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [parts, setParts] = useState<Part[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    venue_id: '', part_id: '', parts_needed: '', quantity: '1',
    requestor_name: '', requestor_email: '', shipping_address: '', notes: '',
  })

  const load = async () => {
    setLoading(true)
    const qs = filter !== 'all' ? `?status=${filter}` : ''
    const r = await fetch(`/api/parts-orders${qs}`)
    if (r.ok) setOrders((await r.json()).orders || [])
    setLoading(false)
  }
  useEffect(() => {
    fetch('/api/venues').then(r => r.ok ? r.json() : { venues: [] }).then(d => setVenues(d.venues || []))
    fetch('/api/parts').then(r => r.ok ? r.json() : { parts: [] }).then(d => setParts(d.parts || []))
  }, [])
  useEffect(() => { load() }, [filter])

  const submit = async () => {
    if (!form.parts_needed) return alert('Describe what you need')
    const payload = {
      ...form,
      venue_id: form.venue_id || null,
      part_id: form.part_id || null,
      quantity: Number(form.quantity) || 1,
    }
    const r = await fetch('/api/parts-orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (r.ok) {
      setShowCreate(false)
      setForm({ venue_id: '', part_id: '', parts_needed: '', quantity: '1', requestor_name: '', requestor_email: '', shipping_address: '', notes: '' })
      load()
    } else { alert('Failed') }
  }

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/parts-orders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    load()
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Parts Orders</h1>
            <p className="mt-1 text-sm text-zinc-500">Internal parts requests across venues.</p>
          </div>
          <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium">
            {showCreate ? 'Cancel' : '+ Request Parts'}
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {['all', ...STATUS_OPTIONS].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded text-xs font-medium border ${filter === s ? 'bg-[#0A52EF] text-white border-[#0A52EF]' : 'bg-white text-zinc-600 border-[#E8E8E8]'}`}>
              {s}
            </button>
          ))}
        </div>

        {showCreate && (
          <div className="rounded-2xl border border-[#E8E8E8] bg-white p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-zinc-500 block mb-1">Venue</label>
                <select value={form.venue_id} onChange={e => setForm({ ...form, venue_id: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm">
                  <option value="">— None —</option>
                  {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Part (catalog)</label>
                <select value={form.part_id} onChange={e => setForm({ ...form, part_id: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm">
                  <option value="">— Freeform —</option>
                  {parts.map(p => <option key={p.id} value={p.id}>{p.part_name}{p.part_number ? ` (${p.part_number})` : ''}</option>)}
                </select></div>
              <div className="col-span-2"><label className="text-xs text-zinc-500 block mb-1">Parts Needed *</label>
                <input value={form.parts_needed} onChange={e => setForm({ ...form, parts_needed: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" placeholder="LED module MR-3 for Section 112 ribbon" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Quantity</label>
                <input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Requestor</label>
                <input value={form.requestor_name} onChange={e => setForm({ ...form, requestor_name: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Requestor Email</label>
                <input type="email" value={form.requestor_email} onChange={e => setForm({ ...form, requestor_email: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Shipping Address</label>
                <input value={form.shipping_address} onChange={e => setForm({ ...form, shipping_address: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div className="col-span-2"><label className="text-xs text-zinc-500 block mb-1">Notes</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
            </div>
            <button onClick={submit} className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium">Submit</button>
          </div>
        )}

        <div className="rounded-2xl border border-[#E8E8E8] bg-white overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-zinc-500">Loading…</div>
          ) : orders.length === 0 ? (
            <div className="p-12 text-center text-sm text-zinc-500">No parts orders yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                  <th className="px-5 py-3 text-left">Venue</th>
                  <th className="px-5 py-3 text-left">Part</th>
                  <th className="px-5 py-3 text-right">Qty</th>
                  <th className="px-5 py-3 text-left">Requestor</th>
                  <th className="px-5 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr key={o.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-5 py-3 text-zinc-700">{o.venue_name || '—'}</td>
                    <td className="px-5 py-3 font-medium text-zinc-900">{o.part_name || o.parts_needed}</td>
                    <td className="px-5 py-3 text-right text-zinc-600 font-mono text-xs">{o.quantity}</td>
                    <td className="px-5 py-3 text-zinc-600">{o.requestor_name || '—'}</td>
                    <td className="px-5 py-3">
                      <select value={o.status} onChange={e => updateStatus(o.id, e.target.value)}
                        className={`px-2 py-1 rounded-full text-xs font-medium border appearance-none pr-6 ${STATUS_STYLE[o.status] || STATUS_STYLE.requested}`}>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
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
