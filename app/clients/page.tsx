'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { useAuth } from '@/lib/useAuth'

interface ClientRow {
  id: string
  name: string
  client_kind: string
  sport: string | null
  parent_client_name: string | null
  venue_count: number
  venue_names: string[]
  active_service_count: number
  subclient_count: number
  is_active: boolean
  open_ticket_count: number
  urgent_ticket_count: number
  upcoming_event_count: number
  next_event_date: string | null
  next_event_summary: string | null
}

interface VenueOption {
  id: string
  name: string
}

type ClientFilter = 'all' | 'attention' | 'active' | 'no_venues' | 'no_services' | 'parents' | 'subclients'

const filters: Array<{ key: ClientFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'attention', label: 'Needs Attention' },
  { key: 'active', label: 'Active' },
  { key: 'no_venues', label: 'No Venue' },
  { key: 'no_services', label: 'No Services' },
  { key: 'parents', label: 'Parents' },
  { key: 'subclients', label: 'Sub-clients' },
]

function formatEventDate(value: string | null) {
  if (!value) return 'No upcoming event'
  const date = new Date(`${value}T12:00:00`)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function getHealth(client: ClientRow) {
  if (!client.is_active) return { label: 'Inactive', tone: 'bg-zinc-100 text-zinc-600 border-zinc-200' }
  if (client.urgent_ticket_count > 0) return { label: `${client.urgent_ticket_count} urgent`, tone: 'bg-rose-50 text-rose-700 border-rose-200' }
  if (client.venue_count === 0) return { label: 'No venue', tone: 'bg-amber-50 text-amber-700 border-amber-200' }
  if (client.active_service_count === 0) return { label: 'No services', tone: 'bg-orange-50 text-orange-700 border-orange-200' }
  if (client.open_ticket_count > 0) return { label: `${client.open_ticket_count} open`, tone: 'bg-sky-50 text-sky-700 border-sky-200' }
  return { label: 'Healthy', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
}

export default function ClientsPage() {
  const auth = useAuth()
  const [clients, setClients] = useState<ClientRow[]>([])
  const [venues, setVenues] = useState<VenueOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<ClientFilter>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [createSuccess, setCreateSuccess] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    client_kind: 'client',
    sport: '',
    linked_venue_ids: [] as string[],
  })

  const load = async () => {
    setLoading(true)
    try {
      const [clientsRes, venuesRes] = await Promise.all([
        fetch('/api/clients'),
        fetch('/api/venues?include_inactive=true'),
      ])
      if (clientsRes.ok) {
        const data = await clientsRes.json()
        setClients(data.clients || [])
      }
      if (venuesRes.ok) {
        const data = await venuesRes.json()
        setVenues((data.venues || []).map((v: any) => ({ id: v.id, name: v.name })))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const summary = useMemo(() => ({
    active: clients.filter((client) => client.is_active).length,
    attention: clients.filter((client) => client.is_active && (client.urgent_ticket_count > 0 || client.venue_count === 0 || client.active_service_count === 0)).length,
    openTickets: clients.reduce((sum, client) => sum + Number(client.open_ticket_count || 0), 0),
    upcomingEvents: clients.reduce((sum, client) => sum + Number(client.upcoming_event_count || 0), 0),
  }), [clients])

  const filtered = clients.filter((client) => {
    const q = search.toLowerCase().trim()
    const matchesSearch = !q
      || client.name.toLowerCase().includes(q)
      || (client.parent_client_name || '').toLowerCase().includes(q)
      || (client.sport || '').toLowerCase().includes(q)
      || client.venue_names.some((name) => name.toLowerCase().includes(q))
    if (!matchesSearch) return false

    if (activeFilter === 'attention') return client.is_active && (client.urgent_ticket_count > 0 || client.venue_count === 0 || client.active_service_count === 0)
    if (activeFilter === 'active') return client.is_active
    if (activeFilter === 'no_venues') return client.venue_count === 0
    if (activeFilter === 'no_services') return client.active_service_count === 0
    if (activeFilter === 'parents') return !client.parent_client_name
    if (activeFilter === 'subclients') return Boolean(client.parent_client_name) || client.client_kind === 'sub_client'
    return true
  })

  const toggleVenue = (venueId: string) => {
    setForm((prev) => ({
      ...prev,
      linked_venue_ids: prev.linked_venue_ids.includes(venueId)
        ? prev.linked_venue_ids.filter((id) => id !== venueId)
        : [...prev.linked_venue_ids, venueId],
    }))
  }

  const createClient = async () => {
    if (!form.name.trim()) return
    setCreating(true)
    setCreateError(null)
    setCreateSuccess(null)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          client_kind: form.client_kind,
          sport: form.sport || null,
          linked_venue_ids: form.linked_venue_ids,
        }),
      })
      if (res.ok) {
        setForm({ name: '', client_kind: 'client', sport: '', linked_venue_ids: [] })
        setShowCreate(false)
        setCreateSuccess(`${form.name.trim()} created`)
        await load()
      } else {
        const data = await res.json().catch(() => null)
        setCreateError(data?.error || 'Unable to create client right now')
      }
    } catch {
      setCreateError('Unable to create client right now')
    } finally {
      setCreating(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Account Command Center</div>
            <h1 className="text-2xl font-bold text-zinc-900 mt-1">Clients</h1>
            <p className="text-sm text-zinc-500 mt-1">Track who ANC supports, what is contracted, what is open, and what needs attention next.</p>
          </div>
          {auth.isManager && (
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="px-5 py-2.5 bg-[#0A52EF] text-white rounded-lg text-sm font-semibold hover:bg-[#0840C0] transition-colors shadow-sm"
            >
              {showCreate ? 'Cancel' : '+ Add Client'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="text-xs font-semibold text-zinc-500">Active Clients</div>
            <div className="mt-2 text-2xl font-bold text-zinc-900">{summary.active}</div>
          </div>
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="text-xs font-semibold text-zinc-500">Needs Attention</div>
            <div className="mt-2 text-2xl font-bold text-amber-700">{summary.attention}</div>
          </div>
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="text-xs font-semibold text-zinc-500">Open Cases</div>
            <div className="mt-2 text-2xl font-bold text-zinc-900">{summary.openTickets}</div>
          </div>
          <div className="bg-white rounded-lg border border-zinc-200 p-4">
            <div className="text-xs font-semibold text-zinc-500">Upcoming Events</div>
            <div className="mt-2 text-2xl font-bold text-zinc-900">{summary.upcomingEvents}</div>
          </div>
        </div>

        {(createError || createSuccess) && (
          <div className={`rounded-lg border px-4 py-3 text-sm ${createError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
            {createError || createSuccess}
          </div>
        )}

        <div className="bg-white rounded-lg border border-zinc-200 p-3 space-y-3">
          <input
            type="text"
            placeholder="Search clients, parents, sports, or venues..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none"
          />
          <div className="flex flex-wrap gap-2">
            {filters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setActiveFilter(filter.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${activeFilter === filter.key ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {showCreate && (
          <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Create Client</h2>
              <p className="text-sm text-zinc-500 mt-1">Create the account, attach venues, then turn on contracted services from the client detail page.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Client Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Type</label>
                <select
                  value={form.client_kind}
                  onChange={(e) => setForm((prev) => ({ ...prev, client_kind: e.target.value }))}
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
                >
                  <option value="client">Client</option>
                  <option value="sub_client">Sub-client</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Sport</label>
                <input
                  type="text"
                  value={form.sport}
                  onChange={(e) => setForm((prev) => ({ ...prev, sport: e.target.value }))}
                  placeholder="Optional, e.g. Football"
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-600 mb-2">Linked Venues</label>
              <div className="flex flex-wrap gap-2">
                {venues.map((venue) => {
                  const selected = form.linked_venue_ids.includes(venue.id)
                  return (
                    <button
                      type="button"
                      key={venue.id}
                      onClick={() => toggleVenue(venue.id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${selected ? 'bg-[#0A52EF] text-white border-[#0A52EF]' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'}`}
                    >
                      {venue.name}
                    </button>
                  )
                })}
              </div>
              {form.linked_venue_ids.length > 0 && (
                <div className="mt-3 text-xs text-zinc-600">
                  Primary venue: <span className="font-semibold text-zinc-900">{venues.find((venue) => venue.id === form.linked_venue_ids[0])?.name || 'Not set'}</span>
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={creating}
              onClick={createClient}
              className="px-5 py-2.5 bg-zinc-900 text-white rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50"
            >
              {creating ? 'Creating...' : 'Create Client'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, idx) => <Skeleton key={idx} className="h-44" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg border border-zinc-200 p-8 text-center text-sm text-zinc-500">No clients match this view.</div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {filtered.map((client) => {
              const health = getHealth(client)
              return (
                <Link
                  key={client.id}
                  href={`/clients/${client.id}`}
                  className="bg-white rounded-lg border border-zinc-200 hover:border-zinc-300 hover:shadow-sm transition-all p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-semibold text-zinc-900 truncate">{client.name}</h2>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold border ${health.tone}`}>
                          {health.label}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-1">
                        {client.parent_client_name ? `Child of ${client.parent_client_name}` : 'Parent client'}
                        {client.sport ? ` / ${client.sport}` : ''}
                      </p>
                    </div>
                    <span className={`shrink-0 inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold border ${client.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-50 text-zinc-500 border-zinc-200'}`}>
                      {client.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-4 gap-2">
                    <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-3">
                      <div className="text-[11px] text-zinc-500 font-semibold">Venues</div>
                      <div className="mt-1 text-lg font-bold text-zinc-900">{client.venue_count}</div>
                    </div>
                    <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-3">
                      <div className="text-[11px] text-zinc-500 font-semibold">Services</div>
                      <div className="mt-1 text-lg font-bold text-zinc-900">{client.active_service_count}</div>
                    </div>
                    <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-3">
                      <div className="text-[11px] text-zinc-500 font-semibold">Cases</div>
                      <div className={`mt-1 text-lg font-bold ${client.urgent_ticket_count > 0 ? 'text-rose-700' : 'text-zinc-900'}`}>{client.open_ticket_count}</div>
                    </div>
                    <div className="rounded-lg bg-zinc-50 border border-zinc-100 p-3">
                      <div className="text-[11px] text-zinc-500 font-semibold">Events</div>
                      <div className="mt-1 text-lg font-bold text-zinc-900">{client.upcoming_event_count}</div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Venues</div>
                      <p className="mt-1 text-zinc-700 line-clamp-2">{client.venue_names.length > 0 ? client.venue_names.join(', ') : 'No venues linked yet'}</p>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">Next Event</div>
                      <p className="mt-1 text-zinc-700 line-clamp-2">
                        {client.next_event_summary ? `${formatEventDate(client.next_event_date)} / ${client.next_event_summary}` : 'No upcoming event'}
                      </p>
                    </div>
                  </div>

                  {client.subclient_count > 0 && (
                    <div className="mt-4 text-xs text-zinc-500">
                      {client.subclient_count} sub-client{client.subclient_count === 1 ? '' : 's'} under this account
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
