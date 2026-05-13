'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import ReasoningPanel, { ReasoningModal } from './ReasoningPanel'
import { ConfirmModal, PromptModal, SuccessModal } from '../../Modal'
import RoadmapView from './RoadmapView'

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
  draft:       'bg-gray-100 text-gray-600 border-gray-200',
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
  const [viewMode, setViewMode] = useState<'list' | 'roadmap'>('roadmap')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [archiveTarget, setArchiveTarget] = useState<ProposedCO | null>(null)
  const [promotePrompt, setPromotePrompt] = useState<ProposedCO | null>(null)
  const [postPromote, setPostPromote] = useState<{ requestId: string } | null>(null)

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

  const remove = (item: ProposedCO) => setArchiveTarget(item)

  const confirmArchive = async () => {
    if (!archiveTarget) return
    await fetch(`/api/proposed-cos/${archiveTarget.id}`, { method: 'DELETE' })
    setArchiveTarget(null)
    await refresh()
  }

  const promote = (item: ProposedCO) => setPromotePrompt(item)

  const submitPromote = async (requester: string) => {
    if (!promotePrompt) return
    const item = promotePrompt
    setPromotePrompt(null)
    setSavingId(item.id)
    const res = await fetch(`/api/proposed-cos/${item.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requester: requester || undefined }),
    })
    setSavingId(null)
    if (!res.ok) {
      setPostPromote({ requestId: '' })
      return
    }
    const data = await res.json()
    await refresh()
    if (data.request_id) setPostPromote({ requestId: data.request_id })
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="text-xs uppercase tracking-widest text-gray-500 mb-1">Explore · before you commit</div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Have an idea? See what it would take.</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-2xl">
            Browse scoped ideas, or describe a new request in plain words. You&apos;ll see a planning
            estimate with scope, timeline, pricing logic, and what you&apos;d get before anything becomes
            a change order. Nothing is ordered or billed until the final scope is confirmed.
          </p>
        </div>
        <button
          onClick={() => setDrawer({ mode: 'new', data: { ...EMPTY_DRAFT } })}
          className="px-3 py-2 text-sm bg-[#0A52EF] text-white rounded-md hover:bg-[#0840C0] whitespace-nowrap"
        >
          + Add an idea (manual)
        </button>
      </div>

      {/* AI scope generator — top of page, the hero */}
      <ScopeItHero onCreated={refresh} />

      <div className="flex items-center justify-between gap-3 mb-4 text-xs flex-wrap">
        <div className="flex gap-2">
          {(['all', 'bundle', 'individual'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md border ${
                filter === f
                  ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white'
                  : 'border-gray-300 text-gray-700 dark:text-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              {f === 'all' ? 'All' : f === 'bundle' ? 'Bundles' : 'Individual features'}
            </button>
          ))}
        </div>
        <div className="flex rounded-md border border-gray-300 dark:border-gray-700 overflow-hidden">
          <button
            onClick={() => setViewMode('roadmap')}
            className={`px-3 py-1.5 ${viewMode === 'roadmap' ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
          >
            🗺️ Roadmap
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 ${viewMode === 'list' ? 'bg-gray-900 text-white dark:bg-white dark:text-gray-900' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'}`}
          >
            ☰ List
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-sm text-gray-400 text-center py-12">Loading…</div>
      )}

      {!loading && viewMode === 'roadmap' && (
        <RoadmapView items={visible} />
      )}

      {!loading && viewMode === 'list' && bundles.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Bundles · multi-feature ideas</h2>
          <div className="grid md:grid-cols-2 gap-3">
            {bundles.map(item => (
              <Card key={item.id} item={item}
                onEdit={() => setDrawer({ mode: 'edit', data: item })}
                onPromote={() => promote(item)}
                onArchive={() => remove(item)}
                saving={savingId === item.id}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && viewMode === 'list' && individuals.length > 0 && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Individual features · single ideas</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {individuals.map(item => (
              <Card key={item.id} item={item}
                onEdit={() => setDrawer({ mode: 'edit', data: item })}
                onPromote={() => promote(item)}
                onArchive={() => remove(item)}
                saving={savingId === item.id}
              />
            ))}
          </div>
        </section>
      )}

      {!loading && viewMode === 'list' && visible.length === 0 && (
        <div className="rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
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

      {/* In-app modals replace the native browser confirm/prompt dialogs */}
      <ConfirmModal
        open={!!archiveTarget}
        onClose={() => setArchiveTarget(null)}
        title="Archive this idea?"
        body={archiveTarget ? `“${archiveTarget.name}” will move to the archive and stop showing in the catalog. You can restore it later from the database if you change your mind.` : ''}
        confirmLabel="Archive"
        cancelLabel="Keep it"
        tone="destructive"
        onConfirm={confirmArchive}
      />

      <PromptModal
        open={!!promotePrompt}
        onClose={() => setPromotePrompt(null)}
        title="Lock this in"
        body={promotePrompt ? `Who is this for? (optional — e.g. Joe, Charlie, Jireh.) Press Enter to lock it in as a real change order on the kanban.` : ''}
        placeholder="Who's this for?"
        confirmLabel="Lock it in →"
        onSubmit={submitPromote}
      />

      <SuccessModal
        open={!!postPromote}
        onClose={() => setPostPromote(null)}
        title="Locked in"
        body="The idea is now a real change order on the kanban — quoted and ready to ship."
        actionLabel="Open the kanban →"
        onAction={() => { window.location.href = '/service-log/change-orders' }}
      />
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
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md'
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

      <div className="flex gap-1.5 pt-2 border-t border-gray-100 dark:border-gray-800">
        <Link
          href={`/service-contract/proposed/${item.id}`}
          className="flex-1 px-2 py-1.5 text-[11px] text-center bg-gray-900 text-white dark:bg-white dark:text-gray-900 rounded-md hover:opacity-90"
        >
          View details →
        </Link>
        <button
          onClick={onEdit}
          className="px-2 py-1.5 text-[11px] border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Edit
        </button>
        {!isPlaceholder && item.status !== 'won' && (
          <button
            onClick={onPromote}
            disabled={saving}
            className="px-2 py-1.5 text-[11px] bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? '...' : 'Lock it in'}
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

function ScopeItHero({ onCreated }: { onCreated: () => Promise<void> }) {
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<ProposedCO | null>(null)
  const [refining, setRefining] = useState('')
  const [liveReasoning, setLiveReasoning] = useState('')
  const [liveStatus, setLiveStatus] = useState<string | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [dragActive, setDragActive] = useState(false)
  // ANC mode = uses project context + relationship discount.
  // Greenfield mode = market rate, no platform context (portfolio-friendly).
  // Persisted per-browser in localStorage so the choice sticks.
  const [scopeMode, setScopeMode] = useState<'anc' | 'greenfield'>('anc')

  useEffect(() => {
    try {
      const m = localStorage.getItem('scopeItMode')
      if (m === 'greenfield' || m === 'anc') setScopeMode(m)
    } catch {}
  }, [])
  const setScopeModePersist = (m: 'anc' | 'greenfield') => {
    setScopeMode(m)
    try { localStorage.setItem('scopeItMode', m) } catch {}
  }

  // Stream the scope-it endpoint. The reasoning IS the loader — it appears
  // live as the model thinks, then collapses into the final card on 'done'.
  // Switches to multipart/form-data when files are attached so the parser
  // can extract spreadsheet content + factor it into the proposal.
  const streamScope = async (payload: { description: string; refine_from?: string; files?: File[]; mode: 'anc' | 'greenfield' }) => {
    setBusy(true)
    setError(null)
    setLiveReasoning('')
    setLiveStatus('Starting…')

    try {
      let res: Response
      if (payload.files && payload.files.length > 0) {
        const fd = new FormData()
        fd.append('description', payload.description)
        fd.append('mode', payload.mode)
        if (payload.refine_from) fd.append('refine_from', payload.refine_from)
        for (const f of payload.files) fd.append('files', f, f.name)
        res = await fetch('/api/proposed-cos/scope-it/stream', { method: 'POST', body: fd })
      } else {
        res = await fetch('/api/proposed-cos/scope-it/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: payload.description, refine_from: payload.refine_from, mode: payload.mode }),
        })
      }
      if (!res.ok || !res.body) {
        setError(`Scoping failed (${res.status})`)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() || ''
        for (const block of blocks) {
          let event = 'message'
          let dataLine = ''
          for (const line of block.split('\n')) {
            if (line.startsWith('event:')) event = line.slice(6).trim()
            else if (line.startsWith('data:')) dataLine = line.slice(5).trim()
          }
          if (!dataLine) continue
          let parsed: any
          try { parsed = JSON.parse(dataLine) } catch { continue }
          if (event === 'status') {
            setLiveStatus(parsed.message || parsed.stage || '…')
          } else if (event === 'reasoning') {
            setLiveReasoning((prev) => prev + (parsed.delta || ''))
          } else if (event === 'done') {
            setDraft(parsed.draft)
            setLiveStatus(null)
            await onCreated()
          } else if (event === 'error') {
            setError(parsed.error || 'Scoping failed')
          }
        }
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const generate = () => {
    streamScope({ description, files: files.length ? files : undefined, mode: scopeMode })
    setFiles([]) // clear after submit so the next scope starts fresh
  }

  const refine = () => {
    if (!refining.trim() || !draft) return
    streamScope({ description: refining, refine_from: draft.id, files: files.length ? files : undefined, mode: scopeMode })
    setRefining('')
    setFiles([])
  }

  const addFiles = (incoming: FileList | File[] | null) => {
    if (!incoming) return
    const arr = Array.from(incoming).slice(0, 6)
    setFiles((prev) => {
      const merged = [...prev, ...arr]
      // Dedupe by name+size
      const seen = new Set<string>()
      return merged.filter((f) => {
        const key = `${f.name}::${f.size}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }).slice(0, 6)
    })
  }

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  const reset = () => {
    setDraft(null)
    setDescription('')
    setRefining('')
    setError(null)
  }

  return (
    <section className="rounded-2xl border-2 border-blue-200 dark:border-blue-800/60 bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-100/40 dark:from-blue-950/30 dark:via-indigo-950/30 dark:to-blue-950/20 p-6 shadow-sm mb-6">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-2xl">✨</span>
          <div>
            <h2 className="text-base font-semibold text-blue-900 dark:text-blue-100">Describe what you want — see what it would take</h2>
            <p className="text-xs text-blue-700 dark:text-blue-300">
            Plain English is fine. You&apos;ll get back a planning estimate with price, timeline, and what you&apos;d be getting. Tweak it until it fits. Nothing is ordered or billed until the final scope is confirmed.
            </p>
          </div>
        </div>
        {/* Mode toggle — ANC vs greenfield */}
        <div
          role="tablist"
          aria-label="Scope mode"
          className="inline-flex rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-900 p-0.5 text-[11px] font-semibold flex-shrink-0"
        >
          <button
            role="tab"
            aria-selected={scopeMode === 'anc'}
            onClick={() => setScopeModePersist('anc')}
            disabled={busy}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              scopeMode === 'anc'
                ? 'bg-[#0A52EF] text-white shadow-sm'
                : 'text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40'
            }`}
            title="Uses ANC project context + relationship pricing"
          >
            ANC project
          </button>
          <button
            role="tab"
            aria-selected={scopeMode === 'greenfield'}
            onClick={() => setScopeModePersist('greenfield')}
            disabled={busy}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              scopeMode === 'greenfield'
                ? 'bg-[#0A52EF] text-white shadow-sm'
                : 'text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40'
            }`}
            title="New project — fresh scope, no project context"
          >
            New project
          </button>
        </div>
      </div>

      {/* Mode-specific helper line */}
      <div className={`mb-3 px-3 py-2 rounded-md text-[11px] ${
        scopeMode === 'anc'
          ? 'bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/60 text-blue-800 dark:text-blue-200'
          : 'bg-purple-50/60 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/60 text-purple-800 dark:text-purple-200'
      }`}>
        {scopeMode === 'anc' ? (
          <>
            <strong>ANC project mode:</strong> AI checks the four live platforms, pulls past change-order pricing as the anchor, and factors in our long-term partnership. Use this for ideas that build on what is already running — Service Dashboard, Proposal Engine, CRM, or Operator Docs. Ahmad still confirms final scope and price before work starts.
          </>
        ) : (
          <>
            <strong>New project mode:</strong> AI has no knowledge of or access to current projects. Scope is built from the description alone — plus company website / brief / attached files if you provide them — and current market rates. Use this when the idea is not tied to anything already running. Ahmad still confirms final scope and price before work starts.
          </>
        )}
      </div>

      {!draft ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragActive(false)
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              addFiles(e.dataTransfer.files)
            }
          }}
          onPaste={(e) => {
            const list = e.clipboardData?.files
            if (list && list.length > 0) {
              e.preventDefault()
              addFiles(list)
            }
          }}
          className={dragActive ? 'rounded-md ring-2 ring-blue-500 ring-offset-2' : ''}
        >
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder='e.g. "I want a way to see all the shipped venues for the season in one place, with a filter by region and a way to email any of them at once." — drag in a file or paste an attachment to factor it into the scope.'
            rows={3}
            disabled={busy}
            className="w-full px-3 py-2 border border-blue-200 dark:border-blue-800/60 bg-white dark:bg-gray-900 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-60"
          />

          {/* File chips */}
          {files.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {files.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="flex items-center gap-2 px-2.5 py-1 rounded-md border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-900 text-[11px]"
                >
                  <span className="text-base">{
                    f.name.match(/\.(xlsx|xls|csv|tsv)$/i) ? '📊' :
                    f.name.match(/\.(pdf)$/i) ? '📄' :
                    f.name.match(/\.(docx|doc)$/i) ? '📝' :
                    f.name.match(/\.(json|yaml|yml)$/i) ? '🧾' :
                    '📎'
                  }</span>
                  <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[200px]">{f.name}</span>
                  <span className="text-gray-500">{(f.size / 1024).toFixed(0)} KB</span>
                  {!busy && (
                    <button
                      onClick={() => removeFile(i)}
                      className="text-gray-400 hover:text-rose-600 ml-1"
                      aria-label="Remove"
                    >×</button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mt-3 gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="cursor-pointer inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/40">
                📎 Attach
                <input
                  type="file"
                  multiple
                  className="hidden"
                  disabled={busy}
                  accept=".xlsx,.xls,.csv,.tsv,.txt,.md,.json,.yaml,.yml,.log"
                  onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
                />
              </label>
              <span className="text-[11px] text-blue-700 dark:text-blue-400">
                Pricing grounded in our market-rate model — AI can&apos;t underprice.
              </span>
            </div>
            <button
              onClick={generate}
              disabled={busy || (!description.trim() && files.length === 0)}
              className="px-4 py-2 text-sm bg-[#0A52EF] text-white rounded-md hover:bg-[#0840C0] disabled:opacity-50 font-medium"
            >
              {busy ? 'Scoping…' : 'Scope it →'}
            </button>
          </div>
          {error && <div className="text-xs text-rose-600 mt-2">{error}</div>}
        </div>
      ) : (
        <div>
          <div className="rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-900 p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded bg-gray-100 text-gray-600">
                    AI draft
                  </span>
                  {draft.category === 'bundle' && (
                    <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded bg-purple-100 text-purple-800">
                      bundle
                    </span>
                  )}
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{draft.name}</h3>
              </div>
              <div className="flex flex-col items-end flex-shrink-0">
                <div className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100">
                  {fmtUSD(draft.price_usd) || '—'}
                </div>
                {draft.timeline_label && <div className="text-[10px] text-gray-500">{draft.timeline_label}</div>}
              </div>
            </div>
            {draft.pitch && <p className="text-xs text-gray-700 dark:text-gray-300 mb-3">{draft.pitch}</p>}
            {draft.bullets.length > 0 && (
              <ul className="space-y-1 mb-3">
                {draft.bullets.map((b, i) => (
                  <li key={i} className="text-[12px] text-gray-600 dark:text-gray-400 flex gap-2">
                    <span className="text-gray-400">·</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
            {draft.benefit && (
              <div className="text-xs px-2 py-1.5 rounded bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300">
                <strong>Benefit:</strong> {draft.benefit}
              </div>
            )}
          </div>

          <div className="mt-4">
            <div className="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-2">Iterate (optional)</div>
            <div className="flex gap-2">
              <input
                value={refining}
                onChange={(e) => setRefining(e.target.value)}
                placeholder='e.g. "Make it cheaper", "add region filtering", "drop the email part"'
                disabled={busy}
                className="flex-1 px-3 py-2 border border-blue-200 dark:border-blue-800/60 bg-white dark:bg-gray-900 rounded-md text-sm disabled:opacity-60"
              />
              <button
                onClick={refine}
                disabled={busy || !refining.trim()}
                className="px-3 py-2 text-sm bg-[#0A52EF] text-white rounded-md hover:bg-[#0840C0] disabled:opacity-50"
              >
                {busy ? '…' : 'Refine'}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mt-4 pt-3 border-t border-blue-200 dark:border-blue-800/60">
            <div className="text-[11px] text-blue-700 dark:text-blue-400">
              Saved as <strong>draft</strong> in the catalog below — flip to <strong>available</strong> when you&apos;re ready to pitch.
            </div>
            <div className="flex gap-2">
              <Link
                href={`/service-contract/proposed/${draft.id}`}
                className="px-3 py-2 text-sm bg-gray-900 text-white dark:bg-white dark:text-gray-900 rounded-md hover:opacity-90"
              >
                Open detail →
              </Link>
              <button
                onClick={reset}
                className="px-3 py-2 text-sm border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300 rounded-md hover:bg-blue-100/50 dark:hover:bg-blue-950/40"
              >
                Start over
              </button>
            </div>
          </div>
          {error && <div className="text-xs text-rose-600 mt-2">{error}</div>}
        </div>
      )}

      {/* Reasoning modal — pops the moment Scope-it / Refine fires.
          Closes on user dismiss after 'done', or on Escape (when not busy). */}
      <ReasoningModal
        open={busy || !!liveReasoning}
        onClose={() => { setLiveReasoning(''); setLiveStatus(null) }}
        reasoning={liveReasoning}
        status={liveStatus}
        busy={busy}
      />
    </section>
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
        className="relative w-full max-w-lg bg-white dark:bg-gray-900 shadow-xl overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between">
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
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-md text-sm"
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
                      ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900'
                      : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300'
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
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-md text-sm"
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
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-md text-sm"
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
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-md text-sm"
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
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-md text-sm tabular-nums"
              />
            </Field>
            <Field label="Timeline">
              <input
                value={d.timeline_label || ''}
                onChange={e => onChange({ timeline_label: e.target.value })}
                placeholder="e.g. 2 weeks"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-md text-sm"
              />
            </Field>
          </div>

          <Field label="Benefit" hint="The win for the stakeholder. Skips the technical, leads with outcome.">
            <textarea
              value={d.benefit || ''}
              onChange={e => onChange({ benefit: e.target.value })}
              rows={2}
              placeholder="e.g. No more requests slipping through Slack threads — every ask hits the right board within a minute."
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-md text-sm"
            />
          </Field>

          <Field label="Status">
            <select
              value={d.status || 'available'}
              onChange={e => onChange({ status: e.target.value as ProposedCO['status'] })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-md text-sm"
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
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-md text-sm"
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

          <div className="flex gap-2 pt-3 border-t border-gray-200 dark:border-gray-800 sticky bottom-0 bg-white dark:bg-gray-900 -mx-4 px-4 py-3">
            <button
              onClick={onClose}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={!d.name?.trim()}
              className="flex-1 px-3 py-2 text-sm bg-[#0A52EF] text-white rounded-md hover:bg-[#0840C0] disabled:opacity-50"
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
