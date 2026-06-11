'use client'

import { FormEvent, useEffect, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface PackSummary {
  id: string
  name: string
  description: string | null
  client_label: string | null
  client_email: string | null
  share_token: string
  expires_at: string | null
  view_count: number
  last_viewed_at: string | null
  item_count: number
  created_at: string
  updated_at: string
  created_by_name: string | null
}

interface PackItem {
  id?: string
  label: string
  url: string
  caption: string
  position: number
}

interface PackDetail extends PackSummary {
  items: PackItem[]
}

const emptyItem = (position: number): PackItem => ({
  label: '',
  url: '',
  caption: '',
  position,
})

const emptyForm = {
  name: '',
  description: '',
  client_label: '',
  client_email: '',
  expires_at: '',
  items: [emptyItem(0)] as PackItem[],
}

export default function SamplePacksPage() {
  const [packs, setPacks] = useState<PackSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(emptyForm)
  const [shareOrigin, setShareOrigin] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') setShareOrigin(window.location.origin)
  }, [])

  const fetchPacks = async () => {
    try {
      const res = await fetch('/api/design-sample-packs')
      const data = await res.json()
      setPacks(data.packs || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPacks() }, [])

  const startCreate = () => {
    setEditingId(null)
    setCreating(true)
    setForm({ ...emptyForm, items: [emptyItem(0)] })
  }

  const startEdit = async (p: PackSummary) => {
    setCreating(false)
    setEditingId(p.id)
    setForm({
      name: p.name,
      description: p.description || '',
      client_label: p.client_label || '',
      client_email: p.client_email || '',
      expires_at: p.expires_at ? p.expires_at.slice(0, 10) : '',
      items: [],
    })
    const res = await fetch(`/api/design-sample-packs/${p.id}`)
    if (res.ok) {
      const data = await res.json()
      const items: PackItem[] = (data.pack.items || []).map((it: any, idx: number) => ({
        id: it.id,
        label: it.label || '',
        url: it.url,
        caption: it.caption || '',
        position: typeof it.position === 'number' ? it.position : idx,
      }))
      setForm((prev) => ({ ...prev, items: items.length ? items : [emptyItem(0)] }))
    }
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
      const items = form.items
        .filter((it) => it.url.trim())
        .map((it, idx) => ({ ...it, position: idx }))
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        client_label: form.client_label.trim() || null,
        client_email: form.client_email.trim() || null,
        expires_at: form.expires_at || null,
        items,
      }
      const url = editingId ? `/api/design-sample-packs/${editingId}` : '/api/design-sample-packs'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err?.error || 'Could not save pack')
        return
      }
      await fetchPacks()
      closeForm()
    } finally {
      setSubmitting(false)
    }
  }

  const deletePack = async (p: PackSummary) => {
    if (!confirm(`Delete sample pack "${p.name}"? This breaks the share link.`)) return
    const res = await fetch(`/api/design-sample-packs/${p.id}`, { method: 'DELETE' })
    if (res.ok) {
      await fetchPacks()
      if (editingId === p.id) closeForm()
    }
  }

  const copyShareUrl = async (p: PackSummary) => {
    const url = `${shareOrigin}/samples/${p.share_token}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      window.prompt('Copy this URL:', url)
    }
  }

  const updateItem = (index: number, patch: Partial<PackItem>) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === index ? { ...it, ...patch } : it)),
    }))
  }

  const addItem = () => {
    setForm((prev) => ({ ...prev, items: [...prev.items, emptyItem(prev.items.length)] }))
  }

  const removeItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.length === 1
        ? [emptyItem(0)]
        : prev.items.filter((_, i) => i !== index),
    }))
  }

  const filtered = packs.filter((p) => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return (
      p.name.toLowerCase().includes(q) ||
      (p.client_label || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q)
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
              <h1 className="text-2xl font-semibold text-zinc-900">Sample Packs</h1>
              <p className="text-sm text-zinc-500 mt-1">
                Bundle past examples into one shareable link — send to a sponsor when they ask "can I see something you've done before?"
              </p>
            </div>
            <button
              onClick={startCreate}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-all"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span>New Pack</span>
            </button>
          </div>
        </div>

        {(creating || editingId) && (
          <form onSubmit={submitForm} className="rounded-xl bg-white ring-1 ring-zinc-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">
                {editingId ? 'Edit Pack' : 'New Pack'}
              </h2>
              <button type="button" onClick={closeForm} className="text-xs text-zinc-500 hover:text-zinc-900">Cancel</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Pack name *">
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Naples Zoo examples for Sponsor X"
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                />
              </Field>
              <Field label="Sponsor / client label">
                <input
                  type="text"
                  value={form.client_label}
                  onChange={(e) => setForm({ ...form, client_label: e.target.value })}
                  placeholder="Who's this for? Shown on the share page"
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Sponsor email (for your records)">
                <input
                  type="email"
                  value={form.client_email}
                  onChange={(e) => setForm({ ...form, client_email: e.target.value })}
                  placeholder="who you sent the link to"
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                />
              </Field>
              <Field label="Expires (optional)">
                <input
                  type="date"
                  value={form.expires_at}
                  onChange={(e) => setForm({ ...form, expires_at: e.target.value })}
                  className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                />
              </Field>
            </div>
            <Field label="Description (shown above the samples on the share page)">
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="w-full rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white resize-none"
                placeholder="A short note for the recipient"
              />
            </Field>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-[11px] font-semibold text-zinc-700 uppercase tracking-wider">
                  Examples ({form.items.filter((it) => it.url.trim()).length})
                </label>
                <button
                  type="button"
                  onClick={addItem}
                  className="text-xs text-[#0A52EF] hover:text-[#0840C0] font-medium"
                >
                  + Add another
                </button>
              </div>
              <div className="space-y-2">
                {form.items.map((it, i) => (
                  <div key={i} className="grid grid-cols-1 md:grid-cols-[200px_1fr_auto] gap-2 items-start rounded-lg ring-1 ring-zinc-200 bg-zinc-50/40 p-2.5">
                    <input
                      type="text"
                      value={it.label}
                      onChange={(e) => updateItem(i, { label: e.target.value })}
                      placeholder="Label (e.g. Spring 2024 Ribbon)"
                      className="w-full rounded-md ring-1 ring-zinc-200 px-2 py-1.5 text-xs focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                    />
                    <div className="space-y-1">
                      <input
                        type="url"
                        value={it.url}
                        onChange={(e) => updateItem(i, { url: e.target.value })}
                        placeholder="https://workspace.anc.com/File/... or any URL"
                        className="w-full rounded-md ring-1 ring-zinc-200 px-2 py-1.5 text-xs focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white font-mono"
                      />
                      <input
                        type="text"
                        value={it.caption}
                        onChange={(e) => updateItem(i, { caption: e.target.value })}
                        placeholder="Optional caption shown under the link"
                        className="w-full rounded-md ring-1 ring-zinc-200 px-2 py-1.5 text-xs focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(i)}
                      className="h-7 px-2 rounded-md text-xs text-zinc-500 hover:text-red-600 hover:bg-red-50"
                      title="Remove this example"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={submitting || !form.name.trim()}
                className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-all disabled:opacity-60"
              >
                {submitting ? 'Saving…' : editingId ? 'Save changes' : 'Create pack'}
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
            placeholder="Search packs…"
            className="flex-1 max-w-sm rounded-lg ring-1 ring-zinc-200 px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white"
          />
          <span className="text-xs text-zinc-500">{filtered.length} of {packs.length}</span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-white ring-1 ring-zinc-200/80 py-16 text-center">
            <div className="text-4xl mb-3 opacity-30">📎</div>
            <div className="text-sm font-medium text-zinc-900">No sample packs yet</div>
            <div className="text-xs text-zinc-500 mt-1">
              {packs.length === 0 ? 'Create one — pull together past examples and share a single link.' : 'Try a different search.'}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map((p) => (
              <div key={p.id} className="rounded-xl bg-white ring-1 ring-zinc-200 p-4 hover:ring-zinc-300 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-zinc-900 truncate">{p.name}</h3>
                    {p.client_label && (
                      <p className="text-xs text-zinc-500 mt-0.5">For {p.client_label}</p>
                    )}
                    {p.description && (
                      <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{p.description}</p>
                    )}
                  </div>
                  <span className="flex-shrink-0 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded">
                    {p.item_count} {p.item_count === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <div className="mt-3 flex items-center flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-zinc-500">
                  <span>👁 {p.view_count} {p.view_count === 1 ? 'view' : 'views'}</span>
                  {p.last_viewed_at && <span>· last opened {new Date(p.last_viewed_at).toLocaleDateString()}</span>}
                  {p.expires_at && <span>· expires {new Date(p.expires_at).toLocaleDateString()}</span>}
                </div>
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => copyShareUrl(p)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#0A52EF] text-white text-xs font-medium hover:bg-[#0840C0]"
                    title={`${shareOrigin}/samples/${p.share_token}`}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 015.656 5.656l-3 3a4 4 0 01-5.656-5.656m-1.656-1.656a4 4 0 00-5.656 5.656l3 3a4 4 0 005.656-5.656" />
                    </svg>
                    Copy share link
                  </button>
                  <a
                    href={`/samples/${p.share_token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-xs text-zinc-700 hover:bg-zinc-50"
                  >
                    Preview
                  </a>
                  <button
                    onClick={() => startEdit(p)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-xs text-zinc-700 hover:bg-zinc-50"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deletePack(p)}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-xs text-zinc-500 hover:text-red-600 hover:bg-red-50 hover:ring-red-200 ml-auto"
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
