'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'

interface Walk {
  id: string
  venue_id: string
  venue_name: string
  technician_name: string | null
  log_date: string
  log_time: string | null
  locations_visited: string | null
  issues_found: string | null
  result: string
  in_person: boolean
  notes: string | null
}

interface Venue { id: string; name: string }

const RESULT_STYLE: Record<string, string> = {
  good: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  problem_detected: 'bg-rose-50 text-rose-700 border-rose-200',
  partial: 'bg-amber-50 text-amber-700 border-amber-200',
}

export default function WalkthroughsPage() {
  const [walks, setWalks] = useState<Walk[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    venue_id: '', log_date: new Date().toISOString().split('T')[0], log_time: '',
    locations_visited: '', issues_found: '', result: 'good', in_person: true, notes: '',
  })

  const load = async () => {
    setLoading(true)
    const r = await fetch('/api/walkthroughs')
    if (r.ok) setWalks((await r.json()).walkthroughs || [])
    setLoading(false)
  }

  useEffect(() => {
    fetch('/api/venues').then(r => r.ok ? r.json() : { venues: [] }).then(d => setVenues(d.venues || []))
    load()
  }, [])

  const submit = async () => {
    if (!form.venue_id) return alert('Pick a venue')
    const r = await fetch('/api/walkthroughs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
    })
    if (r.ok) {
      setShowCreate(false)
      setForm({ venue_id: '', log_date: new Date().toISOString().split('T')[0], log_time: '', locations_visited: '', issues_found: '', result: 'good', in_person: true, notes: '' })
      load()
    } else { alert('Failed') }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Walkthrough Logs</h1>
            <p className="mt-1 text-sm text-zinc-500">Technician site visits and findings.</p>
          </div>
          <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium hover:bg-[#0840C0]">
            {showCreate ? 'Cancel' : '+ Log Walkthrough'}
          </button>
        </div>

        {showCreate && (
          <div className="rounded-2xl border border-[#E8E8E8] bg-white p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Venue *</label>
                <select value={form.venue_id} onChange={e => setForm({ ...form, venue_id: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm">
                  <option value="">Select venue</option>
                  {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Result</label>
                <select value={form.result} onChange={e => setForm({ ...form, result: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm">
                  <option value="good">Good</option>
                  <option value="problem_detected">Problem Detected</option>
                  <option value="partial">Partial</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Date</label>
                <input type="date" value={form.log_date} onChange={e => setForm({ ...form, log_date: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Time</label>
                <input type="time" value={form.log_time} onChange={e => setForm({ ...form, log_time: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-zinc-500 block mb-1">Locations Visited</label>
                <input value={form.locations_visited} onChange={e => setForm({ ...form, locations_visited: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" placeholder="Section 112, Section 234, Main Concourse" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-zinc-500 block mb-1">Issues Found</label>
                <textarea value={form.issues_found} onChange={e => setForm({ ...form, issues_found: e.target.value })} rows={3} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-zinc-500 block mb-1">Notes</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" />
              </div>
              <label className="flex items-center gap-2 text-sm text-zinc-600 col-span-2">
                <input type="checkbox" checked={form.in_person} onChange={e => setForm({ ...form, in_person: e.target.checked })} />
                In person
              </label>
            </div>
            <button onClick={submit} className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium">Create</button>
          </div>
        )}

        <div className="rounded-2xl border border-[#E8E8E8] bg-white overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-zinc-500">Loading…</div>
          ) : walks.length === 0 ? (
            <div className="p-12 text-center text-sm text-zinc-500">No walkthroughs yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                  <th className="px-5 py-3 text-left">Date</th>
                  <th className="px-5 py-3 text-left">Venue</th>
                  <th className="px-5 py-3 text-left">Technician</th>
                  <th className="px-5 py-3 text-left">Locations</th>
                  <th className="px-5 py-3 text-left">Result</th>
                </tr>
              </thead>
              <tbody>
                {walks.map(w => (
                  <tr key={w.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-5 py-3 text-zinc-600 text-xs font-mono">{w.log_date}{w.log_time ? ` ${w.log_time}` : ''}</td>
                    <td className="px-5 py-3 font-medium text-zinc-900">{w.venue_name}</td>
                    <td className="px-5 py-3 text-zinc-600">{w.technician_name || '—'}</td>
                    <td className="px-5 py-3 text-zinc-600 max-w-md truncate">{w.locations_visited || '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${RESULT_STYLE[w.result] || RESULT_STYLE.good}`}>
                        {w.result.replace('_', ' ')}
                      </span>
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
