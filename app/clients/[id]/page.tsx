'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
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
  market: string | null
  is_active: boolean
  portal_token: string | null
  primary_contact_name: string | null
  primary_contact_email: string | null
  open_ticket_count: number
  upcoming_event_count: number
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

interface SupportTicket {
  id: string
  ticket_number: number
  title: string
  status: string
  priority: string
  category: string
  source: string
  venue_name: string | null
  created_date: string
}

interface UpcomingEvent {
  id: string
  summary: string
  league: string | null
  venue_name: string | null
  event_date: string
  start_time: string | null
  workflow_status: string
  event_requires_staffing: boolean
  assigned_count: number
}

interface AccountStats {
  open_ticket_count: number
  urgent_ticket_count: number
  upcoming_event_count: number
  portal_link_count: number
  missing_contact_count: number
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function priorityClass(priority: string) {
  if (priority === 'critical') return 'bg-rose-50 text-rose-700 border-rose-200'
  if (priority === 'high') return 'bg-orange-50 text-orange-700 border-orange-200'
  if (priority === 'medium') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-zinc-50 text-zinc-600 border-zinc-200'
}

function serviceTone(service: ClientService) {
  if (service.enabled) return 'border-emerald-200 bg-emerald-50/70'
  return 'border-zinc-200 bg-white'
}

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const routeParams = useParams()
  const clientId = (routeParams?.id as string) || params.id
  const [client, setClient] = useState<ClientDetail | null>(null)
  const [linkedVenues, setLinkedVenues] = useState<LinkedVenue[]>([])
  const [services, setServices] = useState<ClientService[]>([])
  const [availableVenues, setAvailableVenues] = useState<VenueOption[]>([])
  const [subclients, setSubclients] = useState<Array<{ id: string; name: string; sport: string | null }>>([])
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>([])
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [accountStats, setAccountStats] = useState<AccountStats>({
    open_ticket_count: 0,
    urgent_ticket_count: 0,
    upcoming_event_count: 0,
    portal_link_count: 0,
    missing_contact_count: 0,
  })
  const [selectedVenues, setSelectedVenues] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [newSubclientName, setNewSubclientName] = useState('')
  const [newSubclientSport, setNewSubclientSport] = useState('')
  const [creatingSubclient, setCreatingSubclient] = useState(false)
  const [portalCopied, setPortalCopied] = useState<string | null>(null)

  const activeServices = services.filter((service) => service.enabled)
  const primaryVenue = linkedVenues[0] || null

  const healthItems = useMemo(() => {
    const items: Array<{ label: string; detail: string; tone: string }> = []
    if (!client?.is_active) items.push({ label: 'Inactive account', detail: 'Reactivate when ANC work resumes.', tone: 'border-zinc-200 bg-zinc-50 text-zinc-700' })
    if (linkedVenues.length === 0) items.push({ label: 'No venue linked', detail: 'Attach at least one venue so tickets and events roll up.', tone: 'border-amber-200 bg-amber-50 text-amber-800' })
    if (activeServices.length === 0) items.push({ label: 'No services on', detail: 'Turn on contracted services for this account.', tone: 'border-orange-200 bg-orange-50 text-orange-800' })
    if (accountStats.urgent_ticket_count > 0) items.push({ label: 'Urgent support', detail: `${accountStats.urgent_ticket_count} high or critical case${accountStats.urgent_ticket_count === 1 ? '' : 's'} open.`, tone: 'border-rose-200 bg-rose-50 text-rose-800' })
    if (accountStats.missing_contact_count > 0) items.push({ label: 'Missing contact', detail: `${accountStats.missing_contact_count} linked venue${accountStats.missing_contact_count === 1 ? '' : 's'} need a primary contact email.`, tone: 'border-sky-200 bg-sky-50 text-sky-800' })
    if (linkedVenues.length > 0 && accountStats.portal_link_count === 0) items.push({ label: 'No portal link', detail: 'Create a venue portal when the client needs external visibility.', tone: 'border-violet-200 bg-violet-50 text-violet-800' })
    return items
  }, [accountStats, activeServices.length, client?.is_active, linkedVenues.length])

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
        setSupportTickets(data.supportTickets || [])
        setUpcomingEvents(data.upcomingEvents || [])
        setAccountStats(data.accountStats || {
          open_ticket_count: 0,
          urgent_ticket_count: 0,
          upcoming_event_count: 0,
          portal_link_count: 0,
          missing_contact_count: 0,
        })
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
        setSupportTickets(data.supportTickets || [])
        setUpcomingEvents(data.upcomingEvents || [])
        setAccountStats(data.accountStats || accountStats)
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

