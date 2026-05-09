'use client'

import { useEffect, useMemo, useState } from 'react'

interface ProposedCO {
  id: string
  name: string
  pitch: string | null
  bullets: string[]
  price_usd: number | null
  timeline_label: string | null
  benefit: string | null
  category: 'bundle' | 'individual'
  target_project: string | null
  status: 'draft' | 'available' | 'pitched' | 'in_progress' | 'won' | 'archived'
  pitched_to: string[]
  promoted_request_id: string | null
  is_placeholder: boolean
  sort_order: number
  notes: string | null
  created_at: string
  updated_at: string
}

const STATUS_TONE: Record<string, string> = {
  draft:       'bg-zinc-100 text-zinc-600 border-zinc-200',
  available:   'bg-blue-50 text-blue-700 border-blue-200',
  pitched:     'bg-purple-50 text-purple-700 border-purple-200',
  in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  won:         'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const PROJECT_OPTIONS = [
  { key: '', label: '— any platform —' },
  { key: 'service-dashboard', label: 'Service Dashboard' },
  { key: 'proposal-engine', label: 'Proposal Engine' },
  { key: 'crm', label: 'CRM' },
  { key: 'kb', label: 'Knowledge Base' },
  { key: 'mirror-mode', label: 'Mirror Mode' },
  { key: 'anything-llm', label: 'AI Assistant' },
  { key: 'cross-platform', label: 'Cross-platform bundle' },
]

function fmtUSD(n: number | null): string {
  if (!n || !Number.isFinite(n)) return ''
  if (n >= 1000) return '$' + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k'
  return '$' + Math.round(n)
}

const EMPTY_DRAFT: Partial<ProposedCO> = {
  name: '',
  pitch: '',
  bullets: ['', '', ''],
  price_usd: null,
  timeline_label: '',
  benefit: '',
  category: 'individual',
  target_project: '',
  status: 'available',
  is_placeholder: false,
  notes: '',
}

