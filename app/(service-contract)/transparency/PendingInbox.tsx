'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface InboxRow {
  id: string
  source: string
  repo: string | null
  area: string | null
  classification: 'FIX' | 'NEW' | 'MIXED'
  bucket: string
  summary: string
  raw_text: string | null
  estimated_hours: number | null
  estimate_basis: string | null
  estimate_basis_chain: {
    method?: string
    classification?: string
    bucket?: string
    bucket_reason?: string
    repo?: string
    area?: string
    summary?: string
    comparables?: Array<{
      id: string
      summary: string
      actual_hours: number
      shipped_at: string
    }>
    commit_sha?: string
    files_touched?: number
    lines_added?: number
    lines_removed?: number
  } | null
  retainer_covered: boolean
  shipped_at: string | null
  received_at: string | null
  shipped_commit_sha: string | null
}

const BUCKET_LABELS: Record<string, { label: string; tone: string; explainer: string }> = {
  service_contract: {
    label: 'Service contract',
    tone: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    explainer: 'Counts toward the 12-hr/mo retainer.',
  },
  warranty: {
    label: 'Warranty',
    tone: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    explainer: 'Free fix on a delivery shipped <30 days ago — doesn’t count toward the retainer.',
  },
  change_order: {
    label: 'Change order',
    tone: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300 border-violet-200 dark:border-violet-800',
    explainer: 'New capability — billed as a separate quote, not retainer hours.',
  },
  not_billable: {
    label: 'Not billable',
    tone: 'bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-400 border-gray-200 dark:border-gray-800',
    explainer: 'Internal / personal / non-stakeholder work — never appears on ANC’s view.',
  },
}