  const copyPortal = async (venue: LinkedVenue) => {
    if (!venue.portal_token || typeof window === 'undefined') return
    await navigator.clipboard.writeText(`${window.location.origin}/portal/${venue.portal_token}`)
    setPortalCopied(venue.id)
    setTimeout(() => setPortalCopied(null), 1600)
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-56" />
          <Skeleton className="h-64" />
        </div>
      </DashboardLayout>
    )
  }

  if (!client) {
    return (
      <DashboardLayout>
        <div className="bg-white rounded-lg border border-zinc-200 p-8 text-sm text-zinc-500">Client not found.</div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="bg-white rounded-lg border border-zinc-200 p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <Link href="/clients" className="text-xs font-semibold text-zinc-500 hover:text-zinc-900">Clients</Link>
              <h1 className="text-2xl font-bold text-zinc-900 mt-1">{client.name}</h1>
              <p className="text-sm text-zinc-500 mt-1">
                {client.parent_client_name ? `Sub-client under ${client.parent_client_name}` : 'Parent client'}
                {client.sport ? ` / ${client.sport}` : ''}
                {primaryVenue ? ` / Primary: ${primaryVenue.name}` : ''}
              </p>
            </div>
            <button
              onClick={() => patch({ is_active: !client.is_active })}
              className={`px-4 py-2 rounded-lg text-sm font-semibold border ${client.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-50 text-zinc-500 border-zinc-200'}`}
            >
              {client.is_active ? 'Active' : 'Inactive'}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
              <div className="text-[11px] font-semibold text-zinc-500">Venues</div>
              <div className="mt-1 text-2xl font-bold text-zinc-900">{linkedVenues.length}</div>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
              <div className="text-[11px] font-semibold text-zinc-500">Services</div>
              <div className="mt-1 text-2xl font-bold text-zinc-900">{activeServices.length}</div>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
              <div className="text-[11px] font-semibold text-zinc-500">Open Cases</div>
              <div className={`mt-1 text-2xl font-bold ${accountStats.urgent_ticket_count > 0 ? 'text-rose-700' : 'text-zinc-900'}`}>{accountStats.open_ticket_count}</div>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
              <div className="text-[11px] font-semibold text-zinc-500">Events</div>
              <div className="mt-1 text-2xl font-bold text-zinc-900">{accountStats.upcoming_event_count}</div>
            </div>
            <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4">
              <div className="text-[11px] font-semibold text-zinc-500">Portals</div>
              <div className="mt-1 text-2xl font-bold text-zinc-900">{accountStats.portal_link_count}</div>
            </div>
          </div>

          {(saveMessage || saveError) && (
            <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${saveError ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {saveError || saveMessage}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-5">
          <div className="space-y-5">
            <div className="bg-white rounded-lg border border-zinc-200 p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">Account Health</h2>
                  <p className="text-sm text-zinc-500">The things most likely to affect work quality or visibility.</p>
                </div>
                {saving && <span className="text-xs text-zinc-500">Saving...</span>}
              </div>
              {healthItems.length === 0 ? (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">This account looks ready: venues, services, contacts, and support pressure are in a good place.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {healthItems.map((item) => (
                    <div key={item.label} className={`rounded-lg border px-4 py-3 ${item.tone}`}>
                      <div className="text-sm font-semibold">{item.label}</div>
                      <div className="text-xs mt-1 opacity-80">{item.detail}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg border border-zinc-200 p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">Contracted Services</h2>
                  <p className="text-sm text-zinc-500">Enabled services define what ANC owes this client.</p>
                </div>
                <span className="text-xs font-semibold text-zinc-500">{activeServices.length} on</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {services.map((service) => (
                  <div key={service.service_type_id} className={`rounded-lg border p-4 transition-colors ${serviceTone(service)}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">{service.name}</p>
                        {service.description && <p className="text-xs text-zinc-500 mt-1">{service.description}</p>}
                      </div>
                      <button
                        onClick={() => patch({ service_type_id: service.service_type_id, enabled: !service.enabled })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${service.enabled ? 'bg-[#0A52EF]' : 'bg-zinc-300'}`}
                        aria-label={`Toggle ${service.name}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${service.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    <div className={`mt-3 text-[11px] font-semibold uppercase tracking-[0.12em] ${service.enabled ? 'text-emerald-700' : 'text-zinc-400'}`}>
                      {service.enabled ? 'Contracted' : 'Not included'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-zinc-200 p-6">
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">Linked Venues</h2>
                  <p className="text-sm text-zinc-500">The physical places connected to this account.</p>
                </div>
                <button
                  onClick={() => patch({ linked_venue_ids: selectedVenues })}
                  className="px-4 py-2 bg-zinc-900 text-white rounded-lg text-sm font-semibold hover:bg-zinc-800"
                >
                  Save Venue Links
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
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
              {linkedVenues.length > 0 && (
                <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {linkedVenues.map((venue) => (
                    <div key={venue.id} className="rounded-lg border border-zinc-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link href={`/venues/${venue.id}`} className="text-sm font-semibold text-zinc-900 hover:text-[#0A52EF]">{venue.name}</Link>
                          <p className="text-xs text-zinc-500 mt-1">{venue.market || 'No market'} / {venue.relation_type}</p>
                        </div>
                        <span className={`text-[11px] font-semibold rounded-full border px-2 py-1 ${venue.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-zinc-50 text-zinc-500 border-zinc-200'}`}>
                          {venue.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                        <div className="rounded bg-zinc-50 border border-zinc-100 p-2">
                          <div className="text-zinc-500">Open cases</div>
                          <div className="text-sm font-bold text-zinc-900">{venue.open_ticket_count}</div>
                        </div>
                        <div className="rounded bg-zinc-50 border border-zinc-100 p-2">
                          <div className="text-zinc-500">Events</div>
                          <div className="text-sm font-bold text-zinc-900">{venue.upcoming_event_count}</div>
                        </div>
                      </div>
                      <div className="mt-3 text-xs text-zinc-500">
                        {venue.primary_contact_email ? venue.primary_contact_email : 'No primary contact email'}
                      </div>
                      {venue.portal_token && (
                        <button
                          type="button"
                          onClick={() => copyPortal(venue)}
                          className="mt-3 text-xs font-semibold text-[#0A52EF] hover:text-[#0840C0]"
                        >
                          {portalCopied === venue.id ? 'Portal copied' : 'Copy portal link'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-5">
            <div className="bg-white rounded-lg border border-zinc-200 p-6">
              <h2 className="text-lg font-semibold text-zinc-900">Quick Actions</h2>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Link href={`/tickets?venue_id=${primaryVenue?.id || ''}`} className="rounded-lg border border-zinc-200 px-3 py-3 text-sm font-semibold text-zinc-800 hover:border-zinc-400">Create Case</Link>
                <Link href="/events" className="rounded-lg border border-zinc-200 px-3 py-3 text-sm font-semibold text-zinc-800 hover:border-zinc-400">View Events</Link>
                {primaryVenue ? <Link href={`/venues/${primaryVenue.id}`} className="rounded-lg border border-zinc-200 px-3 py-3 text-sm font-semibold text-zinc-800 hover:border-zinc-400">Open Venue</Link> : <span className="rounded-lg border border-zinc-100 px-3 py-3 text-sm font-semibold text-zinc-400">Open Venue</span>}
                <Link href="/portals" className="rounded-lg border border-zinc-200 px-3 py-3 text-sm font-semibold text-zinc-800 hover:border-zinc-400">Portals</Link>
              </div>
            </div>

            <div className="bg-white rounded-lg border border-zinc-200 p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">Support Snapshot</h2>
                  <p className="text-sm text-zinc-500">Open cases across linked venues.</p>
                </div>
                <Link href="/tickets" className="text-xs font-semibold text-[#0A52EF] hover:text-[#0840C0]">All cases</Link>
              </div>
              <div className="space-y-2">
                {supportTickets.length === 0 ? (
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 text-sm text-zinc-500">No open support cases for this client.</div>
                ) : supportTickets.map((ticket) => (
                  <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="block rounded-lg border border-zinc-200 p-3 hover:border-zinc-300">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 truncate">T-{String(ticket.ticket_number).padStart(5, '0')} / {ticket.title}</p>
                        <p className="text-xs text-zinc-500 mt-1">{ticket.venue_name || 'No venue'} / {ticket.created_date} / {ticket.source}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${priorityClass(ticket.priority)}`}>{ticket.priority}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-lg border border-zinc-200 p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-zinc-900">Upcoming Events</h2>
                  <p className="text-sm text-zinc-500">Next events connected to this account.</p>
                </div>
                <Link href="/events" className="text-xs font-semibold text-[#0A52EF] hover:text-[#0840C0]">Calendar</Link>
              </div>
              <div className="space-y-2">
                {upcomingEvents.length === 0 ? (
                  <div className="rounded-lg border border-zinc-100 bg-zinc-50 p-4 text-sm text-zinc-500">No upcoming events found.</div>
                ) : upcomingEvents.map((event) => (
                  <Link key={event.id} href={`/events/${event.id}`} className="block rounded-lg border border-zinc-200 p-3 hover:border-zinc-300">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 truncate">{event.summary}</p>
                        <p className="text-xs text-zinc-500 mt-1">{event.venue_name || 'No venue'} / {formatDate(event.event_date)}{event.start_time ? ` at ${event.start_time}` : ''}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-semibold ${event.event_requires_staffing && event.assigned_count === 0 ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                        {event.event_requires_staffing && event.assigned_count === 0 ? 'Needs staff' : event.workflow_status}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            {!client.parent_client_name && (
              <div className="bg-white rounded-lg border border-zinc-200 p-6">
                <h2 className="text-lg font-semibold text-zinc-900">Sub-clients</h2>
                {subclients.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {subclients.map((subclient) => (
                      <Link key={subclient.id} href={`/clients/${subclient.id}`} className="px-2.5 py-1 rounded-full bg-zinc-100 text-xs text-zinc-700 hover:bg-zinc-200 transition-colors">
                        {subclient.name}{subclient.sport ? ` / ${subclient.sport}` : ''}
                      </Link>
                    ))}
                  </div>
                )}
                <div className="mt-4 grid grid-cols-1 gap-3">
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
        </div>
      </div>
    </DashboardLayout>
  )
}
