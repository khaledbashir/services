'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'

interface Log {
  id: string
  venue_id: string
  venue_name: string
  technician_name: string | null
  asset_name: string | null
  maintenance_type: string
  issue: string | null
  issue_summary: string | null
  status: string
  reported_date: string | null
  scheduled_date: string | null
  completed_date: string | null
  location_reported: string | null
  techs_scheduled: string | null
}

interface Venue { id: string; name: string }

const TYPE_OPTIONS = ['reactive', 'scheduled', 'preventive']
const STATUS_OPTIONS = ['open', 'in_progress', 'completed', 'cancelled']

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-sky-50 text-sky-700 border-sky-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-zinc-50 text-zinc-500 border-zinc-200',
}

export default function MaintenancePage() {
  const [logs, setLogs] = useState<Log[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    venue_id: '', maintenance_type: 'reactive', issue: '', issue_summary: '',
    details_to_resolve: '', escort_information: '',
    location_reported: '', techs_scheduled: '', scheduled_date: '', status: 'open',
    asset_id: '',
  })
  const [assetOptions, setAssetOptions] = useState<Array<{ id: string; item_name: string }>>([])
  useEffect(() => {
    // Fetch inventory assets for the selected venue so maintenance can be
    // linked to a specific display / piece of equipment.
    if (!form.venue_id) { setAssetOptions([]); return }
    fetch(`/api/inventory?venue_id=${form.venue_id}`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then(d => setAssetOptions((d.items || []).map((x: any) => ({ id: x.id, item_name: x.item_name }))))
      .catch(() => setAssetOptions([]))
  }, [form.venue_id])
  const [quick, setQuick] = useState({ venue_id: '', issue: '', maintenance_type: 'reactive' })
  const [quickSaving, setQuickSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const qs = statusFilter !== 'all' ? `?status=${statusFilter}` : ''
    const r = await fetch(`/api/maintenance${qs}`)
    if (r.ok) setLogs((await r.json()).logs || [])
    setLoading(false)
  }

  useEffect(() => {
    fetch('/api/venues').then(r => r.ok ? r.json() : { venues: [] }).then(d => setVenues(d.venues || []))
  }, [])

  useEffect(() => { load() }, [statusFilter])

  const submit = async () => {
    if (!form.venue_id) return alert('Pick a venue')
    const r = await fetch('/api/maintenance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, scheduled_date: form.scheduled_date || null }),
    })
    if (r.ok) {
      setShowCreate(false)
      setForm({ venue_id: '', maintenance_type: 'reactive', issue: '', issue_summary: '', details_to_resolve: '', escort_information: '', location_reported: '', techs_scheduled: '', scheduled_date: '', status: 'open', asset_id: '' })
      load()
    } else {
      alert('Failed to create')
    }
  }

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/maintenance/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status, completed_date: status === 'completed' ? new Date().toISOString().split('T')[0] : null }) })
    load()
  }

  const quickSubmit = async () => {
    if (!quick.venue_id || !quick.issue.trim() || quickSaving) return
    setQuickSaving(true)
    const r = await fetch('/api/maintenance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venue_id: quick.venue_id,
        issue: quick.issue.trim(),
        maintenance_type: quick.maintenance_type,
        status: 'open',
        reported_date: new Date().toISOString().split('T')[0],
      }),
    })
    if (r.ok) {
      setQuick({ venue_id: quick.venue_id, issue: '', maintenance_type: quick.maintenance_type })
      load()
    }
    setQuickSaving(false)
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Maintenance Logs</h1>
            <p className="mt-1 text-sm text-zinc-500">Scheduled + reactive work across all venues.</p>
          </div>
          <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium hover:bg-[#0840C0]">
            {showCreate ? 'Cancel' : '+ Log Maintenance'}
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {['all', ...STATUS_OPTIONS].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded text-xs font-medium border ${statusFilter === s ? 'bg-[#0A52EF] text-white border-[#0A52EF]' : 'bg-white text-zinc-600 border-[#E8E8E8] hover:border-zinc-300'}`}>
              {s.replace('_', ' ')}
            </button>
          ))}
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
                <label className="text-xs font-medium text-zinc-500 block mb-1">Type</label>
                <select value={form.maintenance_type} onChange={e => setForm({ ...form, maintenance_type: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm">
                  {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-zinc-500 block mb-1">Issue <span className="text-red-500">*</span></label>
                <input value={form.issue} onChange={e => setForm({ ...form, issue: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" placeholder="e.g. Dead pixels on Section 112 ribbon" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-zinc-500 block mb-1">Summary (short)</label>
                <textarea value={form.issue_summary} onChange={e => setForm({ ...form, issue_summary: e.target.value })} rows={2} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" placeholder="One-liner summary for the list view" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-zinc-500 block mb-1">Details to Resolve (markdown)</label>
                <textarea value={form.details_to_resolve} onChange={e => setForm({ ...form, details_to_resolve: e.target.value })} rows={5} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm font-mono" placeholder="Full repro + steps + parts needed. Markdown OK." />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Asset (Inventory Item)</label>
                <select value={form.asset_id} onChange={e => setForm({ ...form, asset_id: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm">
                  <option value="">— Not linked —</option>
                  {assetOptions.map(a => <option key={a.id} value={a.id}>{a.item_name}</option>)}
                </select>
                {!form.venue_id && <span className="text-[10px] text-zinc-400">Pick a venue first to load its assets</span>}
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Location Reported</label>
                <input value={form.location_reported} onChange={e => setForm({ ...form, location_reported: e.target.value })} placeholder="Section 112, near portal" className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Scheduled Date</label>
                <input type="date" value={form.scheduled_date} onChange={e => setForm({ ...form, scheduled_date: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Techs Scheduled</label>
                <input value={form.techs_scheduled} onChange={e => setForm({ ...form, techs_scheduled: e.target.value })} placeholder="Names / crew" className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-zinc-500 block mb-1">Escort Information</label>
                <textarea value={form.escort_information} onChange={e => setForm({ ...form, escort_information: e.target.value })} rows={3} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" placeholder="Security contact, arrival gate, access codes, who to text on arrival. Example:&#10;11:00 PM&#10;Brandon Tate&#10;202-924-2622&#10;Crystal City — station gate, top of escalators" />
              </div>
            </div>
            <button onClick={submit} className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium">Create</button>
          </div>
        )}

        {/* Inline quick-add. Pick venue, type issue, Enter → saved as open/reactive. */}
        <div className="rounded-2xl border border-[#E8E8E8] bg-white p-2.5 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 pl-1">Quick log</span>
          <select value={quick.venue_id} onChange={e => setQuick({ ...quick, venue_id: e.target.value })} className="px-2 py-1.5 border border-[#E8E8E8] rounded-lg text-xs max-w-[180px]">
            <option value="">Venue *</option>
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <input value={quick.issue} onChange={e => setQuick({ ...quick, issue: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') quickSubmit() }}
            placeholder="Describe the issue (press Enter)"
            className="flex-1 min-w-[220px] px-3 py-1.5 border border-[#E8E8E8] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
            disabled={quickSaving} />
          <select value={quick.maintenance_type} onChange={e => setQuick({ ...quick, maintenance_type: e.target.value })} className="px-2 py-1.5 border border-[#E8E8E8] rounded-lg text-xs">
            <option value="reactive">Reactive</option>
            <option value="scheduled">Scheduled</option>
            <option value="preventive">Preventive</option>
          </select>
          <button onClick={quickSubmit} disabled={!quick.venue_id || !quick.issue.trim() || quickSaving}
            className="px-3 py-1.5 bg-[#0A52EF] text-white rounded-lg text-xs font-medium disabled:opacity-50">
            {quickSaving ? 'Saving…' : 'Log'}
          </button>
        </div>

        <div className="rounded-2xl border border-[#E8E8E8] bg-white overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-zinc-500">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="p-12 text-center text-sm text-zinc-500">No maintenance logs yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                  <th className="px-5 py-3 text-left">Venue</th>
                  <th className="px-5 py-3 text-left">Type</th>
                  <th className="px-5 py-3 text-left">Issue</th>
                  <th className="px-5 py-3 text-left">Scheduled</th>
                  <th className="px-5 py-3 text-left">Status</th>
                  <th className="px-5 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-5 py-3 font-medium text-zinc-900">{log.venue_name}</td>
                    <td className="px-5 py-3 text-zinc-600 capitalize">{log.maintenance_type}</td>
                    <td className="px-5 py-3 text-zinc-700 max-w-md truncate">{log.issue || log.issue_summary || '—'}</td>
                    <td className="px-5 py-3 text-zinc-500 text-xs font-mono">{log.scheduled_date || '—'}</td>
                    <td className="px-5 py-3">
                      <select value={log.status} onChange={e => updateStatus(log.id, e.target.value)}
                        className={`px-2 py-1 rounded-full text-xs font-medium border ${STATUS_STYLE[log.status] || STATUS_STYLE.open} appearance-none pr-6`}>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3"></td>
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
