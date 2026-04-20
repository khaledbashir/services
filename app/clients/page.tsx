'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
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
}

interface VenueOption {
  id: string
  name: string
}

export default function ClientsPage() {
  const auth = useAuth()
  const [clients, setClients] = useState<ClientRow[]>([])
  const [venues, setVenues] = useState<VenueOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
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

  const filtered = clients.filter((client) => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return client.name.toLowerCase().includes(q)
      || (client.parent_client_name || '').toLowerCase().includes(q)
      || (client.sport || '').toLowerCase().includes(q)
      || client.venue_names.some((name) => name.toLowerCase().includes(q))
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
        await load()
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Clients</h1>
            <p className="text-sm text-zinc-500 mt-1">Client records own services, link to one or more venues, and can roll up sport-specific sub-clients.</p>
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

        <div className="bg-white rounded-xl border border-zinc-200 p-3">
          <input
            type="text"
            placeholder="Search clients, parents, sports, or venues..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none"
          />
        </div>

        {showCreate && (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6 space-y-4">
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
            </div>
            <div>
              <button
                type="button"
                disabled={creating}
                onClick={createClient}
                className="px-5 py-2.5 bg-zinc-900 text-white rounded-lg text-sm font-semibold hover:bg-zinc-800 disabled:opacity-50"
              >
                {creating ? 'Creating...' : 'Create Client'}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, idx) => <Skeleton key={idx} className="h-36" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filtered.map((client) => (
              <Link
                key={client.id}
                href={`/clients/${client.id}`}
                className="bg-white rounded-xl border border-zinc-200 hover:border-zinc-300 hover:shadow-sm transition-all p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-900">{client.name}</h2>
                    <p className="text-xs text-zinc-500 mt-1">
                      {client.parent_client_name ? `Child of ${client.parent_client_name}` : 'Top-level client'}
                      {client.sport ? ` • ${client.sport}` : ''}
                    </p>
                  </div>
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-[11px] font-semibold border ${client.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-50 text-zinc-500 border-zinc-200'}`}>
                    {client.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs text-zinc-600">
                  <span className="px-2 py-1 rounded-full bg-zinc-100">{client.venue_count} venue{client.venue_count === 1 ? '' : 's'}</span>
                  <span className="px-2 py-1 rounded-full bg-zinc-100">{client.active_service_count} active service{client.active_service_count === 1 ? '' : 's'}</span>
                  {client.subclient_count > 0 && (
                    <span className="px-2 py-1 rounded-full bg-zinc-100">{client.subclient_count} sub-client{client.subclient_count === 1 ? '' : 's'}</span>
                  )}
                </div>
                <p className="mt-3 text-sm text-zinc-600 line-clamp-2">
                  {client.venue_names.length > 0 ? client.venue_names.join(', ') : 'No venues linked yet'}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
