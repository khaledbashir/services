'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'

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
  extracted_fields: { recurring_basis?: string | null; is_recurring_signal?: boolean; manual_entry?: boolean } | null
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
  ai: 'AI', cloud: 'Cloud', domain: 'Domain', dev_tool: 'Dev tools',
  comms: 'Comms', storage: 'Storage', monitoring: 'Monitoring', other: 'Other',
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

const ALL_CATEGORIES: Category[] = ['ai', 'cloud', 'domain', 'dev_tool', 'comms', 'storage', 'monitoring', 'other']

export default function ExpensesClient() {
  const [summary, setSummary] = useState<SummaryPayload | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState<ProgressEntry[]>([])
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7))
  const [manualOpen, setManualOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState<Partial<Receipt>>({})
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
      status: 'uploading' as FileStatus,
    }))
    setProgress((prev) => [...queued, ...prev])

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
          const idx = next.findIndex((p) => p.filename === result.filename && queued.some((q) => q.id === p.id) && p.status === 'uploading')
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
    return summary.category_breakdown.map((c) => ({ ...c, pct: c.total_cents / summary.month_total_cents }))
  }, [summary])

  async function deleteReceipt(id: string) {
    if (!confirm('Delete this receipt? The PDF will be removed too.')) return
    const res = await fetch(`/api/receipts/${id}`, { method: 'DELETE' })
    if (res.ok) loadSummary(month)
    else alert('Delete failed')
  }

  function startEdit(r: Receipt) {
    setEditingId(r.id)
    setEditDraft({
      vendor_canonical: r.vendor_canonical,
      category: r.category,
      amount_cents: r.amount_cents,
      paid_at: r.paid_at,
      invoice_number: r.invoice_number,
    })
  }

  async function saveEdit() {
    if (!editingId) return
    const payload: Record<string, unknown> = {}
    if (editDraft.vendor_canonical !== undefined) payload.vendor_canonical = editDraft.vendor_canonical
    if (editDraft.category !== undefined) payload.category = editDraft.category
    if (editDraft.amount_cents !== undefined) payload.amount_cents = editDraft.amount_cents
    if (editDraft.paid_at !== undefined) payload.paid_at = editDraft.paid_at
    if (editDraft.invoice_number !== undefined) payload.invoice_number = editDraft.invoice_number
    const res = await fetch(`/api/receipts/${editingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (res.ok) {
      setEditingId(null)
      setEditDraft({})
      loadSummary(month)
    } else {
      alert('Save failed')
    }
  }

  async function submitManual(values: { vendor: string; amount: string; paid_at: string; category: Category; invoice_number: string; notes: string }) {
    const res = await fetch(`/api/receipts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vendor: values.vendor.trim(),
        amount: values.amount.trim(),
        paid_at: values.paid_at || null,
        category: values.category,
        invoice_number: values.invoice_number.trim() || null,
        notes: values.notes.trim() || null,
      }),
    })
    if (res.ok) {
      setManualOpen(false)
      loadSummary(month)
    } else {
      const e = await res.json().catch(() => ({}))
      alert(e.error || 'Could not add receipt')
    }
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto px-6 pt-8 pb-16 w-full min-w-0">
        <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
              Drop a receipt PDF or image. Vendor, amount, category, recurring vs one-off — all auto-detected.
              Use the audit pack button to ship every receipt + a CSV summary for accounting.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="text-sm border border-gray-200 dark:border-gray-800 rounded-md px-2 py-1.5 bg-white dark:bg-gray-900"
            >
              {monthsAvailable.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
            </select>
            <button
              onClick={() => setManualOpen(true)}
              className="text-sm px-3 py-1.5 rounded-md border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 font-medium"
            >
              + Add manually
            </button>
            <a
              href={`/api/receipts/audit-pack?month=${month}`}
              className="text-sm px-3 py-1.5 rounded-md bg-gray-900 text-white dark:bg-white dark:text-gray-900 font-semibold hover:opacity-90"
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
          className={`cursor-pointer border-2 border-dashed rounded-xl p-8 text-center transition-colors mb-6 ${dragging ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 bg-white dark:bg-gray-900'}`}
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
          <div className="text-base font-medium text-gray-700 dark:text-gray-300">
            Drop receipts here · or click to browse
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">
            PDF, PNG, JPG — many at once. Read by Mistral OCR, normalized by Ollama Cloud, categorized + recurring-tagged automatically.
          </div>
        </div>

        {/* Per-file progress */}
        {progress.length > 0 && (
          <div className="mb-6 space-y-1.5">
            {progress.slice(0, 16).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-sm">
                <div className="min-w-0 flex items-center gap-2">
                  <span className="truncate font-medium">{p.filename}</span>
                  {p.vendor && <span className="text-gray-500 dark:text-gray-400 truncate">→ {p.vendor}</span>}
                  {p.amount_cents !== undefined && p.amount_cents !== null && <span className="text-gray-700 dark:text-gray-300 tabular-nums">· {fmtUsd(p.amount_cents)}</span>}
                  {p.error && <span className="text-rose-600 dark:text-rose-400 truncate text-xs">· {p.error}</span>}
                </div>
                <StatusPill status={p.status} />
              </div>
            ))}
            {progress.length > 16 && <div className="text-[10px] text-gray-500 text-center">+{progress.length - 16} more processed</div>}
            <button onClick={() => setProgress([])} className="text-xs text-gray-500 hover:underline mt-1">clear progress</button>
          </div>
        )}

        {error && <div className="mb-4 text-sm text-rose-600 dark:text-rose-400">Failed to load: {error}</div>}

        {summary && (
          <>
            {/* Top stats + breakdown */}
            <div className="grid gap-4 md:grid-cols-3 mb-6">
              <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-5 bg-white dark:bg-gray-900">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Month total</div>
                <div className="text-4xl font-bold tabular-nums mt-1">{fmtUsd(summary.month_total_cents)}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {summary.receipts.length} receipt{summary.receipts.length === 1 ? '' : 's'} · {summary.vendor_rollup.length} vendor{summary.vendor_rollup.length === 1 ? '' : 's'}
                </div>
              </div>

              <div className="md:col-span-2 rounded-xl border border-gray-200 dark:border-gray-800 p-5 bg-white dark:bg-gray-900">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">By category</div>
                {categoryDonut.length === 0 ? (
                  <div className="text-xs text-gray-400 italic">Drop something above to see the breakdown.</div>
                ) : (
                  <div className="space-y-2">
                    {categoryDonut.map((c) => (
                      <div key={c.category}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className={`px-2 py-0.5 rounded ${CATEGORY_COLOR[c.category] || CATEGORY_COLOR.other}`}>
                            {CATEGORY_LABEL[c.category] || c.category}
                          </span>
                          <span className="tabular-nums text-gray-600 dark:text-gray-400">{fmtUsd(c.total_cents)} · {(c.pct * 100).toFixed(0)}%</span>
                        </div>
                        <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-gray-900 dark:bg-gray-100 rounded-full" style={{ width: `${Math.max(2, c.pct * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Missing recurring */}
            {summary.missing_recurring_vendors.length > 0 && (
              <div className="mb-4 px-4 py-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-sm">
                <div className="font-semibold text-rose-700 dark:text-rose-300 mb-1">
                  ⚠ {summary.missing_recurring_vendors.length} recurring vendor{summary.missing_recurring_vendors.length === 1 ? '' : 's'} not seen in {fmtMonth(month)}
                </div>
                <div className="text-rose-700/80 dark:text-rose-300/80 text-xs">
                  {summary.missing_recurring_vendors.map((m) => `${m.vendor} (last ${m.last_paid})`).join(' · ')}
                </div>
              </div>
            )}

            {/* Vendor cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              {summary.vendor_rollup.map((v) => (
                <div key={v.vendor} className="rounded-lg border border-gray-200 dark:border-gray-800 p-4 bg-white dark:bg-gray-900">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{v.vendor}</div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                        {v.count} receipt{v.count === 1 ? '' : 's'}{v.last_paid ? ` · last ${v.last_paid}` : ''}
                      </div>
                    </div>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${CATEGORY_COLOR[v.category || 'other']}`}>
                      {CATEGORY_LABEL[v.category || 'other']}
                    </span>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <div className="text-2xl font-bold tabular-nums">{fmtUsd(v.total_cents)}</div>
                    {v.is_recurring && <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">↻ recurring</span>}
                  </div>
                </div>
              ))}
            </div>

            {/* Receipt table with inline edit */}
            <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold">All receipts · {fmtMonth(month)}</h2>
                <span className="text-xs text-gray-500">{summary.receipts.length} row{summary.receipts.length === 1 ? '' : 's'}</span>
              </div>
              {summary.receipts.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-500 italic">
                  Nothing logged for {fmtMonth(month)} yet. Drop a receipt above or add one manually.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800 text-sm">
                  <div className="grid grid-cols-[120px_1fr_120px_140px_140px_120px] gap-3 px-4 py-2 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50">
                    <div>Paid</div>
                    <div>Vendor</div>
                    <div>Category</div>
                    <div>Invoice #</div>
                    <div className="text-right">Amount</div>
                    <div className="text-right">Actions</div>
                  </div>
                  {summary.receipts.map((r) => (
                    <div key={r.id} className="grid grid-cols-[120px_1fr_120px_140px_140px_120px] gap-3 px-4 py-2.5 items-center">
                      {editingId === r.id ? (
                        <>
                          <input
                            type="date"
                            value={editDraft.paid_at || ''}
                            onChange={(e) => setEditDraft({ ...editDraft, paid_at: e.target.value })}
                            className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900"
                          />
                          <input
                            type="text"
                            value={editDraft.vendor_canonical || ''}
                            onChange={(e) => setEditDraft({ ...editDraft, vendor_canonical: e.target.value })}
                            className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900"
                          />
                          <select
                            value={editDraft.category || 'other'}
                            onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value as Category })}
                            className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900"
                          >
                            {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                          </select>
                          <input
                            type="text"
                            value={editDraft.invoice_number || ''}
                            onChange={(e) => setEditDraft({ ...editDraft, invoice_number: e.target.value })}
                            className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900"
                          />
                          <input
                            type="number"
                            step="0.01"
                            value={editDraft.amount_cents !== null && editDraft.amount_cents !== undefined ? (editDraft.amount_cents / 100).toFixed(2) : ''}
                            onChange={(e) => setEditDraft({ ...editDraft, amount_cents: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100) })}
                            className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-right"
                          />
                          <div className="flex justify-end gap-1">
                            <button onClick={saveEdit} className="text-xs px-2 py-1 rounded bg-emerald-600 text-white">Save</button>
                            <button onClick={() => { setEditingId(null); setEditDraft({}) }} className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700">Cancel</button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-xs text-gray-600 dark:text-gray-400 tabular-nums">{r.paid_at || '—'}</div>
                          <div className="min-w-0">
                            <div className="font-medium truncate">{r.vendor_canonical || r.vendor_raw || 'Unknown'}</div>
                            {r.extracted_fields?.manual_entry && <span className="text-[10px] text-gray-400 uppercase tracking-wider">manual</span>}
                          </div>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] w-fit ${CATEGORY_COLOR[r.category || 'other']}`}>{CATEGORY_LABEL[r.category || 'other']}</span>
                          <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{r.invoice_number || '—'}</div>
                          <div className="text-right tabular-nums font-semibold">{fmtUsd(r.amount_cents)}</div>
                          <div className="flex justify-end gap-2 text-xs">
                            {!r.extracted_fields?.manual_entry && r.original_filename && (
                              <a href={`/api/receipts/${r.id}/file`} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">PDF</a>
                            )}
                            <button onClick={() => startEdit(r)} className="text-gray-600 dark:text-gray-400 hover:underline">Edit</button>
                            <button onClick={() => deleteReceipt(r.id)} className="text-rose-600 dark:text-rose-400 hover:underline">Delete</button>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {loading && !summary && <div className="mt-4 text-sm text-gray-500">Loading…</div>}

        {/* Manual entry modal */}
        {manualOpen && (
          <ManualEntryModal
            onClose={() => setManualOpen(false)}
            onSubmit={submitManual}
            defaultMonth={month}
          />
        )}
      </div>
    </DashboardLayout>
  )
}

function ManualEntryModal({ onClose, onSubmit, defaultMonth }: {
  onClose: () => void
  onSubmit: (v: { vendor: string; amount: string; paid_at: string; category: Category; invoice_number: string; notes: string }) => Promise<void>
  defaultMonth: string
}) {
  const [vendor, setVendor] = useState('')
  const [amount, setAmount] = useState('')
  const [paidAt, setPaidAt] = useState(`${defaultMonth}-01`)
  const [category, setCategory] = useState<Category>('other')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-4">Add a receipt manually</h2>
        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Vendor</label>
            <input
              autoFocus
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="OpenAI"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Amount (USD)</label>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.43"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Paid on</label>
              <input
                type="date"
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900"
              >
                {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Invoice #</label>
              <input
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="optional"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="e.g. Google Cloud, the $5.52 charge — Charlie couldn't find the receipt"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-3 py-1.5 rounded-md text-sm border border-gray-300 dark:border-gray-700">Cancel</button>
          <button
            disabled={submitting || !vendor.trim()}
            onClick={async () => {
              setSubmitting(true)
              try {
                await onSubmit({ vendor, amount, paid_at: paidAt, category, invoice_number: invoiceNumber, notes })
              } finally { setSubmitting(false) }
            }}
            className="px-3 py-1.5 rounded-md text-sm bg-gray-900 text-white dark:bg-white dark:text-gray-900 font-semibold disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}