export default function ProposedCOsPage() {
  const [items, setItems] = useState<ProposedCO[]>([])
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState<{ mode: 'new' | 'edit'; data: Partial<ProposedCO> & { id?: string } } | null>(null)
  const [filter, setFilter] = useState<'all' | 'bundle' | 'individual'>('all')
  const [savingId, setSavingId] = useState<string | null>(null)

  const refresh = async () => {
    setLoading(true)
    const r = await fetch('/api/proposed-cos').then(r => r.json())
    setItems(r.items || [])
    setLoading(false)
  }
  useEffect(() => { refresh() }, [])

  const visible = useMemo(() => {
    if (filter === 'all') return items
    return items.filter(i => i.category === filter)
  }, [items, filter])

  const bundles = visible.filter(i => i.category === 'bundle')
  const individuals = visible.filter(i => i.category === 'individual')

  const realCount = items.filter(i => !i.is_placeholder).length
  const placeholderCount = items.filter(i => i.is_placeholder).length

  const save = async () => {
    if (!drawer) return
    const payload = { ...drawer.data }
    if (Array.isArray(payload.bullets)) {
      payload.bullets = payload.bullets.filter(b => typeof b === 'string' && b.trim().length > 0)
    }
    if (drawer.mode === 'new') {
      const res = await fetch('/api/proposed-cos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) return
    } else if (drawer.data.id) {
      const res = await fetch(`/api/proposed-cos/${drawer.data.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) return
    }
    setDrawer(null)
    await refresh()
  }

  const remove = async (id: string) => {
    if (!confirm('Archive this card? It will disappear from the catalog.')) return
    await fetch(`/api/proposed-cos/${id}`, { method: 'DELETE' })
    await refresh()
  }

  const promote = async (item: ProposedCO) => {
    const requester = window.prompt('Who is this getting pitched to / promoted for? (optional, e.g. "Joe", "Charlie", "Jireh")', '') || ''
    setSavingId(item.id)
    const res = await fetch(`/api/proposed-cos/${item.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requester: requester || undefined }),
    })
    setSavingId(null)
    if (!res.ok) {
      alert('Promotion failed')
      return
    }
    const data = await res.json()
    await refresh()
    if (data.request_id && confirm('Promoted! Open the new change-order on the kanban?')) {
      window.location.href = '/service-log/change-orders'
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Proposed Change Orders</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Catalog of CO ideas ready to pitch. Each card carries a baked-in price + timeline + benefit, so
            stakeholders see a real proposal — not a guess. Promote a card to push it onto the change-orders
            kanban as a quoted CO.
          </p>
        </div>
        <button
          onClick={() => setDrawer({ mode: 'new', data: { ...EMPTY_DRAFT } })}
          className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 whitespace-nowrap"
        >
          + New idea
        </button>
      </div>

      {placeholderCount > 0 && (
        <div className="mb-4 rounded-lg border border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/60 px-4 py-3">
          <p className="text-xs text-amber-900 dark:text-amber-200">
            <strong>{placeholderCount} placeholder cards</strong> — replace these with real bundles + features as ideas come up.
            Click <strong>+ New idea</strong> to add one, or click any placeholder card to edit it in place.
            {realCount > 0 && <span className="ml-1 opacity-70">({realCount} real card{realCount === 1 ? '' : 's'} so far.)</span>}
          </p>
        </div>
      )}

      <div className="flex gap-2 mb-4 text-xs">
        {(['all', 'bundle', 'individual'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md border ${
              filter === f
                ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900 dark:border-white'
                : 'border-gray-300 text-gray-700 dark:text-gray-300 dark:border-zinc-700 hover:bg-gray-50 dark:hover:bg-zinc-800'
            }`}
          >
            {f === 'all' ? 'All' : f === 'bundle' ? 'Bundles' : 'Individual features'}
          </button>
        ))}
      </div>

      {loading && (
        <div className="text-sm text-gray-400 text-center py-12">Loading…</div>
      )}

      {!loading && bundles.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Bundles</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {bundles.map(item => (
              <Card key={item.id} item={item}
                onEdit={() => setDrawer({ mode: 'edit', data: item })}
                onPromote={() => promote(item)}
                onArchive={() => remove(item.id)}
                saving={savingId === item.id}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && individuals.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Individual features</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {individuals.map(item => (
              <Card key={item.id} item={item}
                onEdit={() => setDrawer({ mode: 'edit', data: item })}
                onPromote={() => promote(item)}
                onArchive={() => remove(item.id)}
                saving={savingId === item.id}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && visible.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-zinc-700 p-12 text-center">
          <div className="text-3xl mb-3">💡</div>
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">No proposed COs yet</p>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Add ideas as bundles or individual features. Each one becomes a one-click pitch with price, timeline, and benefit pre-baked.
          </p>
        </div>
      )}

      {drawer && (
        <Drawer
          drawer={drawer}
          onChange={(next) => setDrawer({ ...drawer, data: { ...drawer.data, ...next } })}
          onClose={() => setDrawer(null)}
          onSave={save}
        />
      )}
    </div>
  )
}

function Card({
  item, onEdit, onPromote, onArchive, saving,
}: {
  item: ProposedCO
  onEdit: () => void
  onPromote: () => void
  onArchive: () => void
  saving: boolean
}) {
  const isPlaceholder = item.is_placeholder
  const tone = STATUS_TONE[item.status] || STATUS_TONE.available
  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        isPlaceholder
          ? 'border-dashed border-amber-300 dark:border-amber-700/60 bg-amber-50/40 dark:bg-amber-950/20'
          : 'border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded border ${tone}`}>
              {item.status.replace('_', ' ')}
            </span>
            {item.category === 'bundle' && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded bg-purple-100 text-purple-800">
                bundle
              </span>
            )}
            {isPlaceholder && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded bg-amber-200 text-amber-900">
                placeholder · click to fill
              </span>
            )}
          </div>
          <h3 className={`text-sm font-semibold leading-tight ${isPlaceholder ? 'text-amber-900 dark:text-amber-200' : 'text-gray-900 dark:text-gray-100'}`}>
            {item.name}
          </h3>
        </div>
        <div className="flex flex-col items-end flex-shrink-0">
          <div className={`text-base font-bold tabular-nums ${isPlaceholder ? 'text-amber-700 dark:text-amber-400' : 'text-gray-900 dark:text-gray-100'}`}>
            {fmtUSD(item.price_usd) || (isPlaceholder ? '$??k' : '—')}
          </div>
          {item.timeline_label && (
            <div className="text-[10px] text-gray-500">{item.timeline_label}</div>
          )}
        </div>
      </div>

      {item.pitch && (
        <p className={`text-xs leading-snug mb-3 ${isPlaceholder ? 'text-amber-700/80 dark:text-amber-400/80 italic' : 'text-gray-700 dark:text-gray-300'}`}>
          {item.pitch}
        </p>
      )}

      {item.bullets.length > 0 && (
        <ul className="space-y-1 mb-3">
          {item.bullets.slice(0, 5).map((b, i) => (
            <li key={i} className={`text-[11px] leading-snug flex gap-1.5 ${isPlaceholder ? 'text-amber-700/70 dark:text-amber-400/70 italic' : 'text-gray-600 dark:text-gray-400'}`}>
              <span className="text-gray-400 flex-shrink-0">·</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}

      {item.benefit && (
        <div className={`text-[11px] leading-snug mb-3 px-2 py-1.5 rounded ${isPlaceholder ? 'bg-amber-100/60 dark:bg-amber-900/30 text-amber-800/80 dark:text-amber-300/80 italic' : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300'}`}>
          <strong className="font-semibold">Benefit:</strong> {item.benefit}
        </div>
      )}

      {item.pitched_to.length > 0 && (
        <div className="text-[10px] text-gray-500 mb-2">
          Pitched to: {item.pitched_to.join(', ')}
        </div>
      )}

      <div className="flex gap-1.5 pt-2 border-t border-gray-100 dark:border-zinc-800">
        <button
          onClick={onEdit}
          className="flex-1 px-2 py-1.5 text-[11px] border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-zinc-800"
        >
          Edit
        </button>
        {!isPlaceholder && item.status !== 'won' && (
          <button
            onClick={onPromote}
            disabled={saving}
            className="flex-1 px-2 py-1.5 text-[11px] bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? '...' : 'Promote → CO'}
          </button>
        )}
        <button
          onClick={onArchive}
          className="px-2 py-1.5 text-[11px] text-gray-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-md"
        >
          Archive
        </button>
      </div>
    </div>
  )
}

function Drawer({
  drawer, onChange, onClose, onSave,
}: {
  drawer: { mode: 'new' | 'edit'; data: Partial<ProposedCO> & { id?: string } }
  onChange: (next: Partial<ProposedCO>) => void
  onClose: () => void
  onSave: () => void
}) {
  const d = drawer.data
  const bullets: string[] = d.bullets || ['', '', '']

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-lg bg-white dark:bg-zinc-900 shadow-xl overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-zinc-900 border-b border-gray-200 dark:border-zinc-800 p-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-gray-500">
              {drawer.mode === 'new' ? 'New' : 'Edit'} proposed CO
            </div>
            <div className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {d.name || 'Untitled'}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        <div className="p-4 space-y-4">
          <Field label="Name" hint="Short, product-y. Reads like a SKU.">
            <input
              value={d.name || ''}
              onChange={e => onChange({ name: e.target.value })}
              placeholder="e.g. Slack-to-CRM auto-triage"
              className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm"
            />
          </Field>

          <Field label="Category">
            <div className="flex gap-2">
              {(['individual', 'bundle'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => onChange({ category: c })}
                  className={`flex-1 px-3 py-2 text-sm rounded-md border ${
                    d.category === c
                      ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900'
                      : 'border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {c === 'individual' ? 'Individual feature' : 'Bundle (multi-feature)'}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Target platform">
            <select
              value={d.target_project || ''}
              onChange={e => onChange({ target_project: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm"
            >
              {PROJECT_OPTIONS.map(opt => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Pitch line" hint="One sentence the stakeholder reads first.">
            <textarea
              value={d.pitch || ''}
              onChange={e => onChange({ pitch: e.target.value })}
              rows={2}
              placeholder="e.g. Every Slack request gets auto-routed into the right project pipeline before it can be missed."
              className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm"
            />
          </Field>

          <Field label="Capabilities" hint="3 short bullets — what this delivers.">
            <div className="space-y-2">
              {bullets.map((b, i) => (
                <input
                  key={i}
                  value={b}
                  onChange={e => {
                    const next = [...bullets]
                    next[i] = e.target.value
                    onChange({ bullets: next })
                  }}
                  placeholder={`Bullet ${i + 1}`}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm"
                />
              ))}
              <button
                onClick={() => onChange({ bullets: [...bullets, ''] })}
                className="text-xs text-blue-600 hover:underline"
              >
                + add another bullet
              </button>
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (USD)">
              <input
                type="number"
                value={d.price_usd ?? ''}
                onChange={e => onChange({ price_usd: e.target.value ? Number(e.target.value) : null })}
                placeholder="2500"
                className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm tabular-nums"
              />
            </Field>
            <Field label="Timeline">
              <input
                value={d.timeline_label || ''}
                onChange={e => onChange({ timeline_label: e.target.value })}
                placeholder="e.g. 2 weeks"
                className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm"
              />
            </Field>
          </div>

          <Field label="Benefit" hint="The win for the stakeholder. Skips the technical, leads with outcome.">
            <textarea
              value={d.benefit || ''}
              onChange={e => onChange({ benefit: e.target.value })}
              rows={2}
              placeholder="e.g. No more requests slipping through Slack threads — every ask hits the right board within a minute."
              className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm"
            />
          </Field>

          <Field label="Status">
            <select
              value={d.status || 'available'}
              onChange={e => onChange({ status: e.target.value as ProposedCO['status'] })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm"
            >
              <option value="draft">Draft (not ready to pitch)</option>
              <option value="available">Available (ready to pitch)</option>
              <option value="pitched">Pitched (waiting on response)</option>
              <option value="in_progress">In progress (work starting)</option>
              <option value="won">Won (promoted to a real CO)</option>
            </select>
          </Field>

          <Field label="Notes (internal)">
            <textarea
              value={d.notes || ''}
              onChange={e => onChange({ notes: e.target.value })}
              rows={2}
              placeholder="Anything you want to remember about this card."
              className="w-full px-3 py-2 border border-gray-300 dark:border-zinc-700 dark:bg-zinc-800 rounded-md text-sm"
            />
          </Field>

          <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={Boolean(d.is_placeholder)}
              onChange={e => onChange({ is_placeholder: e.target.checked })}
            />
            <span>Mark as placeholder (visually indicates "fill me in later")</span>
          </label>

          <div className="flex gap-2 pt-3 border-t border-gray-200 dark:border-zinc-800 sticky bottom-0 bg-white dark:bg-zinc-900 -mx-4 px-4 py-3">
            <button
              onClick={onClose}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-zinc-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={!d.name?.trim()}
              className="flex-1 px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">{label}</div>
      {children}
      {hint && <div className="text-[10px] text-gray-400 mt-1">{hint}</div>}
    </div>
  )
}
