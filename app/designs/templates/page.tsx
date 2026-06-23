'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface Template {
  id: string
  name: string
  description: string | null
  job_title: string | null
  company_name: string | null
  tricode: string | null
  notes: string | null
  boards_requested: string | null
  sizes_requested: string | null
  hours_estimated: number | null
  is_rando: boolean
  venue_id: string | null
  venue_name: string | null
  designer_id: string | null
  designer_name: string | null
  enterprise_contact_id: string | null
  enterprise_contact_name: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  created_by_name: string | null
}

interface Venue { id: string; name: string }
interface Staff { id: string; full_name: string }

const emptyForm = {
  name: '',
  description: '',
  job_title: '',
  company_name: '',
  tricode: '',
  notes: '',
  boards_requested: '',
  sizes_requested: '',
  venue_id: '',
  designer_id: '',
  enterprise_contact_id: '',
  hours_estimated: '',
  is_rando: false,
}

export default function DesignTemplatesPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(emptyForm)

  const fetchData = async () => {
    try {
      const [t, v, s] = await Promise.all([
        fetch('/api/design-request-templates').then((r) => r.json()),
        fetch('/api/venues').then((r) => r.json()),
        fetch('/api/staff?assignable=project').then((r) => r.json()),
      ])
      setTemplates(t.templates || [])
      setVenues(v.venues || [])
      setStaff(s.staff || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [])

  const startCreate = () => {
    setEditingId(null)
    setCreating(true)
    setForm(emptyForm)
  }

  const startEdit = (t: Template) => {
    setCreating(false)
    setEditingId(t.id)
    setForm({
      name: t.name || '',
      description: t.description || '',
      job_title: t.job_title || '',
      company_name: t.company_name || '',
      tricode: t.tricode || '',
      notes: t.notes || '',
      boards_requested: t.boards_requested || '',
      sizes_requested: t.sizes_requested || '',
      venue_id: t.venue_id || '',
      designer_id: t.designer_id || '',
      enterprise_contact_id: t.enterprise_contact_id || '',
      hours_estimated: t.hours_estimated == null ? '' : String(t.hours_estimated),
      is_rando: !!t.is_rando,
    })
  }

  const closeForm = () => {
    setCreating(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  const submitForm = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        venue_id: form.venue_id || null,
        designer_id: form.designer_id || null,
        enterprise_contact_id: form.enterprise_contact_id || null,
        hours_estimated: form.hours_estimated ? Number(form.hours_estimated) : null,
      }
      const url = editingId
        ? `/api/design-request-templates/${editingId}`
        : '/api/design-request-templates'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err?.error || 'Could not save template')
        return
      }
      await fetchData()
      closeForm()
    } finally {
      setSubmitting(false)
    }
  }

  const deleteTemplate = async (t: Template) => {
    if (!confirm(`Delete template "${t.name}"? This can't be undone.`)) return
    const res = await fetch(`/api/design-request-templates/${t.id}`, { method: 'DELETE' })
    if (res.ok) {
      await fetchData()
      if (editingId === t.id) closeForm()
    }
  }

  const applyTemplate = async (t: Template) => {
    if (applyingId) return
    setApplyingId(t.id)
    try {
      const res = await fetch(`/api/design-request-templates/${t.id}/apply`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err?.error || 'Could not apply template')
        return
      }
      const data = await res.json()
      const newId = data?.design_request?.id
      if (newId) router.push(`/designs/${newId}`)
    } finally {
      setApplyingId(null)
    }
  }

  const filtered = templates.filter((t) => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return (
      t.name.toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q) ||
      (t.venue_name || '').toLowerCase().includes(q) ||
      (t.tricode || '').toLowerCase().includes(q)
    )
  })

  return (
    <DashboardLayout>
      <div className="max-w-[1800px] mx-auto space-y-6 py-2">
        <div className="space-y-3">
          <Link href="/designs" className="text-xs text-zinc-400 hover:text-zinc-700 transition-colors inline-flex items-center gap-1.5 group">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            All Design Requests
          </Link>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">Request Templates</h1>
              <p className="text-sm text-zinc-500 mt-1">
                Reusable starting points — apply one to spin up a Submitted ticket with the brief pre-filled.
              </p>
            </div>
            <button
              onClick={startCreate}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>New Template</span>
            </button>
          </div>
        </div>

        {(creating || editingId) && (
          <form onSubmit={submitForm} className="rounded-xl bg-white ring-1 ring-zinc-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">
                {editingId ? 'Edit Template' : 'New Template'}
              </h2>
              <button type="button" onClick={closeForm} className="text-xs text-zinc-500 hover:text-zinc-900">Cancel</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Template name *">
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. South Street concert series"
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                />
              </Field>
              <Field label="Default job title">
                <input
                  type="text"
                  value={form.job_title}
                  onChange={(e) => setForm({ ...form, job_title: e.target.value })}
                  placeholder="What gets pre-filled when applied"
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                />
              </Field>
            </div>
            <Field label="Description (when to use this template)">
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white resize-none"
                placeholder="e.g. Use for South Street concert nights — fill in the date + asset link after applying"
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Venue">
                <select
                  value={form.venue_id}
                  onChange={(e) => setForm({ ...form, venue_id: e.target.value })}
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                >
                  <option value="">— None —</option>
                  {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </Field>
              <Field label="Default designer">
                <select
                  value={form.designer_id}
                  onChange={(e) => setForm({ ...form, designer_id: e.target.value })}
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                >
                  <option value="">— Unassigned —</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </Field>
              <Field label="Tricode">
                <input
                  type="text"
                  value={form.tricode}
                  onChange={(e) => setForm({ ...form, tricode: e.target.value })}
                  placeholder="e.g. SSS"
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Boards requested">
                <textarea
                  value={form.boards_requested}
                  onChange={(e) => setForm({ ...form, boards_requested: e.target.value })}
                  rows={2}
                  placeholder="e.g. 2× main scoreboards, 1× ribbon"
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white resize-none"
                />
              </Field>
              <Field label="Sizes">
                <textarea
                  value={form.sizes_requested}
                  onChange={(e) => setForm({ ...form, sizes_requested: e.target.value })}
                  rows={2}
                  placeholder="e.g. 1920×1080, 960×540"
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white resize-none"
                />
              </Field>
            </div>
            <Field label="Notes / Brief">
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={4}
                placeholder="The recurring brief — what changes per cycle goes in the request, not here"
                className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white resize-none"
              />
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Estimated hours">
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={form.hours_estimated}
                  onChange={(e) => setForm({ ...form, hours_estimated: e.target.value })}
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                />
              </Field>
              <label className="flex items-center gap-2 text-sm text-zinc-700 self-end pb-2">
                <input
                  type="checkbox"
                  checked={form.is_rando}
                  onChange={(e) => setForm({ ...form, is_rando: e.target.checked })}
                  className="rounded"
                />
                <span>Mark applied requests as Rando (no venue)</span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={submitting || !form.name.trim()}
                className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-all disabled:opacity-60"
              >
                {submitting ? 'Saving…' : (editingId ? 'Save changes' : 'Create template')}
              </button>
              <button type="button" onClick={closeForm} className="h-9 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-sm text-zinc-700 hover:bg-zinc-50">
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="flex-1 max-w-sm rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
          />
          <span className="text-xs text-zinc-500">{filtered.length} of {templates.length}</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white ring-1 ring-zinc-200/80 py-16 text-center">
            <div className="text-4xl mb-3 opacity-30">📋</div>
            <div className="text-sm font-medium text-zinc-900">No templates yet</div>
            <div className="text-xs text-zinc-500 mt-1">
              {templates.length === 0 ? 'Create your first one — recurring jobs become a one-click setup.' : 'Try a different search.'}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((t) => (
              <div key={t.id} className="rounded-xl bg-white ring-1 ring-zinc-200 p-4 hover:ring-zinc-300 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-zinc-900 truncate">{t.name}</h3>
                    {t.description && (
                      <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{t.description}</p>
                    )}
                  </div>
                  {t.tricode && (
                    <span className="flex-shrink-0 font-mono text-[10px] font-semibold text-zinc-600 bg-zinc-100 ring-1 ring-zinc-200 px-1.5 py-0.5 rounded tracking-wider">
                      {t.tricode}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-zinc-500">
                  {t.venue_name && <span>📍 {t.venue_name}</span>}
                  {t.designer_name && <span>🎨 {t.designer_name}</span>}
                  {t.hours_estimated != null && <span>⏱ {t.hours_estimated}h</span>}
                  {t.boards_requested && <span className="truncate max-w-[160px]" title={t.boards_requested}>📐 {t.boards_requested}</span>}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    onClick={() => applyTemplate(t)}
                    disabled={applyingId === t.id}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#0A52EF] text-white text-xs font-medium hover:bg-[#0840C0] transition-colors disabled:opacity-60"
                  >
                    {applyingId === t.id ? 'Applying…' : 'Use template'}
                  </button>
                  <button
                    onClick={() => startEdit(t)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-xs text-zinc-700 hover:bg-zinc-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteTemplate(t)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-xs text-zinc-500 hover:text-red-600 hover:bg-red-50 hover:ring-red-200 transition-colors ml-auto"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold text-zinc-700 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}
