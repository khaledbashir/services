'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { useAuth } from '@/lib/useAuth'
import { PrintRequestCommentThread } from '@/components/print-request-comment-thread'

interface ClientOption {
  id: string
  name: string
}

interface VenueOption {
  id: string
  name: string
  aliases?: string[] | null
}

interface PrintShippingAddress {
  client: string
  address: string
}

interface PrintRequestRecord {
  id: string
  client_id: string | null
  client_name: string | null
  print_client_id: string | null
  venue_id: string | null
  venue_name: string | null
  tricode: string | null
  job_title: string
  status: string
  shipping_address: string | null
  ship_date: string | null
  arrival_date: string | null
  due_date: string | null
  invoice_amount: number | null
  invoice_number: string | null
  invoice_date: string | null
  britten_cost: number | null
  britten_rush_fee: number | null
  britten_shipping: number | null
  anc_price: number | null
  install_fee: number | null
  rush_fee: number | null
  shipping_fee: number | null
  sales_tax: number | null
  bill_to: string | null
  billing_notes: string | null
  anc_class: string | null
  home_plate: number | null
  baselines: number | null
  small_home_plate: number | null
  other_qty: number | null
  a_frames: number | null
  courtsides: number | null
  dasherboards: number | null
  spring_hp: number | null
  margin: number | null
  submitted_by: string | null
  requester_email: string | null
  reprint: boolean
  rush_request: boolean
  sf_number: string | null
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
  venue_id: '',
  venue_tricode: '',
  job_title: '',
  status: 'new_job',
  shipping_address: '',
  ship_date: '',
  arrival_date: '',
  due_date: '',
  invoice_amount: '',
  invoice_number: '',
  invoice_date: '',
  britten_cost: '',
  britten_rush_fee: '',
  britten_shipping: '',
  anc_price: '',
  install_fee: '',
  rush_fee: '',
  shipping_fee: '',
  sales_tax: '',
  bill_to: '',
  billing_notes: '',
  anc_class: '',
  home_plate: '',
  baselines: '',
  small_home_plate: '',
  other_qty: '',
  a_frames: '',
  courtsides: '',
  dasherboards: '',
  spring_hp: '',
  submitted_by: '',
  requester_email: '',
  reprint: false,
  rush_request: false,
  sf_number: '',
  notes: '',
  tracking_number: '',
}

function normalizeClientName(value: string | null | undefined) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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

function normalizeTriCode(value: string): string {
  const cleaned = value.toUpperCase().replace(/[^A-Z-]/g, '')
  return cleaned.split('-').slice(0, 2).map((p) => p.slice(0, 3)).join('-')
}

function venueTriCodeOptions(venue: VenueOption | null | undefined): string[] {
  const options = (venue?.aliases || [])
    .map(normalizeTriCode)
    .filter((code) => /^[A-Z]{1,3}(-[A-Z]{1,3})?$/.test(code))
  return Array.from(new Set(options))
}

