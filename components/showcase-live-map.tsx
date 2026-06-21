'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useState } from 'react'
import { MapContainer, GeoJSON, CircleMarker, Marker, Tooltip, ZoomControl } from 'react-leaflet'
import L, { type LatLngBoundsExpression } from 'leaflet'

export interface ShowcaseMapPoint {
  id: string
  name: string
  lat: number
  lng: number
  live: boolean
}

const US_BOUNDS: LatLngBoundsExpression = [
  [24.396308, -125.0],
  [49.384358, -66.93457],
]

const CORAL = '#F96167'

// Bundled US states outline rendered as the landmass — no external tiles.
const landStyle = {
  fillColor: '#1A2151',
  fillOpacity: 0.65,
  color: '#3A4788',
  weight: 0.7,
  opacity: 0.85,
}

// A glowing light column rising from a live venue — "the country at night."
const beamIcon = L.divIcon({
  className: 'anc-beam-icon',
  html: '<div class="anc-beamwrap"><div class="anc-beam-col"></div><div class="anc-beam-base"></div></div>',
  iconSize: [12, 54],
  iconAnchor: [6, 50],
})

export default function ShowcaseLiveMap({
  points,
  interactive = true,
}: {
  points: ShowcaseMapPoint[]
  interactive?: boolean
}) {
  const [geo, setGeo] = useState<any>(null)

  useEffect(() => {
    let alive = true
    fetch('/us-states.geojson')
      .then((r) => r.json())
      .then((d) => alive && setGeo(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  const live = points.filter((p) => p.live)
  const dormant = points.filter((p) => !p.live)

  return (
    <MapContainer
      bounds={US_BOUNDS}
      boundsOptions={{ padding: [16, 16] }}
      minZoom={3}
      maxZoom={9}
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom={false}
      doubleClickZoom={interactive}
      dragging={interactive}
      touchZoom={interactive}
      keyboard={false}
      className="anc-map-dark"
      style={{ height: '100%', width: '100%', background: '#070912' }}
    >
      {interactive && <ZoomControl position="bottomright" />}
      {geo && <GeoJSON data={geo} style={() => landStyle} />}

      {/* Quiet background constellation — every venue in the network. */}
      {dormant.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={2.2}
          pathOptions={{ color: '#6E78BE', fillColor: '#6E78BE', fillOpacity: 0.45, weight: 0 }}
        />
      ))}

      {/* Tonight — glowing light columns rising from each active venue. */}
      {live.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={beamIcon}>
          <Tooltip direction="top" offset={[0, -48]} opacity={1} className="anc-live-tooltip">
            {p.name}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  )
}
