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
  effective_date: string | null
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

type Tab = 'dashboard' | 'files' | 'vendors'
type SortKey = 'date' | 'vendor' | 'amount' | 'category'
type SortDir = 'asc' | 'desc'

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

const ALL_CATEGORIES: Category[] = ['ai', 'cloud', 'domain', 'dev_tool', 'comms', 'storage', 'monitoring', 'other']

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
  const [tab, setTab] = useState<Tab>('dashboard')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<Set<Category>>(new Set())
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
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

  // Filter + sort applied to all receipts in this month
  const filteredReceipts = useMemo(() => {
    if (!summary) return []
    let list = summary.receipts
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((r) =>
        (r.vendor_canonical || '').toLowerCase().includes(q) ||
        (r.vendor_raw || '').toLowerCase().includes(q) ||
        (r.invoice_number || '').toLowerCase().includes(q) ||
        (r.original_filename || '').toLowerCase().includes(q)
      )
    }
    if (categoryFilter.size > 0) {
      list = list.filter((r) => r.category && categoryFilter.has(r.category as Category))
    }
    const sorted = [...list].sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'date': cmp = (a.effective_date || '').localeCompare(b.effective_date || ''); break
        case 'vendor': cmp = (a.vendor_canonical || '').localeCompare(b.vendor_canonical || ''); break
        case 'amount': cmp = (a.amount_cents || 0) - (b.amount_cents || 0); break
        case 'category': cmp = (a.category || '').localeCompare(b.category || ''); break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [summary, search, categoryFilter, sortKey, sortDir])

  const filteredTotal = useMemo(() => filteredReceipts.reduce((s, r) => s + (r.amount_cents || 0), 0), [filteredReceipts])

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

  function toggleCategory(c: Category) {
    setCategoryFilter((prev) => {
      const next = new Set(prev)
      if (next.has(c)) next.delete(c); else next.add(c)
      return next
    })
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir(k === 'date' || k === 'amount' ? 'desc' : 'asc') }
  }

  function sortIndicator(k: SortKey) {
    if (sortKey !== k) return <span className="text-gray-300 dark:text-gray-700">↕</span>
    return <span className="text-gray-900 dark:text-gray-100">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="max-w-6xl mx-auto px-6 pt-8 pb-16 w-full min-w-0">
      {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Expenses</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 max-w-2xl">
              Drop receipts, get a vendor-grouped audit pack. Vendor, amount, category, recurring vs one-off — all auto-detected.
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
          className={`cursor-pointer border-2 border-dashed rounded-xl px-6 py-5 text-center transition-colors mb-4 ${dragging ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40' : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600 bg-white dark:bg-gray-900'}`}
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
            PDF, PNG, JPG — many at once.
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
            <button onClick={() => setProgress([])} className="text-xs text-gray-500 hover:underline mt-1">clear progress</button>
          </div>
        )}

        {error && <div className="mb-4 text-sm text-rose-600 dark:text-rose-400">Failed to load: {error}</div>}

        {/* KPI strip — always visible */}
        {summary && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <KpiCard label="Month total" value={fmtUsd(summary.month_total_cents)} sub={`${summary.receipts.length} receipt${summary.receipts.length === 1 ? '' : 's'}`} />
            <KpiCard label="Vendors" value={String(summary.vendor_rollup.length)} sub={`${summary.vendor_rollup.filter((v) => v.is_recurring).length} recurring`} />
            <KpiCard label="Categories" value={String(summary.category_breakdown.length)} sub={summary.category_breakdown[0]?.category ? `top: ${CATEGORY_LABEL[summary.category_breakdown[0].category]}` : '—'} />
            <KpiCard
              label="Missing recurring"
              value={String(summary.missing_recurring_vendors.length)}
              sub={summary.missing_recurring_vendors[0]?.vendor || 'none'}
              tone={summary.missing_recurring_vendors.length > 0 ? 'rose' : 'gray'}
            />
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-800 mb-4 flex gap-1">
          <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')}>Dashboard</TabButton>
          <TabButton active={tab === 'files'} onClick={() => setTab('files')}>
            Files <span className="ml-1 text-[10px] text-gray-500">{summary?.receipts.length ?? 0}</span>
          </TabButton>
          <TabButton active={tab === 'vendors'} onClick={() => setTab('vendors')}>
            Vendors <span className="ml-1 text-[10px] text-gray-500">{summary?.vendor_rollup.length ?? 0}</span>
          </TabButton>
        </div>

        {/* Tab body */}
        {summary && tab === 'dashboard' && (
          <DashboardTab summary={summary} categoryDonut={categoryDonut} />
        )}

        {summary && tab === 'files' && (
          <FilesTab
            receipts={filteredReceipts}
            filteredTotal={filteredTotal}
            allReceiptsCount={summary.receipts.length}
            search={search}
            setSearch={setSearch}
            categoryFilter={categoryFilter}
            toggleCategory={toggleCategory}
            clearFilters={() => { setSearch(''); setCategoryFilter(new Set()) }}
            sortKey={sortKey}
            sortDir={sortDir}
            toggleSort={toggleSort}
            sortIndicator={sortIndicator}
            editingId={editingId}
            editDraft={editDraft}
            setEditDraft={setEditDraft}
            startEdit={startEdit}
            saveEdit={saveEdit}
            cancelEdit={() => { setEditingId(null); setEditDraft({}) }}
            deleteReceipt={deleteReceipt}
          />
        )}

        {summary && tab === 'vendors' && (
          <VendorsTab summary={summary} setSearch={setSearch} setTab={setTab} />
        )}

        {loading && !summary && <div className="mt-4 text-sm text-gray-500">Loading…</div>}

        {manualOpen && (
        <ManualEntryModal
          onClose={() => setManualOpen(false)}
          onSubmit={submitManual}
          defaultMonth={month}
        />
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-gray-900 dark:border-gray-100 text-gray-900 dark:text-gray-100'
          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
      }`}
    >
      {children}
    </button>
  )
}

function KpiCard({ label, value, sub, tone = 'gray' }: { label: string; value: string; sub: string; tone?: 'gray' | 'rose' }) {
  const toneClasses = tone === 'rose'
    ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/40'
    : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800'
  return (
    <div className={`rounded-lg border p-3 ${toneClasses}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-0.5">{value}</div>
      <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">{sub}</div>
    </div>
  )
}

