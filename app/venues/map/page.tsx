'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface Venue {
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
}

interface MapData {
  venues: Venue[]
  byState: Record<string, { name: string; abbr: string; lat: number; lng: number; venues: Venue[] }>
  unmapped: Venue[]
  totalVenues: number
  mappedVenues: number
  stateCount: number
}

// US map bounds for coordinate projection
const MAP_BOUNDS = {
  minLat: 24.396308,  // Southernmost point (Florida Keys)
  maxLat: 49.384358,  // Northernmost point (Minnesota)
  minLng: -125.0,     // Westernmost point (California)
  maxLng: -66.93457,  // Easternmost point (Maine)
}

const MAP_WIDTH = 960
const MAP_HEIGHT = 600

function projectCoords(lat: number, lng: number): { x: number; y: number } {
  const x = ((lng - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)) * MAP_WIDTH
  const y = ((MAP_BOUNDS.maxLat - lat) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * MAP_HEIGHT
  return { x, y }
}

const roleColors: Record<string, string> = {
  admin: '#3B82F6',
  manager: '#10B981',
  technician: '#6B7280',
}

const venueTypeColors: Record<string, string> = {
  sports: '#0A52EF',
  ooh: '#F59E0B',
  facility: '#8B5CF6',
}

export default function VenueMapPage() {
  const [data, setData] = useState<MapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null)
  const [hoveredVenue, setHoveredVenue] = useState<Venue | null>(null)
  const [filterType, setFilterType] = useState<string>('all')
  const router = useRouter()

  useEffect(() => {
    fetch('/api/venues/map')
      .then(res => res.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(err => { console.error(err); setLoading(false) })
  }, [])

  const filteredVenues = data?.venues.filter(v => 
    filterType === 'all' || v.venue_type === filterType
  ) || []

  const mappedVenues = filteredVenues.filter(v => v.lat && v.lng)

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-[600px] w-full" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Venue Map</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {data?.mappedVenues || 0} of {data?.totalVenues || 0} venues mapped across {data?.stateCount || 0} states
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Type filter */}
            {['all', 'sports', 'ooh', 'facility'].map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filterType === type
                    ? 'bg-zinc-900 text-white'
                    : 'bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-300'
                }`}
              >
                {type === 'all' ? 'All' : type.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* Map container */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
          <div className="relative" style={{ height: '600px' }}>
            {/* SVG Map */}
            <svg
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
              className="w-full h-full"
              style={{ background: 'linear-gradient(to bottom, #E8F4F8, #D1E8F0)' }}
            >
              {/* Simple US outline (approximate) */}
              <path
                d="M 120 150 L 200 120 L 280 130 L 350 100 L 420 110 L 480 90 L 550 100 L 620 120 L 700 150 L 750 180 L 800 200 L 840 250 L 850 300 L 840 350 L 820 400 L 780 450 L 720 480 L 650 500 L 580 510 L 500 520 L 420 510 L 350 490 L 280 470 L 200 440 L 140 400 L 100 350 L 80 300 L 90 250 L 100 200 Z"
                fill="#F3F4F6"
                stroke="#D1D5DB"
                strokeWidth="2"
              />

              {/* Venue pins */}
              {mappedVenues.map(venue => {
                const { x, y } = projectCoords(venue.lat!, venue.lng!)
                const isSelected = selectedVenue?.id === venue.id
                const isHovered = hoveredVenue?.id === venue.id
                const color = venueTypeColors[venue.venue_type] || venueTypeColors.sports
                
                return (
                  <g key={venue.id}>
                    {/* Pin */}
                    <circle
                      cx={x}
                      cy={y}
                      r={isSelected ? 12 : isHovered ? 10 : 8}
                      fill={color}
                      stroke={isSelected ? '#000' : '#fff'}
                      strokeWidth={isSelected ? 3 : 2}
                      className="cursor-pointer transition-all"
                      onClick={() => setSelectedVenue(isSelected ? null : venue)}
                      onMouseEnter={() => setHoveredVenue(venue)}
                      onMouseLeave={() => setHoveredVenue(null)}
                    />
                    {/* Event count badge */}
                    {venue.event_count > 0 && (
                      <text
                        x={x}
                        y={y + 4}
                        textAnchor="middle"
                        className="text-[10px] font-bold fill-white pointer-events-none"
                      >
                        {venue.event_count}
                      </text>
                    )}
                  </g>
                )
              })}

              {/* Legend */}
              <g transform="translate(20, 520)">
                <rect x="0" y="0" width="200" height="70" fill="white" fillOpacity="0.9" rx="8" />
                <text x="10" y="20" className="text-xs font-semibold fill-zinc-700">Venue Types</text>
                {Object.entries(venueTypeColors).map(([type, color], i) => (
                  <g key={type} transform={`translate(10, ${35 + i * 15})`}>
                    <circle cx="5" cy="0" r="5" fill={color} />
                    <text x="15" y="4" className="text-[11px] fill-zinc-600 capitalize">{type}</text>
                  </g>
                ))}
              </g>
            </svg>

            {/* Hover tooltip */}
            {hoveredVenue && !selectedVenue && (
              <div
                className="absolute bg-white rounded-lg shadow-lg border border-zinc-200 p-3 pointer-events-none z-10"
                style={{
                  left: `${((hoveredVenue.lng! - MAP_BOUNDS.minLng) / (MAP_BOUNDS.maxLng - MAP_BOUNDS.minLng)) * 100}%`,
                  top: `${((MAP_BOUNDS.maxLat - hoveredVenue.lat!) / (MAP_BOUNDS.maxLat - MAP_BOUNDS.minLat)) * 100}%`,
                  transform: 'translate(-50%, -120%)',
                }}
              >
                <p className="text-sm font-semibold text-zinc-900">{hoveredVenue.name}</p>
                <p className="text-xs text-zinc-500">{hoveredVenue.market || 'No market'}</p>
                <p className="text-xs text-zinc-400 mt-1">{hoveredVenue.event_count} events</p>
                {hoveredVenue.staff.length > 0 && (
                  <p className="text-xs text-zinc-500 mt-1">{hoveredVenue.staff.length} staff assigned</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Selected venue detail panel */}
        {selectedVenue && (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
            <div className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#0A52EF] to-[#0840C0] flex items-center justify-center">
                    <span className="text-white font-bold text-sm">
                      {selectedVenue.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-zinc-900">{selectedVenue.name}</h2>
                    <p className="text-sm text-zinc-500">{selectedVenue.address || 'No address'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${
                    selectedVenue.venue_type === 'sports' ? 'bg-blue-50 text-blue-700' :
                    selectedVenue.venue_type === 'ooh' ? 'bg-amber-50 text-amber-700' :
                    'bg-purple-50 text-purple-700'
                  }`}>
                    {selectedVenue.venue_type.toUpperCase()}
                  </span>
                  <button
                    onClick={() => router.push(`/venues/${selectedVenue.id}`)}
                    className="px-4 py-2 bg-[#0A52EF] text-white rounded-lg text-sm font-semibold hover:bg-[#0840C0] transition-colors"
                  >
                    View Venue →
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-4 gap-4 mt-6">
                <div className="bg-zinc-50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-zinc-900">{selectedVenue.event_count}</p>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Events (30d)</p>
                </div>
                <div className="bg-zinc-50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-zinc-900">{selectedVenue.staff.length}</p>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Staff Assigned</p>
                </div>
                <div className="bg-zinc-50 rounded-lg p-4">
                  <p className="text-sm font-bold text-zinc-900">{selectedVenue.market || '—'}</p>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Market</p>
                </div>
                <div className="bg-zinc-50 rounded-lg p-4">
                  <p className={`text-sm font-bold ${selectedVenue.requires_assignment ? 'text-blue-600' : 'text-zinc-400'}`}>
                    {selectedVenue.requires_assignment ? 'Required' : 'Support Only'}
                  </p>
                  <p className="text-xs text-zinc-500 uppercase tracking-wider">Assignment</p>
                </div>
              </div>

              {/* Staff list */}
              {selectedVenue.staff.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold text-zinc-900 mb-3">Assigned Staff</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedVenue.staff.map(s => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: roleColors[s.role] + '20', color: roleColors[s.role] }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: roleColors[s.role] }} />
                        {s.name}
                        <span className="opacity-60 capitalize">({s.role})</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Unmapped venues warning */}
        {data?.unmapped && data.unmapped.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  {data.unmapped.length} venues need geocoding
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  These venues have addresses but no coordinates. Run the geocoding script to add them to the map.
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {data.unmapped.slice(0, 5).map(v => (
                    <span key={v.id} className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                      {v.name}
                    </span>
                  ))}
                  {data.unmapped.length > 5 && (
                    <span className="text-xs text-amber-600">+{data.unmapped.length - 5} more</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}