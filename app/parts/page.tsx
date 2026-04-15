'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'

interface Part {
  id: string
  part_number: string | null
  part_name: string
  manufacturer: string | null
  model_name: string | null
  description: string | null
  unit_cost: string | null
  quantity_on_hand: number
  reorder_threshold: number | null
  notes: string | null
}

export default function PartsPage() {
  const [parts, setParts] = useState<Part[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    part_number: '', part_name: '', manufacturer: '', model_name: '',
    description: '', unit_cost: '', quantity_on_hand: '0', reorder_threshold: '5', notes: '',
  })

  const load = async () => {
    setLoading(true)
    const r = await fetch('/api/parts')
    if (r.ok) setParts((await r.json()).parts || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const submit = async () => {
    if (!form.part_name) return alert('Part name required')
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
  }

  const updateQty = async (id: string, qty: number) => {
    await fetch(`/api/parts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity_on_hand: qty }) })
    load()
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Parts Catalog</h1>
            <p className="mt-1 text-sm text-zinc-500">Master list of service parts, on-hand quantities.</p>
          </div>
          <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium">
            {showCreate ? 'Cancel' : '+ Add Part'}
          </button>
        </div>

        {showCreate && (
          <div className="rounded-2xl border border-[#E8E8E8] bg-white p-5 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div><label className="text-xs text-zinc-500 block mb-1">Part # </label>
                <input value={form.part_number} onChange={e => setForm({ ...form, part_number: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Name *</label>
                <input value={form.part_name} onChange={e => setForm({ ...form, part_name: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Manufacturer</label>
                <input value={form.manufacturer} onChange={e => setForm({ ...form, manufacturer: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Model</label>
                <input value={form.model_name} onChange={e => setForm({ ...form, model_name: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Unit Cost $</label>
                <input type="number" step="0.01" value={form.unit_cost} onChange={e => setForm({ ...form, unit_cost: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div><label className="text-xs text-zinc-500 block mb-1">Qty On Hand</label>
                <input type="number" value={form.quantity_on_hand} onChange={e => setForm({ ...form, quantity_on_hand: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
              <div className="col-span-3"><label className="text-xs text-zinc-500 block mb-1">Description</label>
                <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" /></div>
            </div>
            <button onClick={submit} className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium">Create</button>
          </div>
        )}

        <div className="rounded-2xl border border-[#E8E8E8] bg-white overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-zinc-500">Loading…</div>
          ) : parts.length === 0 ? (
            <div className="p-12 text-center text-sm text-zinc-500">No parts yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                  <th className="px-5 py-3 text-left">Part #</th>
                  <th className="px-5 py-3 text-left">Name</th>
                  <th className="px-5 py-3 text-left">Manufacturer</th>
                  <th className="px-5 py-3 text-left">Model</th>
                  <th className="px-5 py-3 text-right">Unit $</th>
                  <th className="px-5 py-3 text-right">On Hand</th>
                </tr>
              </thead>
              <tbody>
                {parts.map(p => {
                  const low = (p.reorder_threshold || 0) > 0 && p.quantity_on_hand <= (p.reorder_threshold || 0)
                  return (
                    <tr key={p.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                      <td className="px-5 py-3 text-zinc-600 font-mono text-xs">{p.part_number || '—'}</td>
                      <td className="px-5 py-3 font-medium text-zinc-900">{p.part_name}</td>
                      <td className="px-5 py-3 text-zinc-600">{p.manufacturer || '—'}</td>
                      <td className="px-5 py-3 text-zinc-600">{p.model_name || '—'}</td>
                      <td className="px-5 py-3 text-right text-zinc-600">{p.unit_cost ? `$${Number(p.unit_cost).toFixed(2)}` : '—'}</td>
                      <td className="px-5 py-3 text-right">
                        <input type="number" defaultValue={p.quantity_on_hand}
                          onBlur={e => { const n = Number(e.target.value); if (n !== p.quantity_on_hand) updateQty(p.id, n) }}
                          className={`w-20 text-right px-2 py-1 border rounded ${low ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-[#E8E8E8]'}`} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
