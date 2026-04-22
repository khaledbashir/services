'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { useAuth } from '@/lib/useAuth'

interface ClientOption {
  id: string
  name: string
}

interface PrintRequestRecord {
  id: string
  client_id: string | null
  client_name: string | null
  print_client_id: string | null
  job_title: string
  status: string
  shipping_address: string | null
  ship_date: string | null
  arrival_date: string | null
  invoice_amount: number | null
  notes: string | null
  proof_links: string[]
  tracking_number: string | null
  created_at: string
  updated_at: string
}

type ViewMode = 'list' | 'kanban'

const STATUS_COLUMNS = [
  { key: 'new_job', label: 'New Job', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  { key: 'awaiting_layout', label: 'Awaiting Layout', tone: 'bg-violet-50 text-violet-700 border-violet-200' },
  { key: 'awaiting_approval', label: 'Awaiting Approval', tone: 'bg-amber-50 text-amber-700 border-amber-200' },
  { key: 'approved', label: 'Approved', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { key: 'in_production', label: 'In Production', tone: 'bg-orange-50 text-orange-700 border-orange-200' },
  { key: 'shipped', label: 'Shipped', tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  { key: 'invoiced', label: 'Invoiced', tone: 'bg-zinc-100 text-zinc-700 border-zinc-200' },
] as const

const EMPTY_FORM = {
  client_id: '',
  client_name: '',
  job_title: '',
  status: 'new_job',
  shipping_address: '',
  ship_date: '',
  arrival_date: '',
  invoice_amount: '',
  notes: '',
  proof_links: '',
  tracking_number: '',
}

function formatShortDate(value: string | null) {
  if (!value) return '—'
  try {
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return value
  }
}

function formatMoney(value: number | null) {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(value)
}

export default function PrintRequestsPage() {
  const auth = useAuth('manager')
  const { showToast } = useToast()

  const [records, setRecords] = useState<PrintRequestRecord[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<ViewMode>('list')
  const [clientFilter, setClientFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const fetchData = async (selectedClientId = clientFilter) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedClientId && selectedClientId !== 'all') params.set('client_id', selectedClientId)

      const [printRes, clientsRes] = await Promise.all([
        fetch(`/api/print-requests${params.toString() ? `?${params.toString()}` : ''}`),
        fetch('/api/clients'),
      ])

      const [printJson, clientsJson] = await Promise.all([printRes.json(), clientsRes.json()])
      setRecords(printJson.print_requests || [])
      setClients(clientsJson.clients || [])
    } catch {
      showToast('Failed to load print requests', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData(clientFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientFilter])

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return records
    return records.filter((record) => {
      return (
        record.job_title.toLowerCase().includes(q) ||
        (record.client_name || '').toLowerCase().includes(q) ||
        (record.shipping_address || '').toLowerCase().includes(q) ||
        (record.notes || '').toLowerCase().includes(q) ||
        (record.tracking_number || '').toLowerCase().includes(q)
      )
    })
  }, [records, search])

  const counts = useMemo(() => {
    const base: Record<string, number> = { all: records.length, active: records.filter((record) => record.status !== 'invoiced').length }
    for (const column of STATUS_COLUMNS) {
      base[column.key] = records.filter((record) => record.status === column.key).length
    }
    return base
  }, [records])

  const grouped = useMemo(
    () =>
      STATUS_COLUMNS.map((column) => ({
        ...column,
        items: filteredRecords.filter((record) => record.status === column.key),
      })),
    [filteredRecords],
  )

  function resetForm() {
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  function openCreate() {
    resetForm()
    setModalOpen(true)
  }

  function openEdit(record: PrintRequestRecord) {
    setEditingId(record.id)
    setForm({
      client_id: record.client_id || '',
      client_name: record.client_name || '',
      job_title: record.job_title,
      status: record.status,
      shipping_address: record.shipping_address || '',
      ship_date: record.ship_date ? record.ship_date.slice(0, 10) : '',
      arrival_date: record.arrival_date ? record.arrival_date.slice(0, 10) : '',
      invoice_amount: record.invoice_amount == null ? '' : String(record.invoice_amount),
      notes: record.notes || '',
      proof_links: (record.proof_links || []).join('\n'),
      tracking_number: record.tracking_number || '',
    })
    setModalOpen(true)
  }

  function handleClientChange(clientId: string) {
    const client = clients.find((item) => item.id === clientId)
    setForm((current) => ({
      ...current,
      client_id: clientId,
      client_name: client?.name || '',
    }))
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form.job_title.trim()) {
      showToast('Job title is required', 'error')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        client_id: form.client_id || null,
        client_name: form.client_name || null,
        job_title: form.job_title.trim(),
        status: form.status,
        shipping_address: form.shipping_address.trim() || null,
        ship_date: form.ship_date || null,
        arrival_date: form.arrival_date || null,
        invoice_amount: form.invoice_amount === '' ? null : Number(form.invoice_amount),
        notes: form.notes.trim() || null,
        proof_links: form.proof_links,
        tracking_number: form.tracking_number.trim() || null,
      }

      const response = await fetch(editingId ? `/api/print-requests/${editingId}` : '/api/print-requests', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        showToast(json.error || 'Unable to save print request', 'error')
        return
      }

      showToast(editingId ? 'Print request updated' : 'Print request created', 'success')
      setModalOpen(false)
      resetForm()
      await fetchData(clientFilter)
    } catch {
      showToast('Unable to save print request', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete() {
    if (!editingId) return
    if (!confirm('Delete this print request?')) return

    setDeleting(true)
    try {
      const response = await fetch(`/api/print-requests/${editingId}`, { method: 'DELETE' })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        showToast(json.error || 'Unable to delete print request', 'error')
        return
      }

      showToast('Print request deleted', 'success')
      setModalOpen(false)
      resetForm()
      await fetchData(clientFilter)
    } catch {
      showToast('Unable to delete print request', 'error')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="rounded-2xl border border-[#D9E4FF] bg-gradient-to-br from-[#F8FBFF] via-white to-[#EEF4FF] p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0A52EF]">Operations</div>
              <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Print Requests</h1>
              <p className="mt-1 text-sm text-zinc-500">
                {counts.active || 0} active requests across the Britain production pipeline.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <a
                href="/api/print-requests/export?format=csv"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl bg-white border border-[#E6ECF5] px-4 py-2.5 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 hover:text-zinc-900"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
              </a>
              <div className="inline-flex rounded-xl border border-[#D9E4FF] bg-white p-1 shadow-sm">
                <button
                  onClick={() => setView('list')}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${view === 'list' ? 'bg-[#0A52EF] text-white' : 'text-zinc-600 hover:text-zinc-900'}`}
                >
                  List View
                </button>
                <button
                  onClick={() => setView('kanban')}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${view === 'kanban' ? 'bg-[#0A52EF] text-white' : 'text-zinc-600 hover:text-zinc-900'}`}
                >
                  Kanban
                </button>
              </div>

              <button
                onClick={openCreate}
                className="rounded-xl bg-[#0A52EF] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#0840C0]"
              >
                New Print Request
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E6ECF5] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search print requests, clients, notes, tracking..."
                className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] py-2.5 pl-10 pr-4 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
              />
            </div>

            <select
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
              className="rounded-xl border border-[#E6ECF5] bg-white px-3 py-2.5 text-sm text-zinc-700 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
            >
              <option value="all">All Clients</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading || !auth.loaded ? (
          <div className="space-y-4">
            <Skeleton className="h-20 w-full rounded-2xl" />
            <Skeleton className="h-96 w-full rounded-2xl" />
          </div>
        ) : view === 'list' ? (
          filteredRecords.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#D9E4FF] bg-white p-16 text-center shadow-sm">
              <p className="text-sm font-medium text-zinc-900">No print requests match this filter.</p>
              <p className="mt-1 text-sm text-zinc-500">Try another client or create a new print request.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-[#E6ECF5] bg-white shadow-sm">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-[#E6ECF5] bg-[#F8FBFF]">
                    <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Job</th>
                    <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Client</th>
                    <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Status</th>
                    <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Ship</th>
                    <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Arrival</th>
                    <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Invoice</th>
                    <th className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Proofs</th>
                    <th className="px-6 py-4 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((record) => {
                    const statusMeta = STATUS_COLUMNS.find((column) => column.key === record.status) || STATUS_COLUMNS[0]
                    return (
                      <tr key={record.id} className="cursor-pointer border-b border-[#EEF2F7] transition hover:bg-[#FAFCFF]" onClick={() => openEdit(record)}>
                        <td className="px-6 py-4">
                          <div className="font-medium text-zinc-950">{record.job_title}</div>
                          <div className="mt-1 line-clamp-1 text-xs text-zinc-500">{record.shipping_address || 'No shipping address yet'}</div>
                        </td>
                        <td className="px-6 py-4 text-zinc-700">{record.client_name || 'Unlinked'}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusMeta.tone}`}>
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-zinc-600">{formatShortDate(record.ship_date)}</td>
                        <td className="px-6 py-4 text-zinc-600">{formatShortDate(record.arrival_date)}</td>
                        <td className="px-6 py-4 text-zinc-900">{formatMoney(record.invoice_amount)}</td>
                        <td className="px-6 py-4 text-zinc-600">{record.proof_links.length}</td>
                        <td className="px-6 py-4 text-right text-zinc-500">{formatShortDate(record.updated_at)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="grid gap-4 xl:grid-cols-4 2xl:grid-cols-7">
            {grouped.map((column) => (
              <div key={column.key} className="rounded-2xl border border-[#E6ECF5] bg-white shadow-sm">
                <div className="border-b border-[#EEF2F7] px-4 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${column.tone}`}>{column.label}</span>
                    <span className="text-xs font-semibold text-zinc-500">{column.items.length}</span>
                  </div>
                </div>
                <div className="space-y-3 p-3">
                  {column.items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-[#D9E4FF] bg-[#FBFDFF] p-4 text-center text-xs text-zinc-400">
                      No requests
                    </div>
                  ) : (
                    column.items.map((record) => (
                      <button
                        key={record.id}
                        onClick={() => openEdit(record)}
                        className="w-full rounded-xl border border-[#E6ECF5] bg-[#FCFDFF] p-4 text-left transition hover:border-[#0A52EF]/40 hover:shadow-sm"
                      >
                        <div className="text-sm font-semibold text-zinc-950">{record.job_title}</div>
                        <div className="mt-1 text-xs text-zinc-500">{record.client_name || 'Unlinked client'}</div>
                        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                          <span>Ship {formatShortDate(record.ship_date)}</span>
                          <span>{record.proof_links.length} proof{record.proof_links.length === 1 ? '' : 's'}</span>
                        </div>
                        <div className="mt-3 text-xs font-medium text-zinc-700">{formatMoney(record.invoice_amount)}</div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-[2px]">
            <div className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-[28px] border border-[#D9E4FF] bg-white shadow-2xl">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E6ECF5] bg-white/95 px-6 py-5 backdrop-blur">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0A52EF]">
                    {editingId ? 'Edit Request' : 'Create Request'}
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-zinc-950">
                    {editingId ? 'Update print request' : 'New print request'}
                  </h2>
                </div>
                <button onClick={() => setModalOpen(false)} className="rounded-full p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6 px-6 py-6">
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Job Title</label>
                    <input
                      type="text"
                      value={form.job_title}
                      onChange={(event) => setForm((current) => ({ ...current, job_title: event.target.value }))}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                      required
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Client</label>
                    <select
                      value={form.client_id}
                      onChange={(event) => handleClientChange(event.target.value)}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-white px-4 py-3 text-sm text-zinc-700 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    >
                      <option value="">Select client...</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Status</label>
                    <select
                      value={form.status}
                      onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-white px-4 py-3 text-sm text-zinc-700 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    >
                      {STATUS_COLUMNS.map((column) => (
                        <option key={column.key} value={column.key}>
                          {column.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Shipping Address</label>
                    <textarea
                      value={form.shipping_address}
                      onChange={(event) => setForm((current) => ({ ...current, shipping_address: event.target.value }))}
                      rows={3}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Ship Date</label>
                    <input
                      type="date"
                      value={form.ship_date}
                      onChange={(event) => setForm((current) => ({ ...current, ship_date: event.target.value }))}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Arrival Date</label>
                    <input
                      type="date"
                      value={form.arrival_date}
                      onChange={(event) => setForm((current) => ({ ...current, arrival_date: event.target.value }))}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Invoice Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.invoice_amount}
                      onChange={(event) => setForm((current) => ({ ...current, invoice_amount: event.target.value }))}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Tracking Number</label>
                    <input
                      type="text"
                      value={form.tracking_number}
                      onChange={(event) => setForm((current) => ({ ...current, tracking_number: event.target.value }))}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Notes</label>
                    <textarea
                      value={form.notes}
                      onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                      rows={5}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Proof Links</label>
                    <textarea
                      value={form.proof_links}
                      onChange={(event) => setForm((current) => ({ ...current, proof_links: event.target.value }))}
                      rows={4}
                      placeholder="One URL per line"
                      className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-3 border-t border-[#E6ECF5] pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    {editingId && auth.isTechSupport && (
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-50"
                      >
                        {deleting ? 'Deleting...' : 'Delete Request'}
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setModalOpen(false)}
                      className="rounded-xl border border-[#E6ECF5] bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="rounded-xl bg-[#0A52EF] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#0840C0] disabled:opacity-50"
                    >
                      {submitting ? (editingId ? 'Saving...' : 'Creating...') : editingId ? 'Save Changes' : 'Create Request'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
