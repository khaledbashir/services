'use client'

import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import type { VenueMapVenue } from '@/components/venue-map-canvas'

const VenueMapCanvas = dynamic(() => import('@/components/venue-map-canvas'), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
})

interface MapData {
  venues: VenueMapVenue[]
  byState: Record<string, { name: string; abbr: string; lat: number; lng: number; venues: VenueMapVenue[] }>
  unmapped: VenueMapVenue[]
  totalVenues: number
  mappedVenues: number
  stateCount: number
  serviceTypes: string[]
}

const roleColors: Record<string, string> = {
  admin: '#3B82F6',
  manager: '#10B981',
  technician: '#6B7280',
}

const venueTypeTheme: Record<string, { chip: string; marker: string; glow: string }> = {
  sports: { chip: 'bg-blue-50 text-blue-700 border-blue-200', marker: '#0A52EF', glow: 'from-blue-500/10 to-cyan-500/5' },
  ooh: { chip: 'bg-amber-50 text-amber-700 border-amber-200', marker: '#F59E0B', glow: 'from-amber-500/10 to-orange-500/5' },
  facility: { chip: 'bg-violet-50 text-violet-700 border-violet-200', marker: '#8B5CF6', glow: 'from-violet-500/10 to-fuchsia-500/5' },
}

function venueInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
}

