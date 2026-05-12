'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Category = 'ai' | 'cloud' | 'domain' | 'dev_tool' | 'comms' | 'storage' | 'monitoring' | 'other'

interface Receipt {
  id: string
  vendor_raw: string | null
  vendor_canonical: string | null
  category: Category | null
  amount_cents: number | null
  currency: string
  period_start: string | null
  period_end: string | null
  invoice_number: string | null
  paid_at: string | null
  original_filename: string | null
  extractor_confidence: number | null
  extractor_provider: string | null
  reasoner_model: string | null
  extracted_fields: { recurring_basis?: string | null; is_recurring_signal?: boolean } | null
  is_recurring: boolean
  created_at: string
}

interface VendorRollup {
  vendor: string
  category: string | null
  total_cents: number
  count: number
  is_recurring: boolean
  missing_this_month: boolean
  last_paid: string | null
}

interface MissingVendor {
  vendor: string
  category: string | null
  last_paid: string | null
}

interface SummaryPayload {
  month: string
  month_total_cents: number
  receipts: Receipt[]
  vendor_rollup: VendorRollup[]
  category_breakdown: Array<{ category: string; total_cents: number }>
  missing_recurring_vendors: MissingVendor[]
}

type FileStatus = 'queued' | 'uploading' | 'processing' | 'done' | 'duplicate' | 'failed'

interface ProgressEntry {
  id: string
  filename: string
  status: FileStatus
  error?: string
  vendor?: string
  amount_cents?: number | null
}

const CATEGORY_LABEL: Record<string, string> = {
  ai: 'AI',
  cloud: 'Cloud',
  domain: 'Domain',
  dev_tool: 'Dev tools',
  comms: 'Comms',
  storage: 'Storage',
  monitoring: 'Monitoring',
  other: 'Other',
}

const CATEGORY_COLOR: Record<string, string> = {
  ai: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  cloud: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  domain: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  dev_tool: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  comms: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  storage: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  monitoring: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
}

