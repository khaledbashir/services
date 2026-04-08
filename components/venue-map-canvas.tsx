'use client'

import { MapContainer, TileLayer, CircleMarker, Tooltip, ZoomControl, useMap } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'
import { useEffect } from 'react'

export interface VenueMapVenue {
  id: string
  name: string
  address: string
  market: string
  venue_type: string
  logo_url: string | null
  lat: number | null
  lng: number | null
  event_count: number
  requires_assignment: boolean
  staff: Array<{ id: string; name: string; role: string }>
  services: string[]
}

const venueTypeColors: Record<string, string> = {
  sports: '#0A52EF',
  ooh: '#F59E0B',
  facility: '#8B5CF6',
}

const defaultBounds: LatLngBoundsExpression = [
  [24.396308, -125.0],
  [49.384358, -66.93457],
]

function MapViewport({
  venues,
  selectedVenue,
}: {
  venues: VenueMapVenue[]
  selectedVenue: VenueMapVenue | null
}) {
  const map = useMap()

  useEffect(() => {
    if (selectedVenue?.lat && selectedVenue?.lng) {
      map.flyTo([selectedVenue.lat, selectedVenue.lng], Math.max(map.getZoom(), 9), {
        duration: 0.7,
      })
      return
    }

    if (venues.length === 0) {
      map.fitBounds(defaultBounds, { padding: [24, 24] })
      return
    }

    const bounds: LatLngBoundsExpression = venues.map((venue) => [venue.lat!, venue.lng!])
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 6 })
  }, [map, selectedVenue, venues])

  return null
}

function markerRadius(eventCount: number, isSelected: boolean) {
  const base = Math.min(18, 8 + Math.sqrt(Math.max(eventCount, 0)) * 2.5)
  return isSelected ? base + 4 : base
}

export default function VenueMapCanvas({
  venues,
  selectedVenue,
  onSelectVenue,
}: {
  venues: VenueMapVenue[]
  selectedVenue: VenueMapVenue | null
  onSelectVenue: (venue: VenueMapVenue) => void
}) {
  return (
    <MapContainer
      center={[39.5, -98.35]}
      zoom={4}
      zoomControl={false}
      scrollWheelZoom
      className="h-full w-full"
    >
      <ZoomControl position="bottomright" />
      <TileLayer
        attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <MapViewport venues={venues} selectedVenue={selectedVenue} />

      {venues.map((venue) => {
        const isSelected = selectedVenue?.id === venue.id
        const color = venueTypeColors[venue.venue_type] || venueTypeColors.sports

        return (
          <CircleMarker
            key={venue.id}
            center={[venue.lat!, venue.lng!]}
            radius={markerRadius(venue.event_count, isSelected)}
            pathOptions={{
              color: isSelected ? '#ffffff' : color,
              weight: isSelected ? 4 : 2,
              fillColor: color,
              fillOpacity: venue.requires_assignment ? 0.92 : 0.7,
            }}
            eventHandlers={{
              click: () => onSelectVenue(venue),
            }}
          >
            <Tooltip direction="top" offset={[0, -6]} opacity={1}>
              <div className="min-w-[160px]">
                <p className="text-xs font-semibold text-zinc-900">{venue.name}</p>
                <p className="text-[11px] text-zinc-500">{venue.market || 'No market'}</p>
                <p className="text-[11px] text-zinc-500 mt-1">
                  {venue.event_count} upcoming event{venue.event_count === 1 ? '' : 's'} · {venue.staff.length} staff
                </p>
                {venue.services.length > 0 && (
                  <p className="text-[10px] text-blue-600 mt-0.5">{venue.services.join(', ')}</p>
                )}
              </div>
            </Tooltip>
          </CircleMarker>
        )
      })}
    </MapContainer>
  )
}