export default function VenueMapPage() {
  const [data, setData] = useState<MapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedVenue, setSelectedVenue] = useState<VenueMapVenue | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const [filterService, setFilterService] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeProgress, setGeocodeProgress] = useState<{ current: number; total: number } | null>(null)
  const [geocodeMessage, setGeocodeMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const router = useRouter()

  const autoGeocodeTriggered = useState(false)

  useEffect(() => {
    fetch('/api/venues/map')
      .then((res) => res.json())
      .then((nextData) => {
        setData(nextData)
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setLoading(false)
      })
  }, [])

  // Auto-geocode unmapped venues on first load
  useEffect(() => {
    if (!data || autoGeocodeTriggered[0] || geocoding) return
    if (data.unmapped.length > 0) {
      autoGeocodeTriggered[1](true)
      handleGeocode()
    }
  }, [data])

  const handleGeocode = async () => {
    if (!data?.unmapped || data.unmapped.length === 0) return

    setGeocoding(true)
    setGeocodeProgress({ current: 0, total: data.unmapped.length })
    setGeocodeMessage(null)

    try {
      const response = await fetch('/api/venues/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: data.unmapped.length }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok) {
        setGeocodeMessage({
          type: 'error',
          text: result?.error || 'Geocoding failed. Please try again.',
        })
        return
      }

      setGeocodeMessage({
        type: 'success',
        text: `Geocoded ${result?.successful || 0} venue${result?.successful === 1 ? '' : 's'}${result?.failed ? `, ${result.failed} not found` : ''}.`,
      })

      const refreshed = await fetch('/api/venues/map').then((res) => res.json())
      setData(refreshed)
    } catch (err) {
      console.error('Geocoding failed:', err)
      setGeocodeMessage({
        type: 'error',
        text: 'Geocoding failed. Please check the connection and try again.',
      })
    } finally {
      setGeocoding(false)
      setGeocodeProgress(null)
    }
  }

  const filteredVenues = useMemo(() => {
    const venues = data?.venues || []
    const q = search.trim().toLowerCase()

    return venues.filter((venue) => {
      const matchesType = filterType === 'all' || venue.venue_type === filterType
      const matchesService = filterService === 'all' || (venue.services || []).some(s => s === filterService)
      const matchesSearch = !q
        || venue.name.toLowerCase().includes(q)
        || (venue.market || '').toLowerCase().includes(q)
        || (venue.address || '').toLowerCase().includes(q)

      return matchesType && matchesService && matchesSearch
    })
  }, [data?.venues, filterType, filterService, search])

  const mappedVenues = filteredVenues.filter((venue) => venue.lat && venue.lng)
  const filteredVenueIds = new Set(filteredVenues.map((venue) => venue.id))
  const filteredUnmapped = (data?.unmapped || []).filter((venue) => filteredVenueIds.has(venue.id))
  const selectedTheme = venueTypeTheme[selectedVenue?.venue_type || 'sports'] || venueTypeTheme.sports

  useEffect(() => {
    if (!selectedVenue) return
    const stillVisible = filteredVenues.find((venue) => venue.id === selectedVenue.id)
    if (!stillVisible) setSelectedVenue(null)
  }, [filteredVenues, selectedVenue])

  const statCards = [
    { label: 'Visible Venues', value: filteredVenues.length, caption: 'after filters and search' },
    { label: 'Mapped', value: mappedVenues.length, caption: 'ready on the live map' },
    { label: 'Need Geocoding', value: filteredUnmapped.length, caption: 'address present but no coordinates' },
    { label: 'Upcoming Events', value: filteredVenues.reduce((sum, venue) => sum + venue.event_count, 0), caption: 'next 30 days across visible venues' },
  ]

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Skeleton className="h-28 w-full rounded-[28px]" />
          <Skeleton className="h-[720px] w-full rounded-[28px]" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div className="relative overflow-hidden rounded-2xl border border-[#16306A] bg-[linear-gradient(135deg,#071017_0%,#0B1B35_52%,#0A52EF_100%)] px-5 py-5 text-white shadow-sm">
          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] uppercase tracking-[0.28em] text-white/60 font-semibold">Venue Intelligence</p>
              <h1 className="mt-1.5 text-2xl font-semibold">Live Venue Map</h1>
              <p className="mt-2 max-w-2xl text-sm text-white/75">
                Monitor mapped venues, geocoding gaps, and upcoming event volume.
              </p>
              {geocodeMessage && (
                <p className={`mt-2 text-sm font-medium ${geocodeMessage.type === 'success' ? 'text-emerald-200' : 'text-rose-200'}`}>
                  {geocodeMessage.text}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {statCards.map((card) => (
                <div key={card.label} className="rounded-xl border border-white/10 bg-white/8 px-4 py-3 backdrop-blur-sm">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-white/55">{card.label}</p>
                  <p className="mt-1.5 text-2xl font-semibold text-white">{card.value}</p>
                  <p className="mt-1 text-[11px] text-white/60">{card.caption}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-1 flex-col gap-4 md:flex-row md:items-center">
            <div className="w-full xl:max-w-md">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search venues, markets, or addresses..."
                className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {['all', 'sports', 'ooh', 'facility'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setFilterType(type)}
                  className={`rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                    filterType === type
                      ? 'border-[#0A52EF] bg-[#0A52EF] text-white shadow-sm'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300'
                  }`}
                >
                  {type === 'all' ? 'All Venues' : type.toUpperCase()}
                </button>
              ))}
            </div>
            {(data?.serviceTypes || []).length > 0 && (
              <select
                value={filterService}
                onChange={(e) => setFilterService(e.target.value)}
                className="min-w-[200px] rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 shadow-sm outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
              >
                <option value="all">All Services</option>
                {(data?.serviceTypes || []).map((svc) => (
                  <option key={svc} value={svc}>{svc}</option>
                ))}
              </select>
            )}
          </div>

          {data?.unmapped && data.unmapped.length > 0 && (
            <button
              type="button"
              onClick={handleGeocode}
              disabled={geocoding}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#0A52EF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0840C0] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {geocoding ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  {geocodeProgress ? `Geocoding ${geocodeProgress.total}` : 'Geocoding...'}
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Geocode {data.unmapped.length} Venues
                </>
              )}
            </button>
          )}
        </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_360px]">
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/70 px-5 py-3.5">
              <div>
                <h2 className="text-sm font-semibold text-zinc-900">Interactive Map</h2>
                <p className="mt-1 text-xs text-zinc-500">Pan, zoom, and click markers to inspect venues.</p>
              </div>
              <p className="text-xs text-zinc-500">{mappedVenues.length} visible pins</p>
            </div>
            <div className="relative h-[min(62vh,620px)] min-h-[440px] bg-[#dfe8f3]">
              {mappedVenues.length > 0 ? (
                <VenueMapCanvas
                  venues={mappedVenues}
                  selectedVenue={selectedVenue}
                  onSelectVenue={(venue) => setSelectedVenue(venue)}
                />
              ) : (
                <div className="flex h-full items-center justify-center px-6 text-center">
                  <div>
                    <p className="text-lg font-semibold text-zinc-900">No mapped venues in this view</p>
                    <p className="mt-2 text-sm text-zinc-500">Try clearing filters or geocoding the remaining venues.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {selectedVenue ? (
              <div className={`overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm`}>
                <div className={`bg-gradient-to-br ${selectedTheme.glow} px-5 py-5`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900 text-sm font-semibold text-white shadow-sm">
                        {venueInitials(selectedVenue.name)}
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate text-lg font-semibold text-zinc-900">{selectedVenue.name}</h2>
                        <p className="mt-1 text-sm text-zinc-500">{selectedVenue.market || 'No market set'}</p>
                      </div>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${selectedTheme.chip}`}>
                      {selectedVenue.venue_type.toUpperCase()}
                    </span>
                  </div>

                  <p className="mt-4 text-sm text-zinc-600">{selectedVenue.address || 'No address on file.'}</p>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-zinc-200 bg-white/80 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Upcoming</p>
                      <p className="mt-1 text-2xl font-semibold text-zinc-900">{selectedVenue.event_count}</p>
                    </div>
                    <div className="rounded-xl border border-zinc-200 bg-white/80 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400">Assigned Staff</p>
                      <p className="mt-1 text-2xl font-semibold text-zinc-900">{selectedVenue.staff.length}</p>
                    </div>
                  </div>

                  {(selectedVenue.services || []).length > 0 && (
                    <div className="mt-5">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2">Service Obligations</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedVenue.services.map((svc) => (
                          <span key={svc} className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-[11px] font-medium text-blue-700">
                            {svc}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="mt-5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => router.push(`/venues/${selectedVenue.id}`)}
                      className="inline-flex items-center justify-center rounded-lg bg-[#0A52EF] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0840C0]"
                    >
                      Open Venue
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedVenue(null)}
                      className="inline-flex items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-600 transition hover:border-zinc-300"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="border-t border-zinc-200 px-5 py-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-zinc-900">Assigned Staff</h3>
                    <p className="text-xs text-zinc-500">{selectedVenue.staff.length} linked</p>
                  </div>

                  {selectedVenue.staff.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {selectedVenue.staff.map((staff) => (
                        <span
                          key={staff.id}
                          className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium"
                          style={{ backgroundColor: `${roleColors[staff.role] || '#6B7280'}20`, color: roleColors[staff.role] || '#6B7280' }}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: roleColors[staff.role] || '#6B7280' }} />
                          {staff.name}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-zinc-500">No venue-linked staff yet.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
                <div className="px-5 py-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#0A52EF]">Selection</p>
                  <h2 className="mt-2 text-lg font-semibold text-zinc-900">Choose a venue on the map</h2>
                  <p className="mt-2 text-sm text-zinc-500">
                    Click any marker to open venue details, staffing visibility, and a direct link into the full venue page.
                  </p>
                </div>
              </div>
            )}

            {filteredUnmapped.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50 shadow-sm">
                <div className="px-5 py-5">
                  <p className="text-sm font-semibold text-amber-900">{filteredUnmapped.length} visible venues still need geocoding</p>
                  <p className="mt-1 text-sm text-amber-700">They have addresses but no coordinates yet, so they cannot appear on the live map.</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {filteredUnmapped.slice(0, 6).map((venue) => (
                      <span key={venue.id} className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                        {venue.name}
                      </span>
                    ))}
                    {filteredUnmapped.length > 6 && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                        +{filteredUnmapped.length - 6} more
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