export default function PrintRequestsPage() {
  const auth = useAuth('manager')
  const { showToast } = useToast()

  const [records, setRecords] = useState<PrintRequestRecord[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [venues, setVenues] = useState<VenueOption[]>([])
  const [shippingAddresses, setShippingAddresses] = useState<PrintShippingAddress[]>([])
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

      const [printRes, clientsRes, venuesRes] = await Promise.all([
        fetch(`/api/print-requests${params.toString() ? `?${params.toString()}` : ''}`),
        fetch('/api/clients'),
        fetch('/api/venues'),
      ])

      const [printJson, clientsJson, venuesJson] = await Promise.all([printRes.json(), clientsRes.json(), venuesRes.json()])
      setRecords(printJson.print_requests || [])
      setClients(clientsJson.clients || [])
      setVenues(venuesJson.venues || [])
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

  useEffect(() => {
    fetch('/api/print-shipping-addresses')
      .then((response) => response.ok ? response.json() : { addresses: [] })
      .then((data) => setShippingAddresses(data.addresses || []))
      .catch(() => setShippingAddresses([]))
  }, [])

  const addressByClient = useMemo(() => {
    const map = new Map<string, string>()
    shippingAddresses.forEach((item) => map.set(normalizeClientName(item.client), item.address))
    return map
  }, [shippingAddresses])
  const venueById = useMemo(() => {
    const map = new Map<string, VenueOption>()
    venues.forEach((venue) => map.set(venue.id, venue))
    return map
  }, [venues])
  const selectedVenueTriCodes = useMemo(() => {
    return form.venue_id ? venueTriCodeOptions(venueById.get(form.venue_id)) : []
  }, [form.venue_id, venueById])

  function findShippingAddressForClient(clientName: string | null | undefined) {
    const needle = normalizeClientName(clientName)
    if (!needle) return null
    const exact = addressByClient.get(needle)
    if (exact) return exact
    const match = shippingAddresses.find((item) => {
      const candidate = normalizeClientName(item.client)
      return candidate.includes(needle) || needle.includes(candidate)
    })
    return match?.address || null
  }

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return records
    return records.filter((record) => {
      return (
        record.job_title.toLowerCase().includes(q) ||
        (record.client_name || '').toLowerCase().includes(q) ||
        (record.venue_name || '').toLowerCase().includes(q) ||
        (record.tricode || '').toLowerCase().includes(q) ||
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
      venue_id: record.venue_id || '',
      venue_tricode: record.tricode || '',
      job_title: record.job_title,
      status: record.status,
      shipping_address: record.shipping_address || '',
      ship_date: record.ship_date ? record.ship_date.slice(0, 10) : '',
      arrival_date: record.arrival_date ? record.arrival_date.slice(0, 10) : '',
      due_date: record.due_date ? record.due_date.slice(0, 10) : '',
      invoice_amount: record.invoice_amount == null ? '' : String(record.invoice_amount),
      invoice_number: record.invoice_number || '',
      invoice_date: record.invoice_date ? record.invoice_date.slice(0, 10) : '',
      britten_cost: record.britten_cost == null ? '' : String(record.britten_cost),
      britten_rush_fee: record.britten_rush_fee == null ? '' : String(record.britten_rush_fee),
      britten_shipping: record.britten_shipping == null ? '' : String(record.britten_shipping),
      anc_price: record.anc_price == null ? '' : String(record.anc_price),
      install_fee: record.install_fee == null ? '' : String(record.install_fee),
      rush_fee: record.rush_fee == null ? '' : String(record.rush_fee),
      shipping_fee: record.shipping_fee == null ? '' : String(record.shipping_fee),
      sales_tax: record.sales_tax == null ? '' : String(record.sales_tax),
      bill_to: record.bill_to || '',
      billing_notes: record.billing_notes || '',
      anc_class: record.anc_class || '',
      home_plate: record.home_plate == null ? '' : String(record.home_plate),
      baselines: record.baselines == null ? '' : String(record.baselines),
      small_home_plate: record.small_home_plate == null ? '' : String(record.small_home_plate),
      other_qty: record.other_qty == null ? '' : String(record.other_qty),
      a_frames: record.a_frames == null ? '' : String(record.a_frames),
      courtsides: record.courtsides == null ? '' : String(record.courtsides),
      dasherboards: record.dasherboards == null ? '' : String(record.dasherboards),
      spring_hp: record.spring_hp == null ? '' : String(record.spring_hp),
      submitted_by: record.submitted_by || '',
      requester_email: record.requester_email || '',
      reprint: Boolean(record.reprint),
      rush_request: Boolean(record.rush_request),
      sf_number: record.sf_number || '',
      notes: record.notes || '',
      tracking_number: record.tracking_number || '',
    })
    setModalOpen(true)
  }

  function handleClientChange(clientId: string) {
    const client = clients.find((item) => item.id === clientId)
    const nextAddress = findShippingAddressForClient(client?.name || '')
    setForm((current) => ({
      ...current,
      client_id: clientId,
      client_name: client?.name || '',
      shipping_address: nextAddress && (!current.shipping_address.trim() || Boolean(findShippingAddressForClient(current.client_name)))
        ? nextAddress
        : current.shipping_address,
    }))
  }

  // Tri-code drives address auto-populate (Alexis 2026-06-24). Set the tri-code,
  // then resolve the shipping address by tri-code (override map → venue → client
  // fuzzy match) and fill it only if the address field is empty or was itself
  // auto-filled — never clobber a manually edited address.
  async function handleTriCodeChange(rawTriCode: string) {
    const tricode = normalizeTriCode(rawTriCode)
    setForm((current) => ({ ...current, venue_tricode: rawTriCode }))
    if (!tricode) return
    try {
      const params = new URLSearchParams({ tricode })
      const res = await fetch(`/api/print-shipping-addresses?${params}`).then((r) => r.json())
      const address = res?.match?.address as string | undefined
      if (!address) return
      setForm((current) => {
        const canFill = !current.shipping_address.trim() || Boolean(findShippingAddressForClient(current.client_name))
        return canFill ? { ...current, shipping_address: address } : current
      })
    } catch {}
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
        venue_id: form.venue_id || null,
        venue_tricode: form.venue_tricode || null,
        job_title: form.job_title.trim(),
        status: form.status,
        shipping_address: form.shipping_address.trim() || null,
        ship_date: form.ship_date || null,
        arrival_date: form.arrival_date || null,
        due_date: form.due_date || null,
        invoice_amount: form.invoice_amount === '' ? null : Number(form.invoice_amount),
        invoice_number: form.invoice_number.trim() || null,
        invoice_date: form.invoice_date || null,
        britten_cost: form.britten_cost === '' ? null : Number(form.britten_cost),
        britten_rush_fee: form.britten_rush_fee === '' ? null : Number(form.britten_rush_fee),
        britten_shipping: form.britten_shipping === '' ? null : Number(form.britten_shipping),
        anc_price: form.anc_price === '' ? null : Number(form.anc_price),
        install_fee: form.install_fee === '' ? null : Number(form.install_fee),
        rush_fee: form.rush_fee === '' ? null : Number(form.rush_fee),
        shipping_fee: form.shipping_fee === '' ? null : Number(form.shipping_fee),
        sales_tax: form.sales_tax === '' ? null : Number(form.sales_tax),
        bill_to: form.bill_to.trim() || null,
        billing_notes: form.billing_notes.trim() || null,
        anc_class: form.anc_class.trim() || null,
        home_plate: form.home_plate === '' ? null : Number(form.home_plate),
        baselines: form.baselines === '' ? null : Number(form.baselines),
        small_home_plate: form.small_home_plate === '' ? null : Number(form.small_home_plate),
        other_qty: form.other_qty === '' ? null : Number(form.other_qty),
        a_frames: form.a_frames === '' ? null : Number(form.a_frames),
        courtsides: form.courtsides === '' ? null : Number(form.courtsides),
        dasherboards: form.dasherboards === '' ? null : Number(form.dasherboards),
        spring_hp: form.spring_hp === '' ? null : Number(form.spring_hp),
        submitted_by: form.submitted_by.trim() || null,
        requester_email: form.requester_email.trim() || null,
        reprint: form.reprint,
        rush_request: form.rush_request,
        sf_number: form.sf_number.trim() || null,
        notes: form.notes.trim() || null,
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

      showToast(
        json.routed_to_internal_hours
          ? 'Spec sheet routed to Internal Hours'
          : editingId ? 'Print request updated' : 'Print request created',
        'success',
      )
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
      <div className="space-y-5">
        <div className="rounded-xl border border-[#D9E4FF] bg-gradient-to-br from-[#F8FBFF] via-white to-[#EEF4FF] p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0A52EF]">Creative Production</div>
              <h1 className="mt-1.5 text-2xl font-semibold text-zinc-950">Print Requests</h1>
              <p className="mt-1 text-sm text-zinc-500">
                {counts.active || 0} active requests across the Britain production pipeline.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <a
                href="/api/print-requests/export?format=csv"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg bg-white border border-[#E6ECF5] px-3.5 py-2 text-sm font-semibold text-zinc-700 shadow-sm transition hover:bg-zinc-50 hover:text-zinc-900"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
              </a>
              <div className="inline-flex rounded-lg border border-[#D9E4FF] bg-white p-1 shadow-sm">
                <button
                  onClick={() => setView('list')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${view === 'list' ? 'bg-[#0A52EF] text-white' : 'text-zinc-600 hover:text-zinc-900'}`}
                >
                  List View
                </button>
                <button
                  onClick={() => setView('kanban')}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${view === 'kanban' ? 'bg-[#0A52EF] text-white' : 'text-zinc-600 hover:text-zinc-900'}`}
                >
                  Kanban
                </button>
              </div>

              <button
                onClick={openCreate}
                className="rounded-lg bg-[#0A52EF] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#0840C0]"
              >
                New Print Request
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#E6ECF5] bg-white p-3 shadow-sm">
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
                className="w-full rounded-lg border border-[#E6ECF5] bg-[#FBFDFF] py-2.5 pl-10 pr-4 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
              />
            </div>

            <select
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
              className="rounded-lg border border-[#E6ECF5] bg-white px-3 py-2.5 text-sm text-zinc-700 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
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
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="h-80 w-full rounded-xl" />
          </div>
        ) : view === 'list' ? (
          filteredRecords.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#D9E4FF] bg-white p-12 text-center shadow-sm">
              <p className="text-sm font-medium text-zinc-900">No print requests match this filter.</p>
              <p className="mt-1 text-sm text-zinc-500">Try another client or create a new print request.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.filter((column) => column.items.length > 0).map((column) => (
                <div key={column.key} className="overflow-hidden rounded-xl border border-[#E6ECF5] bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-[#E6ECF5] bg-[#F8FBFF] px-5 py-3.5">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${column.tone}`}>{column.label}</span>
                    <span className="text-xs font-semibold text-zinc-500">{column.items.length} request{column.items.length === 1 ? '' : 's'}</span>
                  </div>
                  <table className="w-full min-w-[980px] text-sm">
                    <thead>
                      <tr className="border-b border-[#E6ECF5] bg-white">
                        <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Job</th>
                        <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Client</th>
                        <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Ship</th>
                        <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Arrival</th>
                        <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Invoice</th>
                        <th className="px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {column.items.map((record) => (
                        <tr key={record.id} className="cursor-pointer border-b border-[#EEF2F7] transition hover:bg-[#FAFCFF]" onClick={() => openEdit(record)}>
                          <td className="px-5 py-3.5">
                            <div className="font-medium text-zinc-950">{record.job_title}</div>
                            <div className="mt-1 line-clamp-1 text-xs text-zinc-500">{record.shipping_address || 'No shipping address yet'}</div>
                          </td>
                          <td className="px-5 py-3.5 text-zinc-700">
                            <div className="flex items-center gap-2">
                              <span>{record.client_name || 'Unlinked'}</span>
                              {record.tricode && (
                                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide text-zinc-600">{record.tricode}</span>
                              )}
                            </div>
                            {record.venue_name && <div className="mt-0.5 text-xs text-zinc-400">{record.venue_name}</div>}
                          </td>
                          <td className="px-5 py-3.5 text-zinc-600">{formatShortDate(record.ship_date)}</td>
                          <td className="px-5 py-3.5 text-zinc-600">{formatShortDate(record.arrival_date)}</td>
                          <td className="px-5 py-3.5 text-zinc-900">{formatMoney(record.invoice_amount)}</td>
                          <td className="px-5 py-3.5 text-right text-zinc-500">{formatShortDate(record.updated_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
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
                        {record.venue_name && <div className="mt-1 text-xs text-zinc-400">{record.venue_name}</div>}
                        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                          <span>Ship {formatShortDate(record.ship_date)}</span>
                          <span>{formatShortDate(record.arrival_date)} arrival</span>
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

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">SF Number</label>
                    <input
                      type="text"
                      value={form.sf_number}
                      onChange={(event) => setForm((current) => ({ ...current, sf_number: event.target.value }))}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Submitted By</label>
                    <input
                      type="text"
                      value={form.submitted_by}
                      onChange={(event) => setForm((current) => ({ ...current, submitted_by: event.target.value }))}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Email</label>
                    <input
                      type="email"
                      value={form.requester_email}
                      onChange={(event) => setForm((current) => ({ ...current, requester_email: event.target.value }))}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    />
                  </div>

                  <div className="md:col-span-2 grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-3 rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm font-medium text-zinc-700">
                      <input
                        type="checkbox"
                        checked={form.reprint}
                        onChange={(event) => setForm((current) => ({ ...current, reprint: event.target.checked }))}
                        className="h-4 w-4 rounded border-zinc-300 text-[#0A52EF] focus:ring-[#0A52EF]"
                      />
                      Reprint
                    </label>
                    <label className="flex items-center gap-3 rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm font-medium text-zinc-700">
                      <input
                        type="checkbox"
                        checked={form.rush_request}
                        onChange={(event) => setForm((current) => ({ ...current, rush_request: event.target.checked }))}
                        className="h-4 w-4 rounded border-zinc-300 text-[#0A52EF] focus:ring-[#0A52EF]"
                      />
                      Rush Request
                    </label>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Venue</label>
                    <select
                      value={form.venue_id}
                      onChange={(event) => {
                        const venueId = event.target.value
                        const codes = venueTriCodeOptions(venueId ? venueById.get(venueId) : null)
                        setForm((current) => ({ ...current, venue_id: venueId, venue_tricode: codes.length === 1 ? codes[0] : current.venue_tricode }))
                      }}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-white px-4 py-3 text-sm text-zinc-700 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    >
                      <option value="">Select venue...</option>
                      {venues.map((venue) => (
                        <option key={venue.id} value={venue.id}>{venue.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Venue Tri-Code</label>
                    {selectedVenueTriCodes.length > 0 ? (
                      <select
                        value={form.venue_tricode}
                        onChange={(event) => handleTriCodeChange(event.target.value)}
                        className="w-full rounded-xl border border-[#E6ECF5] bg-white px-4 py-3 text-sm text-zinc-700 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10 font-mono uppercase"
                      >
                        <option value="">Select code...</option>
                        {selectedVenueTriCodes.map((code) => <option key={code} value={code}>{code}</option>)}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={form.venue_tricode}
                        onChange={(event) => handleTriCodeChange(event.target.value)}
                        maxLength={7}
                        placeholder="BSX-FEN"
                        className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10 font-mono uppercase"
                      />
                    )}
                    <p className="mt-1.5 text-xs text-zinc-500">Selecting a tri-code links the venue and pulls the shipping address from the tri-code mapping.</p>
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Shipping Address</label>
                    <textarea
                      value={form.shipping_address}
                      onChange={(event) => setForm((current) => ({ ...current, shipping_address: event.target.value }))}
                      rows={3}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    />
                    {form.client_name && findShippingAddressForClient(form.client_name) ? (
                      <p className="mt-1.5 text-xs text-zinc-500">Address populated from the print shipping address list.</p>
                    ) : null}
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
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Date</label>
                    <input
                      type="date"
                      value={form.due_date}
                      onChange={(event) => setForm((current) => ({ ...current, due_date: event.target.value }))}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Date Shipped</label>
                    <input
                      type="date"
                      value={form.ship_date}
                      onChange={(event) => setForm((current) => ({ ...current, ship_date: event.target.value }))}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Britten Price</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.britten_cost}
                      onChange={(event) => setForm((current) => ({ ...current, britten_cost: event.target.value }))}
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

                  <div className="md:col-span-2 grid gap-5 sm:grid-cols-4">
                    {[
                      ['home_plate', 'HP'],
                      ['baselines', 'BL'],
                      ['small_home_plate', 'SHP'],
                      ['spring_hp', 'Spring HP'],
                      ['a_frames', 'A-Frames'],
                      ['courtsides', 'Courtsides'],
                      ['dasherboards', 'Dasherboards'],
                      ['other_qty', 'Other Qty'],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</label>
                        <input
                          type="number"
                          min="0"
                          value={(form as any)[key]}
                          onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                          className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="md:col-span-2 grid gap-5 sm:grid-cols-3">
                    {[
                      ['anc_price', 'ANC Price'],
                      ['install_fee', 'Install Fee'],
                      ['rush_fee', 'Rush Fee'],
                      ['shipping_fee', 'Shipping Fee'],
                      ['britten_rush_fee', 'Britten Rush Fee'],
                      ['britten_shipping', 'Britten Shipping'],
                      ['sales_tax', 'Sales Tax'],
                      ['invoice_amount', 'Order Total'],
                    ].map(([key, label]) => (
                      <div key={key}>
                        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={(form as any)[key]}
                          onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                          className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Margin (ANC Price − Britten Total)</label>
                    <div className="w-full rounded-xl border border-[#E6ECF5] bg-zinc-50 px-4 py-3 text-sm font-semibold text-zinc-900 tabular-nums">
                      {(() => {
                        const anc = form.anc_price === '' ? null : Number(form.anc_price)
                        if (anc == null || !Number.isFinite(anc)) return <span className="font-normal text-zinc-400">—</span>
                        const brittenTotal =
                          (form.britten_cost === '' ? 0 : Number(form.britten_cost)) +
                          (form.britten_rush_fee === '' ? 0 : Number(form.britten_rush_fee)) +
                          (form.britten_shipping === '' ? 0 : Number(form.britten_shipping))
                        const margin = anc - brittenTotal
                        return `$${margin.toFixed(2)}`
                      })()}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Invoice Number</label>
                    <input
                      type="text"
                      value={form.invoice_number}
                      onChange={(event) => setForm((current) => ({ ...current, invoice_number: event.target.value }))}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Invoice Date</label>
                    <input
                      type="date"
                      value={form.invoice_date}
                      onChange={(event) => setForm((current) => ({ ...current, invoice_date: event.target.value }))}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Bill To</label>
                    <input
                      type="text"
                      value={form.bill_to}
                      onChange={(event) => setForm((current) => ({ ...current, bill_to: event.target.value }))}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">ANC Class</label>
                    <input
                      type="text"
                      value={form.anc_class}
                      onChange={(event) => setForm((current) => ({ ...current, anc_class: event.target.value }))}
                      className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Billing Notes</label>
                    <textarea
                      value={form.billing_notes}
                      onChange={(event) => setForm((current) => ({ ...current, billing_notes: event.target.value }))}
                      rows={3}
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
                </div>

                {editingId && (
                  <div className="border-t border-[#E6ECF5] pt-5">
                    <PrintRequestCommentThread printRequestId={editingId} />
                  </div>
                )}

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
