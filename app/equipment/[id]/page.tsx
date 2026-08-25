'use client'

/**
 * One piece of equipment: the manual, the training video, the version it
 * should be on, the faults it is known for, and every venue running it.
 *
 * The install list is the point of the page. Publishing a new version here
 * immediately marks every unit behind it across the estate, which is the
 * question "who still needs updating before their season" reduced to one row.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuth } from '@/lib/useAuth'

const BLUE = '#0A52EF'

type Install = {
  id: string
  venue_id: string
  venue_name: string
  label: string
  ip_address: string | null
  installed_version: string | null
  software_status: 'current' | 'update_available' | 'no_target' | 'unknown'
}

type Issue = {
  id: string
  title: string
  symptom: string | null
  resolution: string | null
  created_by_name: string | null
  created_at: string
}

const TONE: Record<Install['software_status'], string> = {
  current: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  update_available: 'bg-amber-50 text-amber-700 border-amber-200',
  no_target: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  unknown: 'bg-zinc-100 text-zinc-500 border-zinc-200',
}
const LABEL: Record<Install['software_status'], string> = {
  current: 'Current',
  update_available: 'Behind',
  no_target: 'No target',
  unknown: 'Unknown',
}

export default function EquipmentDetailPage() {
  const params = useParams()
  const id = String(params.id)
  const auth = useAuth()

  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [issueForm, setIssueForm] = useState({ title: '', symptom: '', resolution: '' })
  const [addingIssue, setAddingIssue] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/equipment/${id}`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/equipment/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (res.ok) { setEditing(false); await load() }
    } finally { setSaving(false) }
  }

  const addIssue = async () => {
    if (!issueForm.title.trim()) return
    const res = await fetch(`/api/equipment/${id}/issues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(issueForm),
    })
    if (res.ok) { setIssueForm({ title: '', symptom: '', resolution: '' }); setAddingIssue(false); load() }
  }

  const removeIssue = async (issueId: string) => {
    const res = await fetch(`/api/equipment/${id}/issues`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issue_id: issueId }),
    })
    if (res.ok) load()
  }

  if (loading) return <DashboardLayout><p className="p-10 text-sm text-zinc-500">Loading…</p></DashboardLayout>
  if (!data) return <DashboardLayout><p className="p-10 text-sm text-zinc-500">Equipment not found.</p></DashboardLayout>

  const e = data.equipment
  const installs: Install[] = data.installs || []
  const issues: Issue[] = data.issues || []

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div>
          <Link href="/equipment" className="text-xs text-zinc-500 hover:text-zinc-900">← Equipment Library</Link>
          <div className="flex items-start justify-between gap-4 mt-2">
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">{e.manufacturer} {e.model}</h1>
              <p className="text-sm text-zinc-500 mt-1">
                {e.description || 'No description'} · installed at {new Set(installs.map((i) => i.venue_id)).size} venue
                {new Set(installs.map((i) => i.venue_id)).size === 1 ? '' : 's'}
                {data.behind > 0 && <span className="text-amber-700"> · {data.behind} unit{data.behind === 1 ? '' : 's'} behind</span>}
              </p>
            </div>
            {auth.isManager && !editing && (
              <button onClick={() => { setDraft({
                description: e.description || '', manual_url: e.manual_url || '',
                training_video_url: e.training_video_url || '', latest_version: e.latest_version || '',
                latest_version_note: e.latest_version_note || '',
              }); setEditing(true) }}
                className="px-4 py-2 border border-[#E8E8E8] rounded text-sm font-medium text-zinc-700 hover:border-zinc-300">
                Edit
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-5">
          {editing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {([
                ['latest_version', 'Current version', 'e.g. 4.2'],
                ['latest_version_note', 'Version note', 'What changed'],
                ['manual_url', 'Manual link', 'https://…'],
                ['training_video_url', 'Training video link', 'https://…'],
                ['description', 'Description', ''],
              ] as const).map(([key, label, placeholder]) => (
                <label key={key} className="block">
                  <span className="text-[11px] text-zinc-500 font-medium">{label}</span>
                  <input value={draft[key] || ''} placeholder={placeholder}
                    onChange={(ev) => setDraft((d) => ({ ...d, [key]: ev.target.value }))}
                    className="mt-1 w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30" />
                </label>
              ))}
              <div className="md:col-span-2 flex gap-2">
                <button onClick={save} disabled={saving}
                  className="px-4 py-2 text-white rounded text-xs font-medium disabled:opacity-50" style={{ background: BLUE }}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditing(false)}
                  className="px-4 py-2 text-xs font-medium text-zinc-600 border border-[#E8E8E8] rounded">Cancel</button>
              </div>
              <p className="md:col-span-2 text-[11px] text-zinc-400">
                Publishing a version here marks every unit that is not on it, at every venue.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-[11px] text-zinc-500 font-medium">Current version</p>
                <p className="text-zinc-900 mt-0.5">{e.latest_version || <span className="text-zinc-400">Not set</span>}</p>
                {e.latest_version_note && <p className="text-[11px] text-zinc-500 mt-0.5">{e.latest_version_note}</p>}
              </div>
              <div>
                <p className="text-[11px] text-zinc-500 font-medium">Manual</p>
                {e.manual_url
                  ? <a href={e.manual_url} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: BLUE }}>Open</a>
                  : <p className="text-zinc-400 mt-0.5">Not on file</p>}
              </div>
              <div>
                <p className="text-[11px] text-zinc-500 font-medium">Training video</p>
                {e.training_video_url
                  ? <a href={e.training_video_url} target="_blank" rel="noreferrer" className="hover:underline" style={{ color: BLUE }}>Watch</a>
                  : <p className="text-zinc-400 mt-0.5">Not on file</p>}
              </div>
              <div>
                <p className="text-[11px] text-zinc-500 font-medium">Category</p>
                <p className="text-zinc-900 mt-0.5 capitalize">{String(e.category || '').replace(/_/g, ' ')}</p>
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded border border-[#E8E8E8] shadow-sm">
          <div className="px-5 py-3 border-b border-[#E8E8E8] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Known issues</h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">Shown on every venue running this gear</p>
            </div>
            {auth.isManager && !addingIssue && (
              <button onClick={() => setAddingIssue(true)} className="text-xs font-medium" style={{ color: BLUE }}>+ Add</button>
            )}
          </div>
          <div className="p-5">
            {addingIssue && (
              <div className="space-y-2 mb-4 pb-4 border-b border-[#E8E8E8]">
                <input value={issueForm.title} onChange={(ev) => setIssueForm((f) => ({ ...f, title: ev.target.value }))}
                  placeholder="What goes wrong"
                  className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" />
                <textarea value={issueForm.symptom} onChange={(ev) => setIssueForm((f) => ({ ...f, symptom: ev.target.value }))}
                  placeholder="What it looks like" rows={2}
                  className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" />
                <textarea value={issueForm.resolution} onChange={(ev) => setIssueForm((f) => ({ ...f, resolution: ev.target.value }))}
                  placeholder="How it gets fixed" rows={2}
                  className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" />
                <div className="flex gap-2">
                  <button onClick={addIssue} disabled={!issueForm.title.trim()}
                    className="px-3 py-1.5 text-white rounded text-xs font-medium disabled:opacity-50" style={{ background: BLUE }}>Save</button>
                  <button onClick={() => setAddingIssue(false)} className="px-3 py-1.5 text-xs text-zinc-600 border border-[#E8E8E8] rounded">Cancel</button>
                </div>
              </div>
            )}
            {issues.length === 0 && !addingIssue ? (
              <p className="text-sm text-zinc-400 text-center py-6">Nothing recorded for this model yet.</p>
            ) : (
              <ul className="space-y-3">
                {issues.map((i) => (
                  <li key={i.id} className="group">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-zinc-900">{i.title}</p>
                      {auth.isManager && (
                        <button onClick={() => removeIssue(i.id)}
                          className="text-[11px] text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-red-600">Remove</button>
                      )}
                    </div>
                    {i.symptom && <p className="text-xs text-zinc-600 mt-0.5">{i.symptom}</p>}
                    {i.resolution && <p className="text-xs text-emerald-700 mt-0.5">Fix: {i.resolution}</p>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-[#E8E8E8]">
            <h3 className="text-sm font-semibold text-zinc-900">Where it is installed</h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">{installs.length} unit{installs.length === 1 ? '' : 's'}</p>
          </div>
          {installs.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-10">Not recorded at any venue yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-zinc-50">
                <tr className="text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                  <th className="px-4 py-2.5">Venue</th>
                  <th className="px-4 py-2.5">Unit</th>
                  <th className="px-4 py-2.5">IP</th>
                  <th className="px-4 py-2.5">Installed</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {installs.map((i) => (
                  <tr key={i.id} className="border-t border-[#F4F4F4] hover:bg-zinc-50/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/venues/${i.venue_id}`} className="hover:underline" style={{ color: BLUE }}>{i.venue_name}</Link>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-900">{i.label}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-600">{i.ip_address || '—'}</td>
                    <td className="px-4 py-2.5 text-zinc-600">{i.installed_version || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${TONE[i.software_status]}`}>
                        {LABEL[i.software_status]}
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
