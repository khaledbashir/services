'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { formatDate } from '@/lib/format-date'

interface Item {
  id: string
  venue_id: string | null
  venue_name: string | null
  assignee_name: string | null
  days_out: string
  league: string | null
  team_name: string | null
  task_description: string
  prompt: string | null
  due_date: string | null
  status: string
}

interface Venue { id: string; name: string }
interface Staff { id: string; full_name: string }

const STATUS_STYLE: Record<string, string> = {
  not_started: 'bg-zinc-50 text-zinc-600 border-zinc-200',
  in_progress: 'bg-sky-50 text-sky-700 border-sky-200',
  done: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const LEAGUES = ['NBA', 'NHL', 'MLB', 'NFL', 'NCAAM', 'MLS', 'MiLB']

interface QuickAdd {
  task_description: string
  days_out: string
  league: string
  venue_id: string
  due_date: string
}

export default function ChecklistsPage() {
  const [items, setItems] = useState<Item[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [daysFilter, setDaysFilter] = useState('all')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({
    venue_id: '', days_out: '30', league: '', team_name: '',
    task_description: '', prompt: '', assignee_id: '', due_date: '', status: 'not_started',
  })
  const [quick, setQuick] = useState<QuickAdd>({ task_description: '', days_out: '30', league: '', venue_id: '', due_date: '' })
  const [quickSaving, setQuickSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const qs = filter !== 'all' ? `?status=${filter}` : ''
    const r = await fetch(`/api/checklists${qs}`)
    if (r.ok) setItems((await r.json()).items || [])
    setLoading(false)
  }

  useEffect(() => {
    fetch('/api/venues').then(r => r.ok ? r.json() : { venues: [] }).then(d => setVenues(d.venues || []))
    fetch('/api/staff').then(r => r.ok ? r.json() : { staff: [] }).then(d => setStaff(d.staff || []))
  }, [])

  useEffect(() => { load() }, [filter])

  const submit = async () => {
    if (!form.task_description) return alert('Task description required')
    const payload = {
      ...form,
      venue_id: form.venue_id || null,
      assignee_id: form.assignee_id || null,
      due_date: form.due_date || null,
      league: form.league || null,
      team_name: form.team_name || null,
    }
    const r = await fetch('/api/checklists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (r.ok) {
      setShowCreate(false)
      setForm({ venue_id: '', days_out: '30', league: '', team_name: '', task_description: '', prompt: '', assignee_id: '', due_date: '', status: 'not_started' })
      load()
    } else { alert('Failed') }
  }

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/checklists/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    load()
  }

  const quickSubmit = async () => {
    if (!quick.task_description.trim() || quickSaving) return
    setQuickSaving(true)
    const payload = {
      task_description: quick.task_description.trim(),
      days_out: quick.days_out,
      league: quick.league || null,
      venue_id: quick.venue_id || null,
      due_date: quick.due_date || null,
      status: 'not_started',
    }
    const r = await fetch('/api/checklists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    if (r.ok) {
      setQuick({ task_description: '', days_out: quick.days_out, league: quick.league, venue_id: quick.venue_id, due_date: '' })
      load()
    }
    setQuickSaving(false)
  }

  const filtered = daysFilter === 'all' ? items : items.filter(i => i.days_out === daysFilter)

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Checklists</h1>
            <p className="mt-1 text-sm text-zinc-500">30 / 60 / 90 day pre-season and maintenance tasks.</p>
          </div>
          <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium hover:bg-[#0840C0]">
            {showCreate ? 'Cancel' : '+ Add Task'}
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {['all', 'not_started', 'in_progress', 'done'].map(s => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded text-xs font-medium border ${filter === s ? 'bg-[#0A52EF] text-white border-[#0A52EF]' : 'bg-white text-zinc-600 border-[#E8E8E8]'}`}>
              {s.replace('_', ' ')}
            </button>
          ))}
          <span className="w-px h-6 bg-zinc-200 mx-1" />
          {['all', '30', '60', '90', 'other'].map(d => (
            <button key={d} onClick={() => setDaysFilter(d)}
              className={`px-3 py-1.5 rounded text-xs font-medium border ${daysFilter === d ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-[#E8E8E8]'}`}>
              {d === 'all' ? 'All days' : d === 'other' ? 'Other' : `${d} days out`}
            </button>
          ))}
        </div>

        {showCreate && (
          <div className="rounded-2xl border border-[#E8E8E8] bg-white p-5 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Venue</label>
                <select value={form.venue_id} onChange={e => setForm({ ...form, venue_id: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm">
                  <option value="">— None —</option>
                  {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Days Out</label>
                <select value={form.days_out} onChange={e => setForm({ ...form, days_out: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm">
                  {['30', '60', '90', 'other'].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">League</label>
                <select value={form.league} onChange={e => setForm({ ...form, league: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm">
                  <option value="">— None —</option>
                  {LEAGUES.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Team</label>
                <input value={form.team_name} onChange={e => setForm({ ...form, team_name: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-zinc-500 block mb-1">Task *</label>
                <input value={form.task_description} onChange={e => setForm({ ...form, task_description: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" placeholder="e.g. Check all LED modules for burn-in" />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-zinc-500 block mb-1">Instructions</label>
                <textarea value={form.prompt} onChange={e => setForm({ ...form, prompt: e.target.value })} rows={3} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" />
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Assignee</label>
                <select value={form.assignee_id} onChange={e => setForm({ ...form, assignee_id: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm">
                  <option value="">— Unassigned —</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500 block mb-1">Due Date</label>
                <input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" />
              </div>
            </div>
            <button onClick={submit} className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium">Create</button>
          </div>
        )}

        {/* Inline quick-add: type a task, pick days out, Enter → saved. */}
        <div className="rounded-2xl border border-[#E8E8E8] bg-white p-2.5 flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 pl-1">Quick add</span>
          <input
            value={quick.task_description}
            onChange={e => setQuick({ ...quick, task_description: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') quickSubmit() }}
            placeholder="What needs to be done? (press Enter)"
            className="flex-1 min-w-[200px] px-3 py-1.5 border border-[#E8E8E8] rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
            disabled={quickSaving}
          />
          <select value={quick.days_out} onChange={e => setQuick({ ...quick, days_out: e.target.value })} className="px-2 py-1.5 border border-[#E8E8E8] rounded-lg text-xs">
            <option value="30">30 days out</option>
            <option value="60">60 days out</option>
            <option value="90">90 days out</option>
            <option value="other">Other</option>
          </select>
          <select value={quick.league} onChange={e => setQuick({ ...quick, league: e.target.value })} className="px-2 py-1.5 border border-[#E8E8E8] rounded-lg text-xs">
            <option value="">League</option>
            {LEAGUES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={quick.venue_id} onChange={e => setQuick({ ...quick, venue_id: e.target.value })} className="px-2 py-1.5 border border-[#E8E8E8] rounded-lg text-xs max-w-[160px]">
            <option value="">Venue</option>
            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <input type="date" value={quick.due_date} onChange={e => setQuick({ ...quick, due_date: e.target.value })} className="px-2 py-1.5 border border-[#E8E8E8] rounded-lg text-xs" />
          <button onClick={quickSubmit} disabled={!quick.task_description.trim() || quickSaving}
            className="px-3 py-1.5 bg-[#0A52EF] text-white rounded-lg text-xs font-medium disabled:opacity-50">
            {quickSaving ? 'Saving…' : 'Add'}
          </button>
        </div>

        <div className="rounded-2xl border border-[#E8E8E8] bg-white overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-sm text-zinc-500">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-zinc-500">No tasks match.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                  <th className="px-5 py-3 text-left">Days Out</th>
                  <th className="px-5 py-3 text-left">League / Team</th>
                  <th className="px-5 py-3 text-left">Task</th>
                  <th className="px-5 py-3 text-left">Venue</th>
                  <th className="px-5 py-3 text-left">Assignee</th>
                  <th className="px-5 py-3 text-left">Due</th>
                  <th className="px-5 py-3 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(it => (
                  <tr key={it.id} className="border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="px-5 py-3 text-zinc-600 font-mono text-xs">{it.days_out}</td>
                    <td className="px-5 py-3 text-zinc-600">{[it.league, it.team_name].filter(Boolean).join(' — ') || '—'}</td>
                    <td className="px-5 py-3 font-medium text-zinc-900">{it.task_description}</td>
                    <td className="px-5 py-3 text-zinc-600">{it.venue_name || '—'}</td>
                    <td className="px-5 py-3 text-zinc-600">{it.assignee_name || '—'}</td>
                    <td className="px-5 py-3 text-zinc-500">{formatDate(it.due_date)}</td>
                    <td className="px-5 py-3">
                      <select value={it.status} onChange={e => updateStatus(it.id, e.target.value)}
                        className={`px-2 py-1 rounded-full text-xs font-medium border appearance-none pr-6 ${STATUS_STYLE[it.status]}`}>
                        {['not_started', 'in_progress', 'done'].map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
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
