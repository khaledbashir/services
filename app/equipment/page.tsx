'use client'

/**
 * The shared equipment library.
 *
 * Steve Solomson, 2026-08-25: "Equipment has its own record: manual, training
 * video, common issues. Venues link to equipment rather than duplicating docs
 * — update the manual once, every venue referencing it updates automatically."
 *
 * This is that list. The number that matters on each row is how many venues
 * run the gear, because that is the blast radius of a manual being wrong.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuth } from '@/lib/useAuth'

const BLUE = '#0A52EF'

type EquipmentRow = {
  id: string
  category: string
  manufacturer: string
  model: string
  description: string | null
  manual_url: string | null
  training_video_url: string | null
  latest_version: string | null
  install_count: number
  venue_count: number
  issue_count: number
  document_count: number
}

const CATEGORIES = [
  'processor', 'sender', 'receiver', 'led_display', 'switcher',
  'server', 'network', 'audio', 'other',
]

const pretty = (c: string) => c.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())

export default function EquipmentLibraryPage() {
  const auth = useAuth()
  const [rows, setRows] = useState<EquipmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({ category: 'processor' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/equipment')
      if (res.ok) setRows((await res.json()).equipment || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const create = async () => {
    if (!form.manufacturer?.trim() || !form.model?.trim()) return
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/equipment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not save'); return }
      if (data.existed) setError('That make and model was already in the library — opening the existing record.')
      setAdding(false)
      setForm({ category: 'processor' })
      await load()
    } finally { setSaving(false) }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (category !== 'all' && r.category !== category) return false
      if (!q) return true
      return `${r.manufacturer} ${r.model} ${r.description || ''}`.toLowerCase().includes(q)
    })
  }, [rows, search, category])

  const totals = useMemo(() => ({
    models: rows.length,
    installs: rows.reduce((s, r) => s + (r.install_count || 0), 0),
    withManual: rows.filter((r) => r.manual_url).length,
  }), [rows])

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Equipment Library</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {totals.models} models · {totals.installs} installed across the estate · {totals.withManual} with a manual on file
            </p>
          </div>
          {auth.isManager && (
            <button onClick={() => setAdding(!adding)}
              className="px-4 py-2 text-white rounded text-sm font-medium" style={{ background: BLUE }}>
              {adding ? 'Cancel' : '+ Add equipment'}
            </button>
          )}
        </div>

        {adding && (
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {([
                ['manufacturer', 'Manufacturer *', 'e.g. NovaStar'],
                ['model', 'Model *', 'e.g. MCTRL4K'],
                ['latest_version', 'Current version', 'e.g. 4.2'],
                ['manual_url', 'Manual link', 'https://…'],
                ['training_video_url', 'Training video link', 'https://…'],
              ] as const).map(([key, label, placeholder]) => (
                <label key={key} className="block">
                  <span className="text-[11px] text-zinc-500 font-medium">{label}</span>
                  <input value={form[key] || ''} placeholder={placeholder}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30" />
                </label>
              ))}
              <label className="block">
                <span className="text-[11px] text-zinc-500 font-medium">Category</span>
                <select value={form.category || 'processor'}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm bg-white">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}
                </select>
              </label>
              <label className="block md:col-span-3">
                <span className="text-[11px] text-zinc-500 font-medium">Description</span>
                <input value={form.description || ''}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30" />
              </label>
            </div>
            {error && <p className="text-xs text-amber-700 mt-2">{error}</p>}
            <button onClick={create} disabled={saving || !form.manufacturer?.trim() || !form.model?.trim()}
              className="mt-4 px-4 py-2 text-white rounded text-xs font-medium disabled:opacity-50" style={{ background: BLUE }}>
              {saving ? 'Saving…' : 'Add to library'}
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search make, model or description"
            className="flex-1 min-w-56 px-3 py-2 border border-[#E8E8E8] rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30" />
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="px-3 py-2 border border-[#E8E8E8] rounded text-sm bg-white">
            <option value="all">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{pretty(c)}</option>)}
          </select>
        </div>

        <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
          {loading ? (
            <p className="text-sm text-zinc-500 p-10 text-center">Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-medium text-zinc-500">
                {rows.length === 0 ? 'The library is empty' : 'Nothing matches that filter'}
              </p>
              <p className="text-xs text-zinc-400 mt-1">
                {rows.length === 0
                  ? 'Add the gear ANC installs — the manual and training video go on the model once and reach every venue running it.'
                  : 'Try a different search or category.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50">
                <tr className="text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5">Equipment</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5">Current version</th>
                  <th className="px-4 py-2.5 text-right">Venues</th>
                  <th className="px-4 py-2.5 text-right">Units</th>
                  <th className="px-4 py-2.5">Resources</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t border-[#F4F4F4] hover:bg-zinc-50/60">
                    <td className="px-4 py-3">
                      <Link href={`/equipment/${r.id}`} className="font-medium hover:underline" style={{ color: BLUE }}>
                        {r.manufacturer} {r.model}
                      </Link>
                      {r.description && <p className="text-[11px] text-zinc-500 mt-0.5">{r.description}</p>}
                      {r.issue_count > 0 && (
                        <p className="text-[11px] text-amber-700 mt-0.5">{r.issue_count} known issue{r.issue_count === 1 ? '' : 's'}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{pretty(r.category)}</td>
                    <td className="px-4 py-3 text-zinc-600">{r.latest_version || <span className="text-zinc-300">—</span>}</td>
                    <td className="px-4 py-3 text-right text-zinc-900">{r.venue_count}</td>
                    <td className="px-4 py-3 text-right text-zinc-600">{r.install_count}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {r.manual_url && <a href={r.manual_url} target="_blank" rel="noreferrer" className="text-xs hover:underline" style={{ color: BLUE }}>Manual</a>}
                        {r.training_video_url && <a href={r.training_video_url} target="_blank" rel="noreferrer" className="text-xs hover:underline" style={{ color: BLUE }}>Video</a>}
                        {r.document_count > 0 && <span className="text-xs text-zinc-500">{r.document_count} file{r.document_count === 1 ? '' : 's'}</span>}
                        {!r.manual_url && !r.training_video_url && !r.document_count && <span className="text-xs text-zinc-300">—</span>}
                      </div>
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
