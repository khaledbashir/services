'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useState } from 'react'
import { MapContainer, GeoJSON, CircleMarker, Tooltip } from 'react-leaflet'
import type { LatLngBoundsExpression } from 'leaflet'

export interface ShowcaseMapPoint {
  id: string
  name: string
  lat: number
  lng: number
  live: boolean
}

// Continental-US framing. Locked, non-interactive — this is a hero visual on a
// showcase page, not a tool the viewer pans around.
const US_BOUNDS: LatLngBoundsExpression = [
  [24.396308, -125.0],
  [49.384358, -66.93457],
]

const CORAL = '#F96167'

// Self-contained landmass: render a bundled US states outline rather than
// pulling external map tiles. Guarantees the country always shows, on-brand,
// with no third-party CDN dependency or DNS risk.
const landStyle = {
  fillColor: '#222C61',
  fillOpacity: 0.55,
  color: '#3A4788',
  weight: 0.7,
  opacity: 0.8,
}

export default function ShowcaseLiveMap({ points }: { points: ShowcaseMapPoint[] }) {
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
      boundsOptions={{ padding: [10, 10] }}
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      dragging={false}
      touchZoom={false}
      keyboard={false}
      className="anc-live-map"
      style={{ height: '100%', width: '100%', background: 'transparent' }}
    >
      {geo && <GeoJSON data={geo} style={() => landStyle} />}

      {/* Every venue in the network — quiet background constellation. */}
      {dormant.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={2.5}
          pathOptions={{ color: '#7E88C8', fillColor: '#7E88C8', fillOpacity: 0.5, weight: 0 }}
        />
      ))}

      {/* Tonight — glowing, pulsing, with a name on hover. */}
      {live.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={6.5}
          className="anc-live-pulse"
          pathOptions={{ color: CORAL, fillColor: CORAL, fillOpacity: 0.95, weight: 2 }}
        >
          <Tooltip direction="top" offset={[0, -6]} opacity={1} className="anc-live-tooltip">
            {p.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
