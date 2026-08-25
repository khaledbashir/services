'use client'

/**
 * Venue Reference — the tabs Steve Solomson's 2026-08-25 outline asks for.
 *
 * Overview, Hardware, Software, Drawings and Nova Mapping. Each fetches its
 * own data on mount rather than widening the venue page's already large state,
 * so a tab nobody opens costs nothing and the page stays readable.
 *
 * The house style of the venue page is carried over deliberately: white cards,
 * #E8E8E8 hairlines, ANC blue for the one thing that matters on each screen.
 * A reference page that looks like a different product is a page techs think
 * they are not allowed to edit.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'

const BLUE = '#0A52EF'

type SoftwareStatus = 'current' | 'update_available' | 'no_target' | 'unknown'
type VersionStatus = 'up_to_date' | 'update_due' | 'overdue' | 'unknown'

export type VenueEquipment = {
  id: string
  equipment_id: string | null
  label: string
  ip_address: string | null
  serial_number: string | null
  installed_version: string | null
  firmware_version: string | null
  rack_name: string | null
  rack_position: string | null
  location_note: string | null
  install_date: string | null
  status: string
  notes: string | null
  manufacturer: string | null
  model: string | null
  category: string | null
  manual_url: string | null
  training_video_url: string | null
  latest_version: string | null
  latest_version_note: string | null
  known_issue_count: number
  software_status: SoftwareStatus
  updated_by_name: string | null
  updated_at: string
}

type VenueDocument = {
  id: string
  filename: string
  original_name: string
  file_type: string
  description: string | null
  created_at: string
  is_shared?: boolean
  shared_from?: string | null
}

const SOFTWARE_LABEL: Record<SoftwareStatus, string> = {
  current: 'Current',
  update_available: 'Update available',
  no_target: 'No target set',
  unknown: 'Version unknown',
}

const SOFTWARE_TONE: Record<SoftwareStatus, string> = {
  current: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  update_available: 'bg-amber-50 text-amber-700 border-amber-200',
  no_target: 'bg-zinc-100 text-zinc-500 border-zinc-200',
  unknown: 'bg-zinc-100 text-zinc-500 border-zinc-200',
}

export const VERSION_TONE: Record<VersionStatus, string> = {
  up_to_date: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  update_due: 'bg-amber-50 text-amber-700 border-amber-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
  unknown: 'bg-zinc-100 text-zinc-500 border-zinc-200',
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${tone}`}>
      {children}
    </span>
  )
}

function Card({ title, subtitle, action, children }: {
  title?: string
  subtitle?: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded border border-[#E8E8E8] shadow-sm">
      {(title || action) && (
        <div className="px-5 py-3 border-b border-[#E8E8E8] flex items-center justify-between gap-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>}
            {subtitle && <p className="text-[11px] text-zinc-500 mt-0.5">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  )
}

function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="text-center py-10">
      <p className="text-sm text-zinc-500">{title}</p>
      {hint && <p className="text-xs text-zinc-400 mt-1">{hint}</p>}
    </div>
  )
}

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

// ---------------------------------------------------------------------------
// Overview — the splash screen
// ---------------------------------------------------------------------------

type ReferencePayload = {
  venue: Record<string, any>
  version_status: VersionStatus
  version_status_label: string
  rack_document: VenueDocument | null
  signal_map_document: VenueDocument | null
  counts: { equipment: number; behind: number; documents: number; drawings: number; open_tickets: number }
  venue_issues: Array<{ id: string; title: string; symptom: string | null; resolution: string | null }>
  hardware_issues: Array<{ id: string; title: string; symptom: string | null; resolution: string | null; manufacturer: string; model: string }>
  last_reviewed_at: string | null
}

export function VenueOverviewTab({ venueId, isManager, onJump }: {
  venueId: string
  isManager: boolean
  onJump: (tab: string) => void
}) {
  const [data, setData] = useState<ReferencePayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/venues/${venueId}/reference`)
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [venueId])

  useEffect(() => { load() }, [load])

  const startEdit = () => {
    const v = data?.venue || {}
    setDraft({
      sport: v.sport || '',
      season_start_date: (v.season_start_date || '').slice(0, 10),
      cms_version: v.cms_version || '',
      led_firmware_version: v.led_firmware_version || '',
      contract_status: v.contract_status || '',
      contract_expires_on: (v.contract_expires_on || '').slice(0, 10),
      livesync_license_status: v.livesync_license_status || '',
      livesync_license_expires_on: (v.livesync_license_expires_on || '').slice(0, 10),
    })
    setEditing(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/venues/${venueId}/reference`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (res.ok) { setEditing(false); await load() }
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Empty title="Loading venue reference…" />
  if (!data) return <Empty title="Could not load the venue reference" />

  const v = data.venue
  const statusBadge = (label: string | null) => {
    const l = (label || '').toLowerCase()
    if (l === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    if (l.includes('expir')) return 'bg-amber-50 text-amber-700 border-amber-200'
    if (l === 'lapsed' || l === 'expired') return 'bg-red-50 text-red-700 border-red-200'
    return 'bg-zinc-100 text-zinc-500 border-zinc-200'
  }

  return (
    <div className="space-y-6">
      {/* Contract and licence sit at the very top: a lapsed one can be the
          actual cause of the fault being reported, and support should see it
          before they start troubleshooting rather than after. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-4">
          <p className="text-[11px] text-zinc-500 font-medium">Season readiness</p>
          <div className="mt-1.5"><Badge tone={VERSION_TONE[data.version_status]}>{data.version_status_label}</Badge></div>
        </div>
        <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-4">
          <p className="text-[11px] text-zinc-500 font-medium">Contract</p>
          <div className="mt-1.5">
            <Badge tone={statusBadge(v.contract_status)}>{v.contract_status || 'Not recorded'}</Badge>
          </div>
          {v.contract_expires_on && <p className="text-[11px] text-zinc-400 mt-1">to {fmt(v.contract_expires_on)}</p>}
        </div>
        <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-4">
          <p className="text-[11px] text-zinc-500 font-medium">Live Sync licence</p>
          <div className="mt-1.5">
            <Badge tone={statusBadge(v.livesync_license_status)}>{v.livesync_license_status || 'Not recorded'}</Badge>
          </div>
          {v.livesync_license_expires_on && <p className="text-[11px] text-zinc-400 mt-1">to {fmt(v.livesync_license_expires_on)}</p>}
        </div>
        <button onClick={() => onJump('hardware')} className="bg-white rounded border border-[#E8E8E8] shadow-sm p-4 text-left hover:border-zinc-300 transition-colors">
          <p className="text-[11px] text-zinc-500 font-medium">Equipment</p>
          <p className="text-xl font-semibold text-zinc-900 mt-0.5">{data.counts.equipment}</p>
          {data.counts.behind > 0 && <p className="text-[11px] text-amber-700 mt-0.5">{data.counts.behind} behind</p>}
        </button>
        <button onClick={() => onJump('tickets')} className="bg-white rounded border border-[#E8E8E8] shadow-sm p-4 text-left hover:border-zinc-300 transition-colors">
          <p className="text-[11px] text-zinc-500 font-medium">Open tickets</p>
          <p className="text-xl font-semibold text-zinc-900 mt-0.5">{data.counts.open_tickets}</p>
        </button>
      </div>

      <Card
        title="Venue reference"
        subtitle={data.last_reviewed_at ? `Last change ${fmt(data.last_reviewed_at)}` : 'No changes recorded yet'}
        action={isManager && !editing ? (
          <button onClick={startEdit} className="px-3 py-1.5 border border-[#E8E8E8] rounded text-xs font-medium text-zinc-700 hover:border-zinc-300 transition-colors">
            Edit
          </button>
        ) : null}
      >
        {editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {([
              ['sport', 'Sport / league', 'text', 'e.g. NFL'],
              ['season_start_date', 'Season starts', 'date', ''],
              ['cms_version', 'CMS version', 'text', 'e.g. 4.2'],
              ['led_firmware_version', 'LED firmware', 'text', 'e.g. 3.10'],
              ['contract_status', 'Contract status', 'text', 'Active / Expiring / Lapsed'],
              ['contract_expires_on', 'Contract expires', 'date', ''],
              ['livesync_license_status', 'Live Sync licence', 'text', 'Active / Expiring / Lapsed'],
              ['livesync_license_expires_on', 'Licence expires', 'date', ''],
            ] as const).map(([key, label, type, placeholder]) => (
              <label key={key} className="block">
                <span className="text-[11px] text-zinc-500 font-medium">{label}</span>
                <input
                  type={type}
                  value={draft[key] || ''}
                  placeholder={placeholder}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
                />
              </label>
            ))}
            <div className="md:col-span-2 flex gap-2 pt-1">
              <button onClick={save} disabled={saving}
                className="px-4 py-2 text-white rounded text-xs font-medium disabled:opacity-50" style={{ background: BLUE }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} disabled={saving}
                className="px-4 py-2 text-xs font-medium text-zinc-600 border border-[#E8E8E8] rounded hover:border-zinc-300">
                Cancel
              </button>
            </div>
            <p className="md:col-span-2 text-[11px] text-zinc-400">
              Saving a CMS or firmware version records who confirmed it and when — that is what the season-readiness badge reads.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <Field label="Sport" value={v.sport} />
            <Field label="Season starts" value={v.season_start_date ? fmt(v.season_start_date) : null} />
            <Field label="CMS version" value={v.cms_version} />
            <Field label="LED firmware" value={v.led_firmware_version} />
            <Field label="Versions confirmed" value={v.versions_updated_at ? fmt(v.versions_updated_at) : null} />
            <Field label="Venue manager" value={v.venue_manager_name} />
            <Field label="Lead field rep" value={v.lead_field_rep_name} />
            <Field label="Market" value={v.market_name} />
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="Rack diagram" subtitle="Set on the Drawings tab" action={
          <button onClick={() => onJump('drawings')} className="text-xs font-medium" style={{ color: BLUE }}>Open</button>
        }>
          {data.rack_document
            ? <DocPreview doc={data.rack_document} />
            : <Empty title="No rack diagram set" hint="Upload one on the Drawings tab and pin it here." />}
        </Card>
        <Card title="Signal map" subtitle="Processor through to the wall" action={
          <button onClick={() => onJump('drawings')} className="text-xs font-medium" style={{ color: BLUE }}>Open</button>
        }>
          {data.signal_map_document
            ? <DocPreview doc={data.signal_map_document} />
            : <Empty title="No signal map set" hint="Upload one on the Drawings tab and pin it here." />}
        </Card>
      </div>

      <IssuesPanel
        venueId={venueId}
        isManager={isManager}
        venueIssues={data.venue_issues}
        hardwareIssues={data.hardware_issues}
        onChanged={load}
      />
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-[11px] text-zinc-500 font-medium">{label}</p>
      <p className="text-zinc-900 mt-0.5">{value || <span className="text-zinc-400">—</span>}</p>
    </div>
  )
}

const isImage = (name: string) => /\.(png|jpe?g|webp|gif|svg)$/i.test(name || '')

function DocPreview({ doc }: { doc: VenueDocument }) {
  return (
    <a href={doc.filename} target="_blank" rel="noreferrer" className="block group">
      {isImage(doc.original_name) ? (
        <img src={doc.filename} alt={doc.original_name}
          className="w-full max-h-64 object-contain rounded border border-[#E8E8E8] bg-zinc-50" />
      ) : (
        <div className="rounded border border-[#E8E8E8] bg-zinc-50 py-8 text-center">
          <p className="text-sm text-zinc-600 group-hover:underline">{doc.original_name}</p>
        </div>
      )}
      <p className="text-[11px] text-zinc-400 mt-1.5">{doc.original_name} · {fmt(doc.created_at)}</p>
    </a>
  )
}

// ---------------------------------------------------------------------------
// Common issues — venue-specific and hardware-generic, side by side
// ---------------------------------------------------------------------------

function IssuesPanel({ venueId, isManager, venueIssues, hardwareIssues, onChanged }: {
  venueId: string
  isManager: boolean
  venueIssues: ReferencePayload['venue_issues']
  hardwareIssues: ReferencePayload['hardware_issues']
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', symptom: '', resolution: '' })
  const [saving, setSaving] = useState(false)

  const add = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/venues/${venueId}/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        setForm({ title: '', symptom: '', resolution: '' })
        setAdding(false)
        onChanged()
      }
    } finally {
      setSaving(false)
    }
  }

  const remove = async (id: string) => {
    const res = await fetch(`/api/venues/${venueId}/issues`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issue_id: id }),
    })
    if (res.ok) onChanged()
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card
        title="Venue-specific issues"
        subtitle="Quirks that belong to this building"
        action={isManager && !adding ? (
          <button onClick={() => setAdding(true)} className="text-xs font-medium" style={{ color: BLUE }}>+ Add</button>
        ) : null}
      >
        {adding && (
          <div className="space-y-2 mb-4 pb-4 border-b border-[#E8E8E8]">
            <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="What goes wrong"
              className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30" />
            <textarea value={form.symptom} onChange={(e) => setForm((f) => ({ ...f, symptom: e.target.value }))}
              placeholder="What it looks like" rows={2}
              className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30" />
            <textarea value={form.resolution} onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value }))}
              placeholder="How it gets fixed" rows={2}
              className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30" />
            <div className="flex gap-2">
              <button onClick={add} disabled={saving || !form.title.trim()}
                className="px-3 py-1.5 text-white rounded text-xs font-medium disabled:opacity-50" style={{ background: BLUE }}>
                {saving ? 'Saving…' : 'Save issue'}
              </button>
              <button onClick={() => setAdding(false)} className="px-3 py-1.5 text-xs text-zinc-600 border border-[#E8E8E8] rounded">Cancel</button>
            </div>
          </div>
        )}
        {venueIssues.length === 0 && !adding
          ? <Empty title="Nothing recorded yet" hint="The quirks that only happen here." />
          : (
            <ul className="space-y-3">
              {venueIssues.map((i) => (
                <li key={i.id} className="group">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-900">{i.title}</p>
                    {isManager && (
                      <button onClick={() => remove(i.id)}
                        className="text-[11px] text-zinc-400 opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity">
                        Remove
                      </button>
                    )}
                  </div>
                  {i.symptom && <p className="text-xs text-zinc-600 mt-0.5">{i.symptom}</p>}
                  {i.resolution && <p className="text-xs text-emerald-700 mt-0.5">Fix: {i.resolution}</p>}
                </li>
              ))}
            </ul>
          )}
      </Card>

      <Card title="Known hardware issues" subtitle="From the gear installed here — shared with every venue running it">
        {hardwareIssues.length === 0
          ? <Empty title="Nothing recorded yet" hint="Add these on the equipment record so every venue sees them." />
          : (
            <ul className="space-y-3">
              {hardwareIssues.map((i) => (
                <li key={i.id}>
                  <p className="text-sm font-medium text-zinc-900">{i.title}</p>
                  <p className="text-[11px] text-zinc-500">{i.manufacturer} {i.model}</p>
                  {i.symptom && <p className="text-xs text-zinc-600 mt-0.5">{i.symptom}</p>}
                  {i.resolution && <p className="text-xs text-emerald-700 mt-0.5">Fix: {i.resolution}</p>}
                </li>
              ))}
            </ul>
          )}
      </Card>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Hardware — the full equipment list
// ---------------------------------------------------------------------------

export function VenueHardwareTab({ venueId, isManager }: { venueId: string; isManager: boolean }) {
  const [rows, setRows] = useState<VenueEquipment[]>([])
  const [counts, setCounts] = useState({ total: 0, behind: 0, unknown_version: 0, unlinked: 0 })
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/venues/${venueId}/equipment`)
      if (res.ok) {
        const d = await res.json()
        setRows(d.equipment || [])
        setCounts(d.counts || counts)
      }
    } finally { setLoading(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId])

  useEffect(() => { load() }, [load])

  const blank = {
    label: '', manufacturer: '', model: '', category: 'processor', ip_address: '',
    serial_number: '', installed_version: '', rack_name: '', rack_position: '',
    location_note: '', install_date: '', notes: '',
  }

  const submit = async () => {
    if (!form.label?.trim()) return
    setSaving(true)
    try {
      const url = editingId ? `/api/venue-equipment/${editingId}` : `/api/venues/${venueId}/equipment`
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) { setAdding(false); setEditingId(null); setForm({}); await load() }
    } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    const res = await fetch(`/api/venue-equipment/${id}`, { method: 'DELETE' })
    if (res.ok) load()
  }

  const grouped = useMemo(() => {
    const map = new Map<string, VenueEquipment[]>()
    for (const r of rows) {
      const key = r.rack_name || 'Unracked'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(r)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [rows])

  if (loading) return <Empty title="Loading equipment…" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">
          {counts.total} {counts.total === 1 ? 'unit' : 'units'}
          {counts.behind > 0 && <span className="text-amber-700"> · {counts.behind} behind on version</span>}
          {counts.unlinked > 0 && <span className="text-zinc-400"> · {counts.unlinked} not linked to the library</span>}
        </p>
        {isManager && !adding && !editingId && (
          <button onClick={() => { setForm(blank); setAdding(true) }}
            className="px-3 py-1.5 text-white rounded text-xs font-medium" style={{ background: BLUE }}>
            + Add equipment
          </button>
        )}
      </div>

      {(adding || editingId) && (
        <Card title={editingId ? 'Edit equipment' : 'Add equipment'}
          subtitle="Naming a make and model links it to the shared library, or creates the entry if it is new.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {([
              ['label', 'Label *', 'e.g. Main processor'],
              ['manufacturer', 'Manufacturer', 'e.g. NovaStar'],
              ['model', 'Model', 'e.g. MCTRL4K'],
              ['ip_address', 'IP address', '10.0.4.21'],
              ['serial_number', 'Serial number', ''],
              ['installed_version', 'Installed version', 'e.g. 4.2'],
              ['rack_name', 'Rack', 'e.g. Control room A'],
              ['rack_position', 'Position', 'e.g. U12'],
              ['location_note', 'Location note', ''],
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
                className="mt-1 w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30">
                {['processor', 'sender', 'receiver', 'led_display', 'switcher', 'server', 'network', 'audio', 'other'].map((c) => (
                  <option key={c} value={c}>{c.replace('_', ' ')}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] text-zinc-500 font-medium">Install date</span>
              <input type="date" value={form.install_date || ''}
                onChange={(e) => setForm((f) => ({ ...f, install_date: e.target.value }))}
                className="mt-1 w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30" />
            </label>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={submit} disabled={saving || !form.label?.trim()}
              className="px-4 py-2 text-white rounded text-xs font-medium disabled:opacity-50" style={{ background: BLUE }}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add equipment'}
            </button>
            <button onClick={() => { setAdding(false); setEditingId(null); setForm({}) }}
              className="px-4 py-2 text-xs font-medium text-zinc-600 border border-[#E8E8E8] rounded hover:border-zinc-300">
              Cancel
            </button>
          </div>
        </Card>
      )}

      {rows.length === 0 && !adding ? (
        <Card>
          <Empty
            title="No equipment recorded for this venue"
            hint="Processors, senders, receivers, servers — anything a tech would need the address or serial for."
          />
        </Card>
      ) : (
        grouped.map(([rack, items]) => (
          <Card key={rack} title={rack} subtitle={`${items.length} ${items.length === 1 ? 'unit' : 'units'}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider border-b border-[#E8E8E8]">
                    <th className="pb-2 pr-3">Unit</th>
                    <th className="pb-2 pr-3">Make / model</th>
                    <th className="pb-2 pr-3">IP</th>
                    <th className="pb-2 pr-3">Serial</th>
                    <th className="pb-2 pr-3">Version</th>
                    <th className="pb-2 pr-3">Docs</th>
                    {isManager && <th className="pb-2" />}
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.id} className="border-b border-[#F4F4F4] last:border-0 group">
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-zinc-900">{r.label}</p>
                        {r.rack_position && <p className="text-[11px] text-zinc-400">{r.rack_position}</p>}
                      </td>
                      <td className="py-2.5 pr-3">
                        {r.equipment_id ? (
                          <Link href={`/equipment/${r.equipment_id}`} className="hover:underline" style={{ color: BLUE }}>
                            {r.manufacturer} {r.model}
                          </Link>
                        ) : <span className="text-zinc-400">Not linked</span>}
                        {r.known_issue_count > 0 && (
                          <p className="text-[11px] text-amber-700">{r.known_issue_count} known issue{r.known_issue_count === 1 ? '' : 's'}</p>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-zinc-700">{r.ip_address || '—'}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-zinc-700">{r.serial_number || '—'}</td>
                      <td className="py-2.5 pr-3">
                        <span className="text-zinc-900">{r.installed_version || '—'}</span>
                        {r.software_status === 'update_available' && (
                          <span className="ml-2"><Badge tone={SOFTWARE_TONE.update_available}>{r.latest_version}</Badge></span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex gap-2">
                          {r.manual_url && <a href={r.manual_url} target="_blank" rel="noreferrer" className="text-xs hover:underline" style={{ color: BLUE }}>Manual</a>}
                          {r.training_video_url && <a href={r.training_video_url} target="_blank" rel="noreferrer" className="text-xs hover:underline" style={{ color: BLUE }}>Video</a>}
                          {!r.manual_url && !r.training_video_url && <span className="text-zinc-300 text-xs">—</span>}
                        </div>
                      </td>
                      {isManager && (
                        <td className="py-2.5 text-right whitespace-nowrap">
                          <button
                            onClick={() => {
                              setEditingId(r.id)
                              setForm({
                                label: r.label, ip_address: r.ip_address || '', serial_number: r.serial_number || '',
                                installed_version: r.installed_version || '', rack_name: r.rack_name || '',
                                rack_position: r.rack_position || '', location_note: r.location_note || '',
                                install_date: (r.install_date || '').slice(0, 10), notes: r.notes || '',
                              })
                            }}
                            className="text-[11px] text-zinc-500 hover:text-zinc-900 opacity-0 group-hover:opacity-100 transition-opacity">
                            Edit
                          </button>
                          <button onClick={() => remove(r.id)}
                            className="ml-3 text-[11px] text-zinc-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                            Remove
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Software — installed against latest, per unit
// ---------------------------------------------------------------------------

export function VenueSoftwareTab({ venueId, isManager }: { venueId: string; isManager: boolean }) {
  const [rows, setRows] = useState<VenueEquipment[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/venues/${venueId}/equipment`)
      if (res.ok) setRows((await res.json()).equipment || [])
    } finally { setLoading(false) }
  }, [venueId])

  useEffect(() => { load() }, [load])

  const saveVersion = async (id: string) => {
    const value = editing[id]
    if (value === undefined) return
    setSavingId(id)
    try {
      const res = await fetch(`/api/venue-equipment/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installed_version: value }),
      })
      if (res.ok) {
        setEditing((e) => { const n = { ...e }; delete n[id]; return n })
        await load()
      }
    } finally { setSavingId(null) }
  }

  if (loading) return <Empty title="Loading software versions…" />

  const behind = rows.filter((r) => r.software_status === 'update_available')

  return (
    <div className="space-y-4">
      {behind.length > 0 && (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-medium text-amber-900">
            {behind.length} {behind.length === 1 ? 'unit is' : 'units are'} behind the version published for their model
          </p>
          <p className="text-xs text-amber-800 mt-0.5">{behind.map((b) => b.label).join(', ')}</p>
        </div>
      )}

      <Card title="Installed versions" subtitle="Against the version published on each model in the shared library">
        {rows.length === 0 ? (
          <Empty title="No equipment recorded yet" hint="Add it on the Hardware tab and versions appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold text-zinc-500 uppercase tracking-wider border-b border-[#E8E8E8]">
                  <th className="pb-2 pr-3">Unit</th>
                  <th className="pb-2 pr-3">Make / model</th>
                  <th className="pb-2 pr-3">Installed</th>
                  <th className="pb-2 pr-3">Latest</th>
                  <th className="pb-2 pr-3">Status</th>
                  <th className="pb-2">Last confirmed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-[#F4F4F4] last:border-0">
                    <td className="py-2.5 pr-3 font-medium text-zinc-900">{r.label}</td>
                    <td className="py-2.5 pr-3 text-zinc-600">
                      {r.manufacturer ? `${r.manufacturer} ${r.model}` : <span className="text-zinc-400">Not linked</span>}
                    </td>
                    <td className="py-2.5 pr-3">
                      {isManager ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            value={editing[r.id] ?? (r.installed_version || '')}
                            onChange={(e) => setEditing((s) => ({ ...s, [r.id]: e.target.value }))}
                            placeholder="—"
                            className="w-24 px-2 py-1 border border-[#E8E8E8] rounded text-xs focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30" />
                          {editing[r.id] !== undefined && editing[r.id] !== (r.installed_version || '') && (
                            <button onClick={() => saveVersion(r.id)} disabled={savingId === r.id}
                              className="text-[11px] font-medium disabled:opacity-50" style={{ color: BLUE }}>
                              {savingId === r.id ? '…' : 'Save'}
                            </button>
                          )}
                        </div>
                      ) : (r.installed_version || '—')}
                    </td>
                    <td className="py-2.5 pr-3 text-zinc-600">{r.latest_version || '—'}</td>
                    <td className="py-2.5 pr-3"><Badge tone={SOFTWARE_TONE[r.software_status]}>{SOFTWARE_LABEL[r.software_status]}</Badge></td>
                    <td className="py-2.5 text-[11px] text-zinc-500">
                      {fmt(r.updated_at)}{r.updated_by_name ? ` · ${r.updated_by_name}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-[11px] text-zinc-400 px-1">
        Closing a ticket that says what was upgraded writes the new version here automatically.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Drawings — signal flow, rack elevations, rack photos, with hotspots
// ---------------------------------------------------------------------------

type Hotspot = {
  id: string
  document_id: string
  venue_equipment_id: string | null
  label: string | null
  x: number; y: number; w: number; h: number
  ip_address: string | null
  serial_number: string | null
  installed_version: string | null
  manufacturer: string | null
  model: string | null
  manual_url: string | null
  training_video_url: string | null
  known_issue_count: number | null
  software_status: SoftwareStatus
}

const DRAWING_TYPES = new Set(['drawing', 'rack_photo', 'image', 'spec_sheet'])

export function VenueDrawingsTab({ venueId, isManager }: { venueId: string; isManager: boolean }) {
  const [docs, setDocs] = useState<VenueDocument[]>([])
  const [selected, setSelected] = useState<VenueDocument | null>(null)
  const [hotspots, setHotspots] = useState<Hotspot[]>([])
  const [equipment, setEquipment] = useState<VenueEquipment[]>([])
  const [placing, setPlacing] = useState(false)
  const [pending, setPending] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const [active, setActive] = useState<Hotspot | null>(null)
  const [loading, setLoading] = useState(true)
  const imgRef = useRef<HTMLDivElement>(null)

  const loadDocs = useCallback(async () => {
    setLoading(true)
    try {
      const [d, e] = await Promise.all([
        fetch(`/api/venues/${venueId}/documents`).then((r) => r.ok ? r.json() : { documents: [] }),
        fetch(`/api/venues/${venueId}/equipment`).then((r) => r.ok ? r.json() : { equipment: [] }),
      ])
      const drawings = (d.documents || []).filter((x: VenueDocument) => DRAWING_TYPES.has(x.file_type))
      setDocs(drawings)
      setEquipment(e.equipment || [])
      setSelected((prev) => prev ? drawings.find((x: VenueDocument) => x.id === prev.id) || drawings[0] || null : drawings[0] || null)
    } finally { setLoading(false) }
  }, [venueId])

  useEffect(() => { loadDocs() }, [loadDocs])

  const loadHotspots = useCallback(async (docId: string) => {
    const res = await fetch(`/api/venues/${venueId}/hotspots?document_id=${docId}`)
    if (res.ok) setHotspots((await res.json()).hotspots || [])
  }, [venueId])

  useEffect(() => { if (selected) loadHotspots(selected.id) }, [selected, loadHotspots])

  // Percentages of the rendered image, so a hotspot placed on a laptop lands
  // in the same spot on a phone in a tunnel.
  const pointPct = (e: React.MouseEvent) => {
    const box = imgRef.current?.getBoundingClientRect()
    if (!box) return null
    return {
      x: ((e.clientX - box.left) / box.width) * 100,
      y: ((e.clientY - box.top) / box.height) * 100,
    }
  }

  const onMouseDown = (e: React.MouseEvent) => {
    if (!placing) return
    const p = pointPct(e)
    if (p) { setDrag(p); setPending({ x: p.x, y: p.y, w: 0, h: 0 }) }
  }
  const onMouseMove = (e: React.MouseEvent) => {
    if (!placing || !drag) return
    const p = pointPct(e)
    if (!p) return
    setPending({
      x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y),
      w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y),
    })
  }
  const onMouseUp = () => { if (placing) setDrag(null) }

  const savePending = async (equipmentId: string, label: string) => {
    if (!pending || !selected) return
    const res = await fetch(`/api/venues/${venueId}/hotspots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        document_id: selected.id,
        venue_equipment_id: equipmentId || null,
        label: label || null,
        ...pending,
      }),
    })
    if (res.ok) { setPending(null); setPlacing(false); loadHotspots(selected.id) }
  }

  const removeHotspot = async (id: string) => {
    const res = await fetch(`/api/venues/${venueId}/hotspots`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hotspot_id: id }),
    })
    if (res.ok && selected) { setActive(null); loadHotspots(selected.id) }
  }

  const pinAs = async (field: 'rack_document_id' | 'signal_map_document_id') => {
    if (!selected) return
    await fetch(`/api/venues/${venueId}/reference`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: selected.id }),
    })
  }

  if (loading) return <Empty title="Loading drawings…" />

  if (docs.length === 0) {
    return (
      <Card>
        <Empty
          title="No drawings uploaded yet"
          hint="Upload signal flow diagrams, rack elevations and rack photos on the Docs tab — anything filed as a drawing, image or spec sheet shows up here."
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {docs.map((d) => (
          <button key={d.id} onClick={() => { setSelected(d); setActive(null); setPending(null); setPlacing(false) }}
            className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
              selected?.id === d.id ? 'text-white border-transparent' : 'bg-white text-zinc-700 border-[#E8E8E8] hover:border-zinc-300'
            }`}
            style={selected?.id === d.id ? { background: BLUE } : undefined}>
            {d.original_name}
          </button>
        ))}
      </div>

      {selected && (
        <Card
          title={selected.original_name}
          subtitle={isImage(selected.original_name)
            ? 'Click a marker for that unit’s address, serial, manual and known issues'
            : 'Preview is available for image drawings; this one opens in a new tab'}
          action={isManager ? (
            <div className="flex items-center gap-2">
              <button onClick={() => pinAs('rack_document_id')} className="text-xs text-zinc-600 hover:text-zinc-900">Pin as rack</button>
              <button onClick={() => pinAs('signal_map_document_id')} className="text-xs text-zinc-600 hover:text-zinc-900">Pin as signal map</button>
              {isImage(selected.original_name) && (
                <button onClick={() => { setPlacing(!placing); setPending(null) }}
                  className={`px-3 py-1.5 rounded text-xs font-medium border ${placing ? 'text-white border-transparent' : 'bg-white text-zinc-700 border-[#E8E8E8]'}`}
                  style={placing ? { background: BLUE } : undefined}>
                  {placing ? 'Cancel' : '+ Add hotspot'}
                </button>
              )}
            </div>
          ) : null}
        >
          {!isImage(selected.original_name) ? (
            <a href={selected.filename} target="_blank" rel="noreferrer"
              className="block rounded border border-[#E8E8E8] bg-zinc-50 py-10 text-center text-sm hover:underline" style={{ color: BLUE }}>
              Open {selected.original_name}
            </a>
          ) : (
            <>
              {placing && (
                <p className="text-xs text-amber-700 mb-2">
                  Drag a box over the piece of gear, then pick which unit it is.
                </p>
              )}
              <div
                ref={imgRef}
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                className={`relative inline-block max-w-full select-none ${placing ? 'cursor-crosshair' : ''}`}
              >
                <img src={selected.filename} alt={selected.original_name} className="max-w-full rounded border border-[#E8E8E8]" draggable={false} />
                {hotspots.map((h) => (
                  <button
                    key={h.id}
                    onClick={(e) => { e.stopPropagation(); setActive(h) }}
                    title={h.label || `${h.manufacturer || ''} ${h.model || ''}`.trim()}
                    className="absolute border-2 rounded hover:bg-[#0A52EF]/20 transition-colors"
                    style={{
                      left: `${h.x}%`, top: `${h.y}%`, width: `${h.w}%`, height: `${h.h}%`,
                      borderColor: BLUE, background: 'rgba(10,82,239,0.10)',
                    }}
                  />
                ))}
                {pending && (
                  <div className="absolute border-2 border-dashed rounded pointer-events-none"
                    style={{ left: `${pending.x}%`, top: `${pending.y}%`, width: `${pending.w}%`, height: `${pending.h}%`, borderColor: BLUE }} />
                )}
              </div>

              {pending && pending.w > 0.5 && pending.h > 0.5 && (
                <HotspotAssign equipment={equipment} onCancel={() => setPending(null)} onSave={savePending} />
              )}

              {active && (
                <HotspotDetail hotspot={active} isManager={isManager}
                  onClose={() => setActive(null)} onRemove={() => removeHotspot(active.id)} />
              )}
            </>
          )}
        </Card>
      )}
    </div>
  )
}

function HotspotAssign({ equipment, onSave, onCancel }: {
  equipment: VenueEquipment[]
  onSave: (equipmentId: string, label: string) => void
  onCancel: () => void
}) {
  const [equipmentId, setEquipmentId] = useState('')
  const [label, setLabel] = useState('')
  return (
    <div className="mt-3 p-3 rounded border border-[#E8E8E8] bg-zinc-50 flex flex-wrap items-end gap-3">
      <label className="block">
        <span className="text-[11px] text-zinc-500 font-medium">Which unit</span>
        <select value={equipmentId} onChange={(e) => setEquipmentId(e.target.value)}
          className="mt-1 px-3 py-2 border border-[#E8E8E8] rounded text-sm bg-white min-w-56">
          <option value="">Not linked to a unit</option>
          {equipment.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}{e.manufacturer ? ` — ${e.manufacturer} ${e.model}` : ''}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="text-[11px] text-zinc-500 font-medium">Label (optional)</span>
        <input value={label} onChange={(e) => setLabel(e.target.value)}
          className="mt-1 px-3 py-2 border border-[#E8E8E8] rounded text-sm" placeholder="e.g. Sender 2" />
      </label>
      <button onClick={() => onSave(equipmentId, label)}
        className="px-4 py-2 text-white rounded text-xs font-medium" style={{ background: BLUE }}>
        Save hotspot
      </button>
      <button onClick={onCancel} className="px-4 py-2 text-xs text-zinc-600 border border-[#E8E8E8] rounded bg-white">Cancel</button>
    </div>
  )
}

function HotspotDetail({ hotspot, isManager, onClose, onRemove }: {
  hotspot: Hotspot
  isManager: boolean
  onClose: () => void
  onRemove: () => void
}) {
  return (
    <div className="mt-3 p-4 rounded border border-[#E8E8E8] bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-900">
            {hotspot.label || `${hotspot.manufacturer || ''} ${hotspot.model || ''}`.trim() || 'Unlabelled hotspot'}
          </p>
          {hotspot.manufacturer && <p className="text-[11px] text-zinc-500">{hotspot.manufacturer} {hotspot.model}</p>}
        </div>
        <div className="flex items-center gap-3">
          {isManager && <button onClick={onRemove} className="text-[11px] text-zinc-400 hover:text-red-600">Remove</button>}
          <button onClick={onClose} className="text-[11px] text-zinc-500 hover:text-zinc-900">Close</button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
        <Field label="IP address" value={hotspot.ip_address} />
        <Field label="Serial" value={hotspot.serial_number} />
        <Field label="Installed version" value={hotspot.installed_version} />
        <div>
          <p className="text-[11px] text-zinc-500 font-medium">Status</p>
          <div className="mt-0.5"><Badge tone={SOFTWARE_TONE[hotspot.software_status]}>{SOFTWARE_LABEL[hotspot.software_status]}</Badge></div>
        </div>
      </div>
      <div className="flex gap-3 mt-3">
        {hotspot.manual_url && <a href={hotspot.manual_url} target="_blank" rel="noreferrer" className="text-xs hover:underline" style={{ color: BLUE }}>Manual</a>}
        {hotspot.training_video_url && <a href={hotspot.training_video_url} target="_blank" rel="noreferrer" className="text-xs hover:underline" style={{ color: BLUE }}>Training video</a>}
        {!!hotspot.known_issue_count && <span className="text-xs text-amber-700">{hotspot.known_issue_count} known issue{hotspot.known_issue_count === 1 ? '' : 's'}</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Nova mapping — sender ports out to receiver cards
// ---------------------------------------------------------------------------

type NovaGroup = {
  sender_equipment_id: string | null
  sender_label: string
  sender_ip: string | null
  sender_manufacturer: string | null
  sender_model: string | null
  port: string | null
  receivers: Array<{
    id: string
    receiver_label: string
    receiver_model: string | null
    cabinet_row: number | null
    cabinet_col: number | null
    screen_name: string | null
    notes: string | null
  }>
}

export function VenueNovaTab({ venueId, isManager }: { venueId: string; isManager: boolean }) {
  const [groups, setGroups] = useState<NovaGroup[]>([])
  const [count, setCount] = useState(0)
  const [equipment, setEquipment] = useState<VenueEquipment[]>([])
  const [screens, setScreens] = useState<Array<{ id: string; display_name: string }>>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [n, e, s] = await Promise.all([
        fetch(`/api/venues/${venueId}/nova`).then((r) => r.ok ? r.json() : { groups: [], count: 0 }),
        fetch(`/api/venues/${venueId}/equipment`).then((r) => r.ok ? r.json() : { equipment: [] }),
        fetch(`/api/venues/${venueId}/screens`).then((r) => r.ok ? r.json() : { screens: [] }),
      ])
      setGroups(n.groups || [])
      setCount(n.count || 0)
      setEquipment(e.equipment || [])
      setScreens(s.screens || [])
    } finally { setLoading(false) }
  }, [venueId])

  useEffect(() => { load() }, [load])

  const add = async () => {
    if (!form.receiver_label?.trim()) return
    setSaving(true)
    try {
      const res = await fetch(`/api/venues/${venueId}/nova`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) { setForm({ sender_equipment_id: form.sender_equipment_id, port: form.port }); await load() }
    } finally { setSaving(false) }
  }

  const remove = async (id: string) => {
    const res = await fetch(`/api/venues/${venueId}/nova`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapping_id: id }),
    })
    if (res.ok) load()
  }

  if (loading) return <Empty title="Loading mapping…" />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500">{count} receiver card{count === 1 ? '' : 's'} mapped</p>
        {isManager && (
          <button onClick={() => { setAdding(!adding); setForm({}) }}
            className="px-3 py-1.5 text-white rounded text-xs font-medium" style={{ background: BLUE }}>
            {adding ? 'Done' : '+ Add receiver'}
          </button>
        )}
      </div>

      {adding && (
        <Card title="Add a receiver card" subtitle="Keeps the sender and port selected so a whole run can be entered without re-picking.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block">
              <span className="text-[11px] text-zinc-500 font-medium">Sender</span>
              <select value={form.sender_equipment_id || ''}
                onChange={(e) => setForm((f) => ({ ...f, sender_equipment_id: e.target.value }))}
                className="mt-1 w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm bg-white">
                <option value="">Unassigned</option>
                {equipment.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] text-zinc-500 font-medium">Port</span>
              <input value={form.port || ''} onChange={(e) => setForm((f) => ({ ...f, port: e.target.value }))}
                placeholder="e.g. 2" className="mt-1 w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" />
            </label>
            <label className="block">
              <span className="text-[11px] text-zinc-500 font-medium">Drives screen</span>
              <select value={form.venue_screen_id || ''}
                onChange={(e) => setForm((f) => ({ ...f, venue_screen_id: e.target.value }))}
                className="mt-1 w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm bg-white">
                <option value="">—</option>
                {screens.map((s) => <option key={s.id} value={s.id}>{s.display_name}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[11px] text-zinc-500 font-medium">Receiver label *</span>
              <input value={form.receiver_label || ''} onChange={(e) => setForm((f) => ({ ...f, receiver_label: e.target.value }))}
                placeholder="e.g. R1-04" className="mt-1 w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" />
            </label>
            <label className="block">
              <span className="text-[11px] text-zinc-500 font-medium">Receiver model</span>
              <input value={form.receiver_model || ''} onChange={(e) => setForm((f) => ({ ...f, receiver_model: e.target.value }))}
                placeholder="e.g. A8S-N" className="mt-1 w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] text-zinc-500 font-medium">Cabinet row</span>
                <input value={form.cabinet_row || ''} onChange={(e) => setForm((f) => ({ ...f, cabinet_row: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" />
              </label>
              <label className="block">
                <span className="text-[11px] text-zinc-500 font-medium">Column</span>
                <input value={form.cabinet_col || ''} onChange={(e) => setForm((f) => ({ ...f, cabinet_col: e.target.value }))}
                  className="mt-1 w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm" />
              </label>
            </div>
          </div>
          <button onClick={add} disabled={saving || !form.receiver_label?.trim()}
            className="mt-4 px-4 py-2 text-white rounded text-xs font-medium disabled:opacity-50" style={{ background: BLUE }}>
            {saving ? 'Saving…' : 'Add receiver'}
          </button>
        </Card>
      )}

      {groups.length === 0 && !adding ? (
        <Card>
          <Empty title="No sender or receiver mapping recorded"
            hint="Map which port feeds which cards so a failed cabinet can be traced back to a sender." />
        </Card>
      ) : groups.map((g, i) => (
        <Card key={`${g.sender_equipment_id}-${g.port}-${i}`}
          title={`${g.sender_label}${g.port ? ` · port ${g.port}` : ''}`}
          subtitle={[g.sender_manufacturer && `${g.sender_manufacturer} ${g.sender_model}`, g.sender_ip].filter(Boolean).join(' · ') || undefined}>
          <div className="flex flex-wrap gap-2">
            {g.receivers.map((r) => (
              <div key={r.id} className="group relative px-3 py-2 rounded border border-[#E8E8E8] bg-zinc-50 min-w-32">
                <p className="text-sm font-medium text-zinc-900">{r.receiver_label}</p>
                <p className="text-[11px] text-zinc-500">
                  {[r.receiver_model, r.screen_name,
                    (r.cabinet_row !== null && r.cabinet_col !== null) ? `R${r.cabinet_row}C${r.cabinet_col}` : null,
                  ].filter(Boolean).join(' · ') || '—'}
                </p>
                {isManager && (
                  <button onClick={() => remove(r.id)}
                    className="absolute top-1 right-1.5 text-[11px] text-zinc-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