function fmtUsd(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtMonth(month: string): string {
  if (!/^\d{4}-\d{2}$/.test(month)) return month
  const d = new Date(month + '-01T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

function StatusPill({ status }: { status: FileStatus }) {
  const tone =
    status === 'done' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    : status === 'duplicate' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
    : status === 'failed' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${tone}`}>{status}</span>
}

export default function Receipts() {
  const [summary, setSummary] = useState<SummaryPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<ProgressEntry[]>([])
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7))
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const dragCounter = useRef(0)

  const loadSummary = useCallback(async (m: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/receipts?month=${m}`, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSummary(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadSummary(month) }, [month, loadSummary])

  const handleFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return

    const queued: ProgressEntry[] = files.map((f) => ({
      id: crypto.randomUUID(),
      filename: f.name,
      status: 'queued' as FileStatus,
    }))
    setProgress((prev) => [...queued, ...prev])

    // Mark all uploading
    setProgress((prev) => prev.map((p) => queued.find((q) => q.id === p.id) ? { ...p, status: 'uploading' as FileStatus } : p))

    const formData = new FormData()
    for (const f of files) formData.append('files', f)

    try {
      const res = await fetch('/api/receipts/upload', { method: 'POST', body: formData })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || `HTTP ${res.status}`)
      }
      const data = await res.json() as { results: Array<{ filename: string; status: 'ok' | 'duplicate' | 'failed'; vendor?: string; amount_cents?: number | null; error?: string }> }
      setProgress((prev) => {
        const next = [...prev]
        for (const result of data.results) {
          const idx = next.findIndex((p) => p.filename === result.filename && (queued.some((q) => q.id === p.id)) && (p.status === 'uploading' || p.status === 'processing'))
          if (idx === -1) continue
          next[idx] = {
            ...next[idx],
            status: result.status === 'ok' ? 'done' : result.status === 'duplicate' ? 'duplicate' : 'failed',
            error: result.error,
            vendor: result.vendor,
            amount_cents: result.amount_cents,
          }
        }
        return next
      })
      await loadSummary(month)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed'
      setProgress((prev) => prev.map((p) => queued.find((q) => q.id === p.id) ? { ...p, status: 'failed' as FileStatus, error: message } : p))
    }
  }, [month, loadSummary])

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragging(false)
    dragCounter.current = 0
    const files = Array.from(e.dataTransfer.files).filter((f) => f.size > 0)
    handleFiles(files)
  }, [handleFiles])

  const monthsAvailable = useMemo(() => {
    const now = new Date()
    const list: string[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      list.push(d.toISOString().slice(0, 7))
    }
    return list
  }, [])

  const categoryDonut = useMemo(() => {
    if (!summary || summary.month_total_cents === 0) return []
    return summary.category_breakdown.map((c) => ({
      ...c,
      pct: c.total_cents / summary.month_total_cents,
    }))
  }, [summary])

  return (
    <section id="receipts" className="scroll-mt-32 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm hover:shadow-md transition-shadow mb-4">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Operational expenses · {fmtMonth(month)}
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Drop a receipt, it reads itself. Vendor, amount, category, recurring vs one-off — all auto-detected. Audit pack one click away.
          </p>
        </div>
        <div className="flex items-center gap-2" data-no-print="true">
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="text-xs border border-gray-200 dark:border-gray-800 rounded-md px-2 py-1 bg-white dark:bg-gray-900"
          >
            {monthsAvailable.map((m) => (
              <option key={m} value={m}>{fmtMonth(m)}</option>
            ))}
          </select>
          <a
            href={`/api/receipts/audit-pack?month=${month}`}
            className="text-xs px-2.5 py-1 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 font-semibold hover:opacity-90"
          >
            Audit pack ↓
          </a>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDragEnter={(e) => { e.preventDefault(); dragCounter.current += 1; setDragging(true) }}
        onDragLeave={(e) => { e.preventDefault(); dragCounter.current -= 1; if (dragCounter.current <= 0) { setDragging(false); dragCounter.current = 0 } }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`cursor-pointer border-2 border-dashed rounded-xl p-6 text-center transition-colors ${dragging ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'}`}
        data-no-print="true"
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files || [])
            handleFiles(files)
            if (fileInputRef.current) fileInputRef.current.value = ''
          }}
        />
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Drop receipts here · or click to browse
        </div>
        <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
          PDF, PNG, JPG — multiple files OK. Read by Mistral OCR, normalized by Ollama Cloud, categorized + recurring-tagged automatically.
        </div>
      </div>

      {/* Per-file progress */}
      {progress.length > 0 && (
        <div className="mt-4 space-y-1.5" data-no-print="true">
          {progress.slice(0, 12).map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-gray-50 dark:bg-gray-800/40 text-xs">
              <div className="min-w-0 flex items-center gap-2">
                <span className="truncate font-medium">{p.filename}</span>
                {p.vendor && <span className="text-gray-500 dark:text-gray-400 truncate">→ {p.vendor}</span>}
                {p.amount_cents !== undefined && p.amount_cents !== null && <span className="text-gray-700 dark:text-gray-300 tabular-nums">· {fmtUsd(p.amount_cents)}</span>}
                {p.error && <span className="text-rose-600 dark:text-rose-400 truncate">· {p.error}</span>}
              </div>
              <StatusPill status={p.status} />
            </div>
          ))}
          {progress.length > 12 && <div className="text-[10px] text-gray-500 text-center">+{progress.length - 12} more processed</div>}
        </div>
      )}

      {/* Summary block */}
      {error && <div className="mt-4 text-xs text-rose-600 dark:text-rose-400">Failed to load: {error}</div>}

      {summary && (
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {/* Month total card */}
          <div className="md:col-span-1 rounded-xl border border-gray-200 dark:border-gray-800 p-4 bg-gray-50/50 dark:bg-gray-900/50">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Month total
            </div>
            <div className="text-3xl font-bold tabular-nums mt-1">
              {fmtUsd(summary.month_total_cents)}
            </div>
            <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
              {summary.receipts.length} receipt{summary.receipts.length === 1 ? '' : 's'} · {summary.vendor_rollup.length} vendor{summary.vendor_rollup.length === 1 ? '' : 's'}
            </div>

            {/* Category breakdown bars */}
            {categoryDonut.length > 0 && (
              <div className="mt-4 space-y-2">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">By category</div>
                {categoryDonut.map((c) => (
                  <div key={c.category}>
                    <div className="flex items-center justify-between text-[11px] mb-0.5">
                      <span className={`px-1.5 py-0.5 rounded ${CATEGORY_COLOR[c.category] || CATEGORY_COLOR.other}`}>
                        {CATEGORY_LABEL[c.category] || c.category}
                      </span>
                      <span className="tabular-nums text-gray-600 dark:text-gray-400">{fmtUsd(c.total_cents)}</span>
                    </div>
                    <div className="h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full bg-gray-900 dark:bg-gray-100 rounded-full" style={{ width: `${Math.max(2, c.pct * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Vendor cards */}
          <div className="md:col-span-2">
            {summary.missing_recurring_vendors.length > 0 && (
              <div className="mb-3 px-3 py-2 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-xs">
                <div className="font-semibold text-rose-700 dark:text-rose-300 mb-0.5">
                  ⚠ {summary.missing_recurring_vendors.length} recurring vendor{summary.missing_recurring_vendors.length === 1 ? '' : 's'} missing this month
                </div>
                <div className="text-rose-700/80 dark:text-rose-300/80">
                  {summary.missing_recurring_vendors.map((m) => `${m.vendor} (last paid ${m.last_paid})`).join(' · ')}
                </div>
              </div>
            )}

            {summary.vendor_rollup.length === 0 ? (
              <div className="text-xs text-gray-500 dark:text-gray-400 italic">
                No receipts yet for {fmtMonth(month)}. Drop something above to start.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {summary.vendor_rollup.map((v) => (
                  <div key={v.vendor} className="border border-gray-200 dark:border-gray-800 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">{v.vendor}</div>
                        <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                          {v.count} receipt{v.count === 1 ? '' : 's'}{v.last_paid ? ` · last ${v.last_paid}` : ''}
                        </div>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${CATEGORY_COLOR[v.category || 'other']}`}>
                        {CATEGORY_LABEL[v.category || 'other']}
                      </span>
                    </div>
                    <div className="mt-2 flex items-end justify-between gap-2">
                      <div className="text-xl font-bold tabular-nums">{fmtUsd(v.total_cents)}</div>
                      {v.is_recurring && <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">↻ recurring</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Raw receipt list (collapsed) */}
      {summary && summary.receipts.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-xs font-semibold text-gray-700 dark:text-gray-300">
            All {summary.receipts.length} receipts for {fmtMonth(month)}
          </summary>
          <div className="mt-3 divide-y divide-gray-100 dark:divide-gray-800 text-xs">
            {summary.receipts.map((r) => (
              <div key={r.id} className="grid grid-cols-[1fr_auto] gap-3 py-2 items-center">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {r.vendor_canonical || r.vendor_raw || r.original_filename || 'Unknown vendor'}
                    {r.invoice_number && <span className="text-gray-400 ml-2">#{r.invoice_number}</span>}
                  </div>
                  <div className="text-[10px] text-gray-500 dark:text-gray-400">
                    {r.paid_at || '?'} · {CATEGORY_LABEL[r.category || 'other']}
                    {r.extractor_confidence !== null && r.extractor_confidence < 0.6 && <span className="text-amber-600 dark:text-amber-400 ml-2">low confidence</span>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums font-semibold whitespace-nowrap">{fmtUsd(r.amount_cents)}</span>
                  <a href={`/api/receipts/${r.id}/file`} target="_blank" rel="noreferrer" className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline">PDF</a>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {loading && !summary && <div className="mt-4 text-xs text-gray-500">Loading…</div>}
    </section>
  )
}