function fmtDate(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function PendingInbox() {
  const router = useRouter()
  const [rows, setRows] = useState<InboxRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [editing, setEditing] = useState<Record<string, { hours: string; bucket: string }>>({})

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/transparency/inbox', { cache: 'no-store' })
      if (res.status === 401 || res.status === 403) {
        // Not an admin — silently hide.
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
  }

  useEffect(() => {
    load()
  }, [])

  async function act(id: string, action: 'approve' | 'skip', overrides?: { hours?: number; bucket?: string }) {
    const body: Record<string, unknown> = { action }
    if (overrides?.hours != null) body.hours = overrides.hours
    if (overrides?.bucket) body.bucket = overrides.bucket
    const res = await fetch(`/api/transparency/inbox/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      alert(`Action failed: ${errBody.error || res.status}`)
      return
    }
    setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev))
    // Approve/skip changes the meter, coverage strip, timeline, burndown — all
    // server-rendered. router.refresh() re-runs the page's server components
    // without a full reload so the dashboard reflects the new total immediately
    // instead of waiting for the 5-minute auto-refresh tick.
    router.refresh()
  }

  if (rows === null) {
    return (
      <section className="mt-12 mb-12 border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20 rounded-lg p-6">
        <div className="text-sm text-amber-700 dark:text-amber-300">Loading pending pushes…</div>
      </section>
    )
  }
  if (rows.length === 0) return null

  return (
    <section className="mt-12 mb-12 border border-amber-300 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 rounded-lg p-6 shadow-sm" data-admin-only>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-bold text-amber-900 dark:text-amber-100 mb-1">
            Pending pushes — review before they count
          </h2>
          <p className="text-xs text-amber-700 dark:text-amber-300 max-w-2xl">
            Each row is a commit the auto-publisher classified but hasn’t added to the public meter yet.
            Hours come from the same DB-priors formula as manual triage (median of past similar deliveries).
            Approve to count it. Skip if it shouldn’t appear at all. Reclassify if the bucket is wrong.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs px-3 py-1.5 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-900 text-amber-900 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900 disabled:opacity-50"
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <div className="text-xs text-amber-700 dark:text-amber-300 mb-3">
        {rows.length} push{rows.length === 1 ? '' : 'es'} pending
      </div>

      {error && (
        <div className="text-xs text-rose-700 dark:text-rose-300 mb-3 px-3 py-2 bg-rose-50 dark:bg-rose-950 rounded">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {rows.map((row) => {
          const bucketInfo = BUCKET_LABELS[row.bucket] || BUCKET_LABELS.service_contract
          const isExpanded = !!expanded[row.id]
          const editState = editing[row.id] || { hours: String(row.estimated_hours ?? ''), bucket: row.bucket }
          const comparables = row.estimate_basis_chain?.comparables || []
          return (
            <div key={row.id} className="border border-gray-200 dark:border-gray-800 rounded bg-white dark:bg-gray-950 p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide border ${bucketInfo.tone}`}>
                      {bucketInfo.label}
                    </span>
                    <span className="text-[10px] font-mono text-gray-500 dark:text-gray-500">
                      {row.classification}
                    </span>
                    {row.repo && (
                      <span className="text-[10px] text-gray-500 dark:text-gray-500">
                        {row.repo}{row.area ? `/${row.area}` : ''}
                      </span>
                    )}
                    {row.shipped_commit_sha && (
                      <span className="text-[10px] font-mono text-gray-400 dark:text-gray-600">
                        {row.shipped_commit_sha.slice(0, 7)}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 dark:text-gray-600 ml-auto">
                      {fmtDate(row.shipped_at || row.received_at)}
                    </span>
                  </div>
                  <div className="text-sm text-gray-900 dark:text-gray-100 leading-snug mb-2">
                    {row.summary}
                  </div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      {row.estimated_hours != null ? `${row.estimated_hours.toFixed(2)}h proposed` : 'no estimate'}
                    </span>
                    {row.estimate_basis && (
                      <button
                        onClick={() => setExpanded((p) => ({ ...p, [row.id]: !p[row.id] }))}
                        className="underline decoration-dotted underline-offset-2 text-gray-500 hover:text-gray-900 dark:hover:text-gray-200"
                      >
                        {isExpanded ? 'hide rationale' : 'why this number'}
                      </button>
                    )}
                  </div>
                  {isExpanded && (
                    <div className="mt-2 text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-800 rounded p-3 space-y-2">
                      <div>{row.estimate_basis}</div>
                      <div className="text-gray-500 dark:text-gray-500 text-[11px]">
                        Bucket reason: {row.estimate_basis_chain?.bucket_reason || bucketInfo.explainer}
                      </div>
                      {comparables.length > 0 && (
                        <div>
                          <div className="text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                            Comparable past deliveries:
                          </div>
                          <ul className="space-y-0.5">
                            {comparables.map((c) => (
                              <li key={c.id} className="text-[11px] font-mono flex gap-2 items-baseline">
                                <span className="text-gray-500 dark:text-gray-500 w-20 shrink-0">
                                  {c.shipped_at}
                                </span>
                                <span className="text-gray-700 dark:text-gray-300 truncate flex-1">
                                  {c.summary}
                                </span>
                                <span className="text-gray-900 dark:text-gray-100 font-semibold shrink-0">
                                  {c.actual_hours.toFixed(2)}h
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {row.estimate_basis_chain && (
                        <div className="text-[11px] text-gray-500 dark:text-gray-500">
                          Method: {row.estimate_basis_chain.method || 'baseline'}
                          {row.estimate_basis_chain.files_touched != null
                            ? ` · ${row.estimate_basis_chain.files_touched} files · +${row.estimate_basis_chain.lines_added}/-${row.estimate_basis_chain.lines_removed} lines`
                            : ''}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                <select
                  value={editState.bucket}
                  onChange={(e) =>
                    setEditing((p) => ({ ...p, [row.id]: { ...editState, bucket: e.target.value } }))
                  }
                  className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                >
                  <option value="service_contract">Service contract (counts)</option>
                  <option value="warranty">Warranty (free)</option>
                  <option value="change_order">Change order (quote)</option>
                  <option value="not_billable">Not billable (hide)</option>
                </select>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={editState.hours}
                  onChange={(e) =>
                    setEditing((p) => ({ ...p, [row.id]: { ...editState, hours: e.target.value } }))
                  }
                  className="text-xs w-20 px-2 py-1 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900"
                  placeholder="hours"
                />
                <span className="text-[11px] text-gray-500 dark:text-gray-500">hrs</span>

                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={() => act(row.id, 'skip')}
                    className="text-xs px-3 py-1.5 rounded border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    Skip
                  </button>
                  <button
                    onClick={() =>
                      act(row.id, 'approve', {
                        hours: Number(editState.hours) >= 0 ? Number(editState.hours) : undefined,
                        bucket: editState.bucket,
                      })
                    }
                    className="text-xs px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700 font-semibold"
                  >
                    Approve
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