function DashboardTab({ summary, categoryDonut }: {
  summary: SummaryPayload
  categoryDonut: Array<{ category: string; total_cents: number; pct: number }>
}) {
  return (
    <div className="space-y-4">
      {/* Category breakdown */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-5 bg-white dark:bg-gray-900">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">By category</div>
        {categoryDonut.length === 0 ? (
          <div className="text-xs text-gray-400 italic">Drop a receipt above to see the breakdown.</div>
        ) : (
          <div className="space-y-2.5">
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

      {/* Missing recurring */}
      {summary.missing_recurring_vendors.length > 0 && (
        <div className="px-4 py-3 rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-sm">
          <div className="font-semibold text-rose-700 dark:text-rose-300 mb-1">
            ⚠ {summary.missing_recurring_vendors.length} recurring vendor{summary.missing_recurring_vendors.length === 1 ? '' : 's'} not seen this month
          </div>
          <div className="text-rose-700/80 dark:text-rose-300/80 text-xs">
            {summary.missing_recurring_vendors.map((m) => `${m.vendor} (last ${m.last_paid})`).join(' · ')}
          </div>
        </div>
      )}

      {/* Top vendors */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-5 bg-white dark:bg-gray-900">
        <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">Top vendors</div>
        {summary.vendor_rollup.length === 0 ? (
          <div className="text-xs text-gray-400 italic">No vendors yet.</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {summary.vendor_rollup.slice(0, 9).map((v) => (
              <div key={v.vendor} className="rounded-lg border border-gray-200 dark:border-gray-800 p-3 bg-gray-50/40 dark:bg-gray-900/40">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate text-sm">{v.vendor}</div>
                    <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                      {v.count}× · last {v.last_paid || '—'}
                    </div>
                  </div>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${CATEGORY_COLOR[v.category || 'other']}`}>
                    {CATEGORY_LABEL[v.category || 'other']}
                  </span>
                </div>
                <div className="mt-2 flex items-end justify-between gap-2">
                  <div className="text-xl font-bold tabular-nums">{fmtUsd(v.total_cents)}</div>
                  {v.is_recurring && <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">↻</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FilesTab({
  receipts, filteredTotal, allReceiptsCount,
  search, setSearch, categoryFilter, toggleCategory, clearFilters,
  sortKey, sortDir, toggleSort, sortIndicator,
  editingId, editDraft, setEditDraft, startEdit, saveEdit, cancelEdit, deleteReceipt,
}: {
  receipts: Receipt[]
  filteredTotal: number
  allReceiptsCount: number
  search: string
  setSearch: (s: string) => void
  categoryFilter: Set<Category>
  toggleCategory: (c: Category) => void
  clearFilters: () => void
  sortKey: SortKey
  sortDir: SortDir
  toggleSort: (k: SortKey) => void
  sortIndicator: (k: SortKey) => React.ReactNode
  editingId: string | null
  editDraft: Partial<Receipt>
  setEditDraft: (d: Partial<Receipt>) => void
  startEdit: (r: Receipt) => void
  saveEdit: () => Promise<void>
  cancelEdit: () => void
  deleteReceipt: (id: string) => Promise<void>
}) {
  const hasFilter = search || categoryFilter.size > 0
  return (
    <div className="space-y-3">
      {/* Filter strip */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendor, invoice #, filename…"
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900"
          />
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">⌕</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {ALL_CATEGORIES.map((c) => {
            const active = categoryFilter.has(c)
            return (
              <button
                key={c}
                onClick={() => toggleCategory(c)}
                className={`px-2 py-1 rounded text-[10px] font-semibold transition-all ${
                  active
                    ? CATEGORY_COLOR[c] + ' ring-2 ring-offset-1 ring-gray-900 dark:ring-gray-100 dark:ring-offset-gray-900'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                }`}
              >
                {CATEGORY_LABEL[c]}
              </button>
            )
          })}
        </div>
        {hasFilter && (
          <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-gray-700 underline">Clear</button>
        )}
      </div>

      {/* Filter summary */}
      {hasFilter && (
        <div className="text-xs text-gray-600 dark:text-gray-400">
          Showing {receipts.length} of {allReceiptsCount} · subtotal <span className="font-semibold tabular-nums">{fmtUsd(filteredTotal)}</span>
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
        {receipts.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-gray-500 italic">
            {hasFilter ? 'No receipts match the filter.' : 'No receipts logged yet for this month. Drop a file above or use “Add manually”.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/50 text-[10px] uppercase tracking-wider font-semibold text-gray-500 dark:text-gray-400">
              <tr>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={() => toggleSort('date')}>
                  <div className="flex items-center gap-1">Paid {sortIndicator('date')}</div>
                </th>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={() => toggleSort('vendor')}>
                  <div className="flex items-center gap-1">Vendor {sortIndicator('vendor')}</div>
                </th>
                <th className="text-left px-3 py-2 cursor-pointer" onClick={() => toggleSort('category')}>
                  <div className="flex items-center gap-1">Category {sortIndicator('category')}</div>
                </th>
                <th className="text-left px-3 py-2">Invoice #</th>
                <th className="text-right px-3 py-2 cursor-pointer" onClick={() => toggleSort('amount')}>
                  <div className="flex items-center justify-end gap-1">Amount {sortIndicator('amount')}</div>
                </th>
                <th className="text-right px-3 py-2 w-[140px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {receipts.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-900/30">
                  {editingId === r.id ? (
                    <>
                      <td className="px-3 py-1.5">
                        <input
                          type="date"
                          value={editDraft.paid_at || ''}
                          onChange={(e) => setEditDraft({ ...editDraft, paid_at: e.target.value })}
                          className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 w-[130px]"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={editDraft.vendor_canonical || ''}
                          onChange={(e) => setEditDraft({ ...editDraft, vendor_canonical: e.target.value })}
                          className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 w-full"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={editDraft.category || 'other'}
                          onChange={(e) => setEditDraft({ ...editDraft, category: e.target.value as Category })}
                          className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900"
                        >
                          {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="text"
                          value={editDraft.invoice_number || ''}
                          onChange={(e) => setEditDraft({ ...editDraft, invoice_number: e.target.value })}
                          className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 w-full"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={editDraft.amount_cents !== null && editDraft.amount_cents !== undefined ? (editDraft.amount_cents / 100).toFixed(2) : ''}
                          onChange={(e) => setEditDraft({ ...editDraft, amount_cents: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100) })}
                          className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-900 text-right w-[100px]"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={saveEdit} className="text-xs px-2 py-1 rounded bg-emerald-600 text-white">Save</button>
                          <button onClick={cancelEdit} className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700">Cancel</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2 text-xs text-gray-600 dark:text-gray-400 tabular-nums whitespace-nowrap">
                        {r.effective_date || '—'}
                        {!r.paid_at && <span className="ml-1 text-[9px] text-amber-600 dark:text-amber-400" title="Paid date wasn't on the receipt — using upload date">est</span>}
                      </td>
                      <td className="px-3 py-2 min-w-0">
                        <div className="font-medium truncate max-w-[280px]">
                          {r.vendor_canonical || r.vendor_raw || 'Unknown'}
                          {r.extracted_fields?.manual_entry && <span className="ml-2 text-[9px] text-gray-400 uppercase tracking-wider">manual</span>}
                        </div>
                        {r.original_filename && <div className="text-[10px] text-gray-400 truncate max-w-[280px]">{r.original_filename}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${CATEGORY_COLOR[r.category || 'other']}`}>
                          {CATEGORY_LABEL[r.category || 'other']}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 truncate max-w-[140px]">
                        {r.invoice_number || '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold whitespace-nowrap">
                        {fmtUsd(r.amount_cents)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex justify-end gap-2 text-xs">
                          {!r.extracted_fields?.manual_entry && r.original_filename && (
                            <a href={`/api/receipts/${r.id}/file`} target="_blank" rel="noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">PDF</a>
                          )}
                          <button onClick={() => startEdit(r)} className="text-gray-600 dark:text-gray-400 hover:underline">Edit</button>
                          <button onClick={() => deleteReceipt(r.id)} className="text-rose-600 dark:text-rose-400 hover:underline">Delete</button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 dark:bg-gray-900/50 text-xs font-semibold">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-right text-gray-500">
                  {hasFilter ? 'Filtered subtotal' : 'Total'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtUsd(filteredTotal)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  )
}

function VendorsTab({ summary, setSearch, setTab }: {
  summary: SummaryPayload
  setSearch: (s: string) => void
  setTab: (t: Tab) => void
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {summary.vendor_rollup.map((v) => (
          <button
            key={v.vendor}
            onClick={() => { setSearch(v.vendor); setTab('files') }}
            className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 text-left hover:border-gray-400 dark:hover:border-gray-600 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold truncate">{v.vendor}</div>
                <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                  {v.count} receipt{v.count === 1 ? '' : 's'} · last {v.last_paid || '—'}
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
          </button>
        ))}
      </div>
      {summary.vendor_rollup.length === 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-12 text-center text-sm text-gray-500 italic">
          No vendors logged yet.
        </div>
      )}
    </div>
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
              placeholder="e.g. Google Cloud, the $5.52 charge"
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
