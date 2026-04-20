'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface ClientDetail {
  id: string
  name: string
  parent_client_id: string | null
  parent_client_name: string | null
  client_kind: string
  sport: string | null
  is_active: boolean
}

interface LinkedVenue {
  id: string
  name: string
  relation_type: string
}

interface ClientService {
  service_type_id: string
  name: string
  description: string | null
  enabled: boolean
}

interface VenueOption {
  id: string
  name: string
}

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const routeParams = useParams()
  const clientId = (routeParams?.id as string) || params.id
  const [client, setClient] = useState<ClientDetail | null>(null)
  const [linkedVenues, setLinkedVenues] = useState<LinkedVenue[]>([])
  const [services, setServices] = useState<ClientService[]>([])
  const [availableVenues, setAvailableVenues] = useState<VenueOption[]>([])
  const [subclients, setSubclients] = useState<Array<{ id: string; name: string; sport: string | null }>>([])
  const [selectedVenues, setSelectedVenues] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [newSubclientName, setNewSubclientName] = useState('')
  const [newSubclientSport, setNewSubclientSport] = useState('')
  const [creatingSubclient, setCreatingSubclient] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/clients/${clientId}`)
      if (res.ok) {
        const data = await res.json()
        setClient(data.client)
        setLinkedVenues(data.linkedVenues || [])
        setServices(data.clientServices || [])
        setAvailableVenues(data.availableVenues || [])
        setSubclients(data.subclients || [])
        setSelectedVenues((data.linkedVenues || []).map((v: LinkedVenue) => v.id))
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!clientId) return
    load()
  }, [clientId])

  const patch = async (payload: Record<string, unknown>) => {
    setSaving(true)
    setSaveError(null)
    setSaveMessage(null)
    try {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json()
        setClient(data.client)
        setLinkedVenues(data.linkedVenues || [])
        setServices(data.clientServices || [])
        setAvailableVenues(data.availableVenues || [])
        setSubclients(data.subclients || [])
        if ('linked_venue_ids' in payload) {
          setSelectedVenues((data.linkedVenues || []).map((v: LinkedVenue) => v.id))
          setSaveMessage('Venue links saved')
        } else if ('service_type_id' in payload) {
          setSaveMessage('Service updated')
        } else {
          setSaveMessage('Client updated')
        }
      } else {
        const data = await res.json().catch(() => null)
        setSaveError(data?.error || 'Unable to save changes')
      }
    } catch {
      setSaveError('Unable to save changes')
    } finally {
      setSaving(false)
    }
  }

  const toggleVenue = (venueId: string) => {
    const next = selectedVenues.includes(venueId)
      ? selectedVenues.filter((id) => id !== venueId)
      : [...selectedVenues, venueId]
    setSelectedVenues(next)
  }

  const createSubclient = async () => {
    if (!clientId || !newSubclientName.trim()) return
    setCreatingSubclient(true)
    setSaveError(null)
    setSaveMessage(null)
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSubclientName.trim(),
          parent_client_id: clientId,
          client_kind: 'sub_client',
          sport: newSubclientSport.trim() || null,
          linked_venue_ids: selectedVenues,
        }),
      })
      if (res.ok) {
        setNewSubclientName('')
        setNewSubclientSport('')
        setSaveMessage('Sub-client created')
        await load()
      } else {
        const data = await res.json().catch(() => null)
        setSaveError(data?.error || 'Unable to create sub-client')
      }
    } catch {
      setSaveError('Unable to create sub-client')
    } finally {
      setCreatingSubclient(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-56" />
          <Skeleton className="h-64" />
        </div>
      </DashboardLayout>
    )
  }

  if (!client) {
    return (
      <DashboardLayout>
        <div className="bg-white rounded-xl border border-zinc-200 p-8 text-sm text-zinc-500">Client not found.</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="bg-white rounded-xl border border-zinc-200 p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">{client.name}</h1>
              <p className="text-sm text-zinc-500 mt-1">
                {client.parent_client_name ? `Sub-client under ${client.parent_client_name}` : 'Top-level client'}
                {client.sport ? ` • ${client.sport}` : ''}
              </p>
            </div>
            <button
              onClick={() => patch({ is_active: !client.is_active })}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border ${client.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-50 text-zinc-500 border-zinc-200'}`}
            >
              {client.is_active ? 'Active' : 'Inactive'}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Option B</div>
              <p className="mt-2 text-sm text-zinc-700">This client owns the contracted services. Venues underneath are just the physical places this client operates in.</p>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Primary Venue</div>
              <p className="mt-2 text-sm text-zinc-700">{linkedVenues[0]?.name || 'No primary venue selected yet'}</p>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Sub-clients</div>
              <p className="mt-2 text-sm text-zinc-700">{subclients.length > 0 ? `${subclients.length} linked sport/account variations` : 'No sub-clients yet'}</p>
            </div>
          </div>
          {(saveMessage || saveError) && (
            <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${saveError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {saveError || saveMessage}
            </div>
          )}
          {subclients.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-zinc-600 mb-2">Sub-clients</p>
              <div className="flex flex-wrap gap-2">
                {subclients.map((subclient) => (
                  <Link key={subclient.id} href={`/clients/${subclient.id}`} className="px-2.5 py-1 rounded-full bg-zinc-100 text-xs text-zinc-700 hover:bg-zinc-200 transition-colors">
                    {subclient.name}{subclient.sport ? ` • ${subclient.sport}` : ''}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {!client.parent_client_name && (
            <div className="mt-5 pt-5 border-t border-zinc-100">
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">Add Sub-client</p>
                  <p className="text-xs text-zinc-500">Use this for sport-specific child accounts like Rutgers Football or Rutgers Soccer.</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={newSubclientName}
                  onChange={(e) => setNewSubclientName(e.target.value)}
                  placeholder="Sub-client name"
                  className="border border-zinc-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
                />
                <input
                  type="text"
                  value={newSubclientSport}
                  onChange={(e) => setNewSubclientSport(e.target.value)}
                  placeholder="Sport, e.g. Football"
                  className="border border-zinc-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
                />
                <button
                  onClick={createSubclient}
                  disabled={creatingSubclient || !newSubclientName.trim()}
                  className="px-4 py-2.5 bg-[#0A52EF] text-white rounded-lg text-sm font-semibold hover:bg-[#0840C0] disabled:opacity-50"
                >
                  {creatingSubclient ? 'Creating...' : 'Create Sub-client'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-5">
          <div className="bg-white rounded-xl border border-zinc-200 p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Contracted Services</h2>
                <p className="text-sm text-zinc-500">These toggles now live at the client level.</p>
              </div>
              {saving && <span className="text-xs text-zinc-500">Saving...</span>}
            </div>
            <div className="space-y-3">
              {services.map((service) => (
                <div key={service.service_type_id} className="flex items-center justify-between gap-4 border border-zinc-100 rounded-lg px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{service.name}</p>
                    {service.description && <p className="text-xs text-zinc-500 mt-1">{service.description}</p>}
                  </div>
                  <button
                    onClick={() => patch({ service_type_id: service.service_type_id, enabled: !service.enabled })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${service.enabled ? 'bg-[#0A52EF]' : 'bg-zinc-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${service.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-zinc-200 p-6">
            <h2 className="text-lg font-semibold text-zinc-900">Linked Venues</h2>
            <p className="text-sm text-zinc-500 mt-1">Select the physical places this client operates in. The first selected venue becomes the primary venue.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {availableVenues.map((venue) => {
                const selected = selectedVenues.includes(venue.id)
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
            {selectedVenues.length > 0 && (
              <div className="mt-4 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-sm text-sky-800">
                Primary venue: <span className="font-semibold">{availableVenues.find((venue) => venue.id === selectedVenues[0])?.name || 'Not set'}</span>
              </div>
            )}
            <div className="mt-4">
              <button
                onClick={() => patch({ linked_venue_ids: selectedVenues })}
                className="px-4 py-2.5 bg-zinc-900 text-white rounded-lg text-sm font-semibold hover:bg-zinc-800"
              >
                Save Venue Links
              </button>
            </div>
            {linkedVenues.length > 0 && (
              <div className="mt-5 pt-5 border-t border-zinc-100">
                <p className="text-xs font-semibold text-zinc-600 mb-2">Current links</p>
                <div className="space-y-2">
                  {linkedVenues.map((venue) => (
                    <div key={venue.id} className="flex items-center justify-between text-sm">
                      <span className="text-zinc-800">{venue.name}</span>
                      <span className={`text-xs uppercase tracking-wide ${venue.relation_type === 'primary' ? 'text-[#0A52EF] font-semibold' : 'text-zinc-500'}`}>{venue.relation_type}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
