'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface Row {
  id: string
  source: string
  repo: string | null
  area: string | null
  classification: 'FIX' | 'NEW' | 'MIXED'
  bucket: string
  summary: string
  estimated_hours: number | null
  actual_hours: number | null
  retainer_covered: boolean
  status: string
  shipped_at: string | null
  received_at: string | null
  shipped_commit_sha: string | null
}

interface EditState {
  bucket: string
  classification: string
  actual_hours: string
  summary: string
}

const BUCKET_TONE: Record<string, string> = {
  service_contract: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  warranty:         'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  change_order:     'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border-violet-200 dark:border-violet-800',
  not_billable:     'bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-400 border-gray-200 dark:border-gray-800',
}

const BUCKET_LABEL: Record<string, string> = {
  service_contract: 'Service contract',
  warranty:         'Warranty',
  change_order:     'Change order',
  not_billable:     'Not billable',
}

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ManagedItems() {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(true)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [bucket, setBucket] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [edit, setEdit] = useState<EditState | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (q) params.set('q', q)
      if (bucket) params.set('bucket', bucket)
      params.set('limit', '200')
      const res = await fetch(`/api/transparency/managed?${params.toString()}`, { cache: 'no-store' })
      if (res.status === 401 || res.status === 403) {
        setRows([])
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setRows(json.rows || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load')
      setRows([])
    } finally {
      setLoading(false)
    }
  }, [q, bucket])

  useEffect(() => {
    if (!collapsed) load()
  }, [collapsed, load])

  function startEdit(r: Row) {
    setEditingId(r.id)
    setEdit({
      bucket: r.bucket,
      classification: r.classification,
      actual_hours: r.actual_hours == null ? '' : String(r.actual_hours),
      summary: r.summary || '',
    })
  }

  async function saveEdit(id: string) {
    if (!edit) return
    const body: Record<string, unknown> = { action: 'edit' }
    body.bucket = edit.bucket
    body.classification = edit.classification
    if (edit.actual_hours !== '') {
      const n = Number(edit.actual_hours)
      if (Number.isFinite(n) && n >= 0) body.actual_hours = n
    }
    if (edit.summary) body.summary = edit.summary
    const res = await fetch(`/api/transparency/inbox/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(`Edit failed: ${j.error || res.status}`)
      return
    }
    setEditingId(null)
    setEdit(null)
    await load()
    router.refresh()
  }

  async function unapprove(id: string) {
    if (!confirm('Send this row back to the pending inbox? The meter will drop its hours until you re-approve.')) return
    const res = await fetch(`/api/transparency/inbox/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'unapprove' }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(`Unapprove failed: ${j.error || res.status}`)
      return
    }
    await load()
    router.refresh()
  }

  async function destroy(id: string) {
    if (!confirm('Permanently delete this row from the ledger? This cannot be undone.')) return
    const res = await fetch(`/api/transparency/inbox/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete' }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      alert(`Delete failed: ${j.error || res.status}`)
      return
    }
    await load()
    router.refresh()
  }

  return (
    <section className="mb-6 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 rounded-2xl shadow-sm overflow-hidden" data-admin-only>
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-[12px] font-bold">
            ⚙
          </span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              Manage approved items — admin only
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
              Edit hours, reclassify, unapprove (send back to inbox), or permanently delete any past row.
            </div>
          </div>
        </div>
        <span className="text-gray-600 dark:text-gray-400 text-xs font-semibold flex-shrink-0">
          {collapsed ? 'Show ▾' : 'Hide ▴'}
        </span>
      </button>

      {!collapsed && (
        <div className="px-5 pb-5 pt-1 border-t border-gray-100 dark:border-gray-800">
          <div className="flex flex-wrap items-center gap-2 mb-4 mt-3">
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load() }}
              placeholder="Search summary, repo, area…"
              className="text-xs px-3 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 flex-1 min-w-[200px]"
            />
            <select
              value={bucket}
              onChange={(e) => setBucket(e.target.value)}
              className="text-xs px-3 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950"
            >
              <option value="">All buckets</option>
              <option value="service_contract">Service contract</option>
              <option value="warranty">Warranty</option>
              <option value="change_order">Change order</option>
              <option value="not_billable">Not billable</option>
            </select>
            <button
              onClick={load}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Loading…' : 'Apply'}
            </button>
            {rows ? (
              <span className="text-[11px] text-gray-500 dark:text-gray-500 ml-auto tabular-nums">
                {rows.length} row{rows.length === 1 ? '' : 's'}
              </span>
            ) : null}
          </div>

          {error && (
            <div className="text-xs text-rose-700 dark:text-rose-300 mb-3 px-3 py-2 bg-rose-50 dark:bg-rose-950 rounded">
              {error}
            </div>
          )}

          {rows === null ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 py-6 text-center">Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-xs text-gray-500 dark:text-gray-400 py-6 text-center">No matches.</div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const isEditing = editingId === r.id && edit
                return (
                  <div
                    key={r.id}
                    className="border border-gray-200 dark:border-gray-800 rounded-lg p-3 bg-gray-50/40 dark:bg-gray-950/40"
                  >
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${BUCKET_TONE[r.bucket] || BUCKET_TONE.service_contract}`}>
                        {BUCKET_LABEL[r.bucket] || r.bucket}
                      </span>
                      <span className="text-[10px] font-mono text-gray-500 dark:text-gray-500">{r.classification}</span>
                      {r.repo && (
                        <span className="text-[10px] text-gray-500 dark:text-gray-500">
                          {r.repo}{r.area ? `/${r.area}` : ''}
                        </span>
                      )}
                      {r.shipped_commit_sha && (
                        <span className="text-[10px] font-mono text-gray-400 dark:text-gray-600">
                          {r.shipped_commit_sha.slice(0, 7)}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400 dark:text-gray-600 ml-auto">
                        {fmtDate(r.shipped_at || r.received_at)}
                      </span>
                    </div>

                    {isEditing ? (
                      <div className="space-y-2">
                        <textarea
                          value={edit!.summary}
                          onChange={(e) => setEdit({ ...edit!, summary: e.target.value })}
                          rows={2}
                          className="w-full text-sm px-2 py-1.5 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={edit!.bucket}
                            onChange={(e) => setEdit({ ...edit!, bucket: e.target.value })}
                            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950"
                          >
                            <option value="service_contract">Service contract</option>
                            <option value="warranty">Warranty</option>
                            <option value="change_order">Change order</option>
                            <option value="not_billable">Not billable</option>
                          </select>
                          <select
                            value={edit!.classification}
                            onChange={(e) => setEdit({ ...edit!, classification: e.target.value })}
                            className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950"
                          >
                            <option value="FIX">FIX</option>
                            <option value="NEW">NEW</option>
                            <option value="MIXED">MIXED</option>
                          </select>
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            value={edit!.actual_hours}
                            onChange={(e) => setEdit({ ...edit!, actual_hours: e.target.value })}
                            className="text-xs w-24 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950"
                            placeholder="hours"
                          />
                          <span className="text-[11px] text-gray-500 dark:text-gray-500">hrs (actual)</span>
                          <div className="ml-auto flex gap-1.5">
                            <button
                              onClick={() => { setEditingId(null); setEdit(null) }}
                              className="text-xs px-3 py-1 rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => saveEdit(r.id)}
                              className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 font-semibold"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm text-gray-900 dark:text-gray-100 leading-snug mb-2">
                          {r.summary}
                        </div>
                        <div className="flex items-center gap-3 flex-wrap text-xs">
                          <span className="font-mono tabular-nums text-gray-700 dark:text-gray-300">
                            {r.actual_hours != null ? `${r.actual_hours.toFixed(2)}h actual` : 'no hours'}
                            {r.estimated_hours != null && r.actual_hours == null ? ` · ${r.estimated_hours.toFixed(2)}h est` : ''}
                          </span>
                          <span className="text-gray-400">·</span>
                          <span className="text-gray-500 dark:text-gray-500">{r.status}</span>
                          <div className="ml-auto flex gap-1.5">
                            <button
                              onClick={() => startEdit(r)}
                              className="text-xs px-2.5 py-1 rounded border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => unapprove(r.id)}
                              className="text-xs px-2.5 py-1 rounded border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950"
                            >
                              Unapprove
                            </button>
                            <button
                              onClick={() => destroy(r.id)}
                              className="text-xs px-2.5 py-1 rounded border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
