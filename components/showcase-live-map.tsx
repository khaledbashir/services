'use client'

import 'leaflet/dist/leaflet.css'
import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet'
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

const NAVY = '#1E2761'
const CORAL = '#F96167'

export default function ShowcaseLiveMap({ points }: { points: ShowcaseMapPoint[] }) {
  const live = points.filter((p) => p.live)
  const dormant = points.filter((p) => !p.live)

  return (
    <MapContainer
      bounds={US_BOUNDS}
      boundsOptions={{ padding: [12, 12] }}
      zoomControl={false}
      attributionControl={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      dragging={false}
      touchZoom={false}
      keyboard={false}
      style={{ height: '100%', width: '100%', background: 'transparent' }}
    >
      <TileLayer url="https://{s}.basemap.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png" />

      {/* Every venue in the network — quiet background constellation. */}
      {dormant.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={2.5}
          pathOptions={{
            color: '#5560A8',
            fillColor: '#5560A8',
            fillOpacity: 0.45,
            weight: 0,
          }}
        />
      ))}

      {/* Tonight — glowing, pulsing, with a name on hover. */}
      {live.map((p) => (
        <CircleMarker
          key={p.id}
          center={[p.lat, p.lng]}
          radius={7}
          className="anc-live-pulse"
          pathOptions={{
            color: CORAL,
            fillColor: CORAL,
            fillOpacity: 0.9,
            weight: 2,
          }}
        >
          <Tooltip direction="top" offset={[0, -6]} opacity={1} className="anc-live-tooltip">
            {p.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  )
}
