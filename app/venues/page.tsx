'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { useAuth } from '@/lib/useAuth'

interface Venue {
  id: string
  name: string
  market: string
  event_count: number
  assigned_count: number
  ticket_count: number
  requires_assignment: boolean
  venue_type: string
  logo_url: string | null
  is_active: boolean
  feed_url: string | null
  active_service_count: number
  automation_status: 'auto_sync_active' | 'no_services' | 'no_feed_url' | 'inactive'
  aliases?: string[]
}

const venueTypeConfig: Record<string, { label: string; badge: string; dot: string }> = {
  sports: { label: 'Sports', badge: 'bg-blue-100 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  ooh: { label: 'OOH', badge: 'bg-amber-100 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  facility: { label: 'Facility', badge: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
}

const automationStatusConfig = {
  auto_sync_active: { label: 'Auto-Sync Active', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  no_services: { label: 'No Services', style: 'bg-zinc-50 text-zinc-500 border-zinc-200' },
  no_feed_url: { label: 'No Feed URL', style: 'bg-amber-50 text-amber-700 border-amber-200' },
  inactive: { label: 'Inactive', style: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
} as const

export default function VenuesPage() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('week')
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [newVenue, setNewVenue] = useState({ name: '', address: '', primary_contact_name: '', primary_contact_email: '', venue_type: 'sports' })
  const [submitting, setSubmitting] = useState(false)
  const [showUnassignedOnly, setShowUnassignedOnly] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const [myVenuesOnly, setMyVenuesOnly] = useState(false)
  // Joe 2026-05-04 8:56 PM: filter venues by their default-staffing toggle.
  // Mirrors the "Needs Staffing" filter on /events.
  const [staffingFilter, setStaffingFilter] = useState<'all' | 'on' | 'off'>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  useEffect(() => {
    fetch('/api/preferences?key=venues.viewMode')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Preferences request failed (${response.status})`)
        return response.json()
      })
      .then((data) => {
        if (data.value === 'grid' || data.value === 'list') setViewMode(data.value)
      })
      .catch((error) => console.error('Failed to load venue view preference:', error))
  }, [])
  const router = useRouter()
  const auth = useAuth()

  const updateViewMode = async (mode: 'grid' | 'list') => {
    setViewMode(mode)
    try {
      const response = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'venues.viewMode', value: mode }),
      })
      if (!response.ok) throw new Error(`Preferences request failed (${response.status})`)
    } catch (error) {
      console.error('Failed to save venue view preference:', error)
    }
  }

  useEffect(() => {
    const fetchVenues = async () => {
      try {
        setLoading(true)
        const params = new URLSearchParams({ period })
        if (showInactive) params.set('include_inactive', 'true')
        if (myVenuesOnly) params.set('assigned_to_me', 'true')
        const res = await fetch(`/api/venues?${params.toString()}`)
        if (res.ok) {
          const data = await res.json()
          setVenues(data.venues || [])
        }
      } catch (err) {
        console.error('Failed to fetch venues:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchVenues()
  }, [period, showInactive, myVenuesOnly])

  const periodLabel = period === 'today' ? 'today' : period === 'week' ? 'this week' : 'this month'

  const filtered = venues.filter(v => {
    const q = search.toLowerCase()
    // Joe 2026-05-04: aliases participate in search ("Flyers" → Xfinity Mobile Arena).
    const matchesSearch = !q
      || (v.name || '').toLowerCase().includes(q)
      || (v.market || '').toLowerCase().includes(q)
      || (v.aliases || []).some(a => a.toLowerCase().includes(q))
    const matchesType = typeFilter === 'all' || v.venue_type === typeFilter
    const matchesUnassigned = !showUnassignedOnly || (v.requires_assignment && Number(v.event_count) > 0 && Number(v.assigned_count) < Number(v.event_count))
    const matchesStaffing = staffingFilter === 'all'
      || (staffingFilter === 'on' && v.requires_assignment)
      || (staffingFilter === 'off' && !v.requires_assignment)
    return matchesSearch && matchesType && matchesUnassigned && matchesStaffing
  })

  // Live counts for the filter chip labels.
  const staffingOnCount = venues.filter(v => v.requires_assignment).length
  const staffingOffCount = venues.filter(v => !v.requires_assignment).length

  // Stats
  const totalEvents = venues.reduce((sum, v) => sum + (Number(v.event_count) || 0), 0)
  const totalAssigned = venues.reduce((sum, v) => sum + (Number(v.assigned_count) || 0), 0)
  const needsAttention = venues.filter(v => v.requires_assignment && Number(v.event_count) > 0 && Number(v.assigned_count) < Number(v.event_count)).length

  return (
    <DashboardLayout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Venues</h1>
            <p className="text-sm text-zinc-500 mt-1">{venues.length} venues &middot; {totalEvents} events {periodLabel} &middot; {needsAttention > 0 ? <button onClick={() => setShowUnassignedOnly(!showUnassignedOnly)} className={`font-semibold hover:underline transition-colors ${showUnassignedOnly ? 'text-[#0A52EF]' : 'text-orange-600'}`}>{showUnassignedOnly ? `Showing ${needsAttention} unassigned — click to clear` : `${needsAttention} need assignment`}</button> : <span className="text-emerald-600 font-semibold">All covered</span>}</p>
          </div>
          {auth.isManager && (
            <div className="flex items-center gap-2">
              {auth.isAdmin && (
                <button onClick={() => setShowInactive(!showInactive)}
                  className={`px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors ${showInactive ? 'bg-zinc-800 text-white border-zinc-800' : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'}`}>
                  {showInactive ? 'Hide Inactive' : 'Show Inactive'}
                </button>
              )}
              <button onClick={() => setShowAdd(!showAdd)}
                className="px-5 py-2.5 bg-[#0A52EF] text-white rounded-lg text-sm font-semibold hover:bg-[#0840C0] transition-colors shadow-sm">
                {showAdd ? 'Cancel' : '+ Add Venue'}
              </button>
            </div>
          )}
        </div>

        {/* Controls row */}
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="flex-1 relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" placeholder="Search venues or markets..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] text-zinc-900 placeholder:text-zinc-400" />
          </div>

          {/* Scope + type filter chips */}
          <div className="flex gap-1.5 flex-wrap">
            <button onClick={() => setMyVenuesOnly(!myVenuesOnly)}
              title="Show only venues you are linked to"
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 ${
                myVenuesOnly
                  ? 'bg-[#0A52EF] text-white shadow-sm'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-400'
              }`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              My Venues
            </button>
            <span className="w-px bg-zinc-200 self-stretch mx-0.5"></span>
            {[
              { key: 'all', label: 'All' },
              { key: 'sports', label: 'Sports' },
              { key: 'ooh', label: 'OOH' },
              { key: 'facility', label: 'Facility' },
            ].map(f => (
              <button key={f.key} onClick={() => setTypeFilter(f.key)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  typeFilter === f.key
                    ? 'bg-zinc-900 text-white shadow-sm'
                    : 'bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-400'
                }`}>
                {f.label}
              </button>
            ))}
            {/* Joe 2026-05-04 8:56 PM: default-staffing toggle filter */}
            <span className="w-px bg-zinc-200 self-stretch mx-0.5"></span>
            <button
              onClick={() => setStaffingFilter(staffingFilter === 'on' ? 'all' : 'on')}
              title="Show only venues whose default staffing toggle is ON"
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 ${
                staffingFilter === 'on'
                  ? 'bg-[#0A52EF] text-white shadow-sm'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-400'
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${staffingFilter === 'on' ? 'bg-white' : 'bg-emerald-500'}`}></span>
              Staffing On
              <span className={`text-[10px] font-bold ${staffingFilter === 'on' ? 'opacity-80' : 'text-zinc-400'}`}>
                {staffingOnCount}
              </span>
            </button>
            <button
              onClick={() => setStaffingFilter(staffingFilter === 'off' ? 'all' : 'off')}
              title="Show only venues whose default staffing toggle is OFF (support-only)"
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all inline-flex items-center gap-1.5 ${
                staffingFilter === 'off'
                  ? 'bg-zinc-900 text-white shadow-sm'
                  : 'bg-white border border-zinc-200 text-zinc-600 hover:border-zinc-400'
              }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${staffingFilter === 'off' ? 'bg-white' : 'bg-zinc-400'}`}></span>
              Support Only
              <span className={`text-[10px] font-bold ${staffingFilter === 'off' ? 'opacity-80' : 'text-zinc-400'}`}>
                {staffingOffCount}
              </span>
            </button>
          </div>

          {/* Period selector */}
          <div className="flex bg-zinc-100 rounded-lg p-1 border border-zinc-200">
            {(['today', 'week', 'month'] as const).map((f) => (
              <button key={f} onClick={() => setPeriod(f)}
                className={`px-4 py-2 rounded-md text-xs font-semibold transition-all ${
                  period === f ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
                }`}>
                {f === 'today' ? 'Today' : f === 'week' ? 'Week' : 'Month'}
              </button>
            ))}
          </div>

          {/* View toggle (Joe 2026-05-04: list view for managers scanning many venues) */}
          <div className="flex bg-zinc-100 rounded-lg p-1 border border-zinc-200">
            <button onClick={() => void updateViewMode('grid')} title="Grid view"
              className={`px-3 py-2 rounded-md text-xs font-semibold transition-all inline-flex items-center gap-1.5 ${
                viewMode === 'grid' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h6v6H4zM14 6h6v6h-6zM4 16h6v4H4zM14 16h6v4h-6z" />
              </svg>
              Grid
            </button>
            <button onClick={() => void updateViewMode('list')} title="List view"
              className={`px-3 py-2 rounded-md text-xs font-semibold transition-all inline-flex items-center gap-1.5 ${
                viewMode === 'list' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              List
            </button>
          </div>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
            <h3 className="text-sm font-bold text-zinc-900 mb-4">Add New Venue</h3>
            <form onSubmit={async (e) => {
              e.preventDefault()
              if (!newVenue.name.trim()) return
              setSubmitting(true)
              try {
                const res = await fetch('/api/venues/create', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(newVenue),
                })
                if (res.ok) {
                  setNewVenue({ name: '', address: '', primary_contact_name: '', primary_contact_email: '', venue_type: 'sports' })
                  setShowAdd(false)
                  const vRes = await fetch(`/api/venues?period=${period}`)
                  if (vRes.ok) { const d = await vRes.json(); setVenues(d.venues || []) }
                }
              } catch {} finally { setSubmitting(false) }
            }} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Venue Name *</label>
                <input type="text" value={newVenue.name} onChange={e => setNewVenue(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Madison Square Garden"
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none" required />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Address</label>
                <input type="text" value={newVenue.address} onChange={e => setNewVenue(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="e.g., 4 Pennsylvania Plaza, New York, NY"
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Contact Name</label>
                <input type="text" value={newVenue.primary_contact_name} onChange={e => setNewVenue(prev => ({ ...prev, primary_contact_name: e.target.value }))}
                  placeholder="e.g., John Smith"
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Contact Email</label>
                <input type="email" value={newVenue.primary_contact_email} onChange={e => setNewVenue(prev => ({ ...prev, primary_contact_email: e.target.value }))}
                  placeholder="e.g., john@venue.com"
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-600 mb-1.5">Venue Type</label>
                <select value={newVenue.venue_type} onChange={e => setNewVenue(prev => ({ ...prev, venue_type: e.target.value }))}
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none">
                  <option value="sports">Sports</option>
                  <option value="ooh">OOH (Out-of-Home)</option>
                  <option value="facility">Facility</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <button type="submit" disabled={submitting}
                  className="px-6 py-2.5 bg-[#0A52EF] text-white rounded-lg text-sm font-semibold hover:bg-[#0840C0] disabled:opacity-50 transition-colors shadow-sm">
                  {submitting ? 'Creating...' : 'Create Venue'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Venue grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-zinc-200 p-16 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto text-zinc-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <p className="text-sm font-medium text-zinc-500">
              {myVenuesOnly && venues.length === 0
                ? 'No venues linked to you yet'
                : venues.length === 0
                ? 'No venues yet'
                : 'No venues match your filter'}
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              {myVenuesOnly && venues.length === 0
                ? 'Ask an admin to link you on a venue\'s Staff tab, or clear "My Venues" to see everything.'
                : venues.length === 0
                ? 'Click "+ Add Venue" to create your first one.'
                : 'Try adjusting your search or filter.'}
            </p>
          </div>
        ) : viewMode === 'list' ? (
          <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 border-b border-zinc-200">
                  <tr className="text-left">
                    <th className="px-4 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Venue</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Market</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Type</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Aliases</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-right">Events</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-right">Assigned</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider text-right">Tickets</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Coverage</th>
                    <th className="px-4 py-2.5 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Automation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {filtered.map((venue) => {
                    const eventCount = Number(venue.event_count) || 0
                    const assignedCount = Number(venue.assigned_count) || 0
                    const allAssigned = eventCount > 0 && assignedCount >= eventCount
                    const hasEvents = eventCount > 0
                    const needsAssignment = venue.requires_assignment
                    const typeConf = venueTypeConfig[venue.venue_type] || venueTypeConfig.sports
                    const coveragePct = eventCount > 0 ? Math.round((assignedCount / eventCount) * 100) : 0
                    const coverageColor = !needsAssignment
                      ? 'text-zinc-400'
                      : !hasEvents
                        ? 'text-zinc-400'
                        : allAssigned
                          ? 'text-emerald-700'
                          : assignedCount > 0
                            ? 'text-amber-700'
                            : 'text-red-700'
                    return (
                      <tr key={venue.id}
                        onClick={() => venue.is_active && window.open(`/venues/${venue.id}`, '_blank', 'noopener,noreferrer')}
                        className={`${venue.is_active ? 'hover:bg-zinc-50 cursor-pointer' : 'opacity-60'} transition-colors`}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-md flex-shrink-0 overflow-hidden flex items-center justify-center border border-zinc-200">
                              {venue.logo_url ? (
                                <img src={venue.logo_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full bg-gradient-to-br from-[#0A52EF] to-[#0840C0] flex items-center justify-center">
                                  <span className="text-white font-bold text-[9px]">{(venue.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                                </div>
                              )}
                            </div>
                            <span className="font-semibold text-zinc-900 truncate">{venue.name}</span>
                            {!venue.is_active && (
                              <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-zinc-100 text-zinc-500 border-zinc-200">Inactive</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-zinc-600">{venue.market || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${typeConf.badge}`}>
                            {typeConf.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-zinc-600 max-w-xs">
                          {venue.aliases && venue.aliases.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {venue.aliases.slice(0, 3).map((a, i) => (
                                <span key={`${a}-${i}`} className="text-[10px] bg-zinc-100 text-zinc-700 rounded px-1.5 py-0.5">{a}</span>
                              ))}
                              {venue.aliases.length > 3 && (
                                <span className="text-[10px] text-zinc-400">+{venue.aliases.length - 3}</span>
                              )}
                            </div>
                          ) : <span className="text-zinc-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-zinc-900">{eventCount}</td>
                        <td className="px-4 py-2.5 text-right text-zinc-700">{needsAssignment ? `${assignedCount}/${eventCount}` : '—'}</td>
                        <td className="px-4 py-2.5 text-right font-semibold text-zinc-700">{Number(venue.ticket_count) || 0}</td>
                        <td className={`px-4 py-2.5 font-bold text-xs ${coverageColor}`}>
                          {!needsAssignment ? 'Support only' : !hasEvents ? `No events ${periodLabel}` : `${coveragePct}%`}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${automationStatusConfig[venue.automation_status]?.style || automationStatusConfig.no_services.style}`}>
                            {automationStatusConfig[venue.automation_status]?.label || 'No Services'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-4">
            {filtered.map((venue) => {
              const eventCount = Number(venue.event_count) || 0
              const assignedCount = Number(venue.assigned_count) || 0
              const ticketCount = Number(venue.ticket_count) || 0
              const allAssigned = eventCount > 0 && assignedCount >= eventCount
              const hasEvents = eventCount > 0
              const needsAssignment = venue.requires_assignment
              const typeConf = venueTypeConfig[venue.venue_type] || venueTypeConfig.sports
              const coveragePct = eventCount > 0 ? Math.round((assignedCount / eventCount) * 100) : 0

              // Health indicator
              const health = !needsAssignment ? 'neutral'
                : !hasEvents ? 'idle'
                : allAssigned ? 'good'
                : assignedCount > 0 ? 'warning'
                : 'critical'

              const healthColors = {
                good: 'bg-emerald-500',
                warning: 'bg-amber-500',
                critical: 'bg-red-500',
                idle: 'bg-zinc-300',
                neutral: 'bg-zinc-300',
              }

              return (
                <div key={venue.id}
                  className={`bg-white rounded-xl border transition-all overflow-hidden ${venue.is_active ? 'border-zinc-200 hover:border-zinc-300 hover:shadow-md cursor-pointer group' : 'border-zinc-200 opacity-60'}`}
                  onClick={() => venue.is_active && window.open(`/venues/${venue.id}`, '_blank', 'noopener,noreferrer')}>
                  {/* Health strip */}
                  <div className={`h-1 ${venue.is_active ? healthColors[health] : 'bg-zinc-300'}`}></div>
                  <div className="p-4">
                    {/* Row 1: Logo + Name + Type badge */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center border border-zinc-200">
                          {venue.logo_url ? (
                            <img src={venue.logo_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-[#0A52EF] to-[#0840C0] flex items-center justify-center">
                              <span className="text-white font-bold text-[10px]">{(venue.name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                            </div>
                          )}
                        </div>
                        <h3 className="min-w-0 text-sm font-bold text-zinc-900 group-hover:text-[#0A52EF] transition-colors leading-tight">{venue.name}</h3>
                      </div>
                      <div className="flex max-w-[48%] flex-wrap items-center justify-end gap-1.5 flex-shrink-0">
                        {!venue.is_active && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border bg-zinc-100 text-zinc-500 border-zinc-200">Inactive</span>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${automationStatusConfig[venue.automation_status]?.style || automationStatusConfig.no_services.style}`}>
                          {automationStatusConfig[venue.automation_status]?.label || 'No Services'}
                        </span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${typeConf.badge}`}>
                          {typeConf.label}
                        </span>
                      </div>
                    </div>

                    {/* Row 2: Market */}
                    <p className="text-xs font-medium text-zinc-500 mb-4">{venue.market || 'No market'}</p>

                    {/* Row 3: Metrics */}
                    <div className="flex items-center gap-4 mb-3">
                      <div>
                        <p className="text-xl font-bold text-zinc-900">{eventCount}</p>
                        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Events</p>
                      </div>
                      {needsAssignment && (
                        <>
                          <div className="w-px h-8 bg-zinc-200"></div>
                          <div>
                            <p className="text-xl font-bold text-zinc-900">{assignedCount}<span className="text-sm text-zinc-400">/{eventCount}</span></p>
                            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Assigned</p>
                          </div>
                        </>
                      )}
                      <div className="w-px h-8 bg-zinc-200"></div>
                      <div>
                        <p className="text-xl font-bold text-zinc-900">{ticketCount}</p>
                        <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">Tickets</p>
                      </div>
                    </div>

                    {/* Row 4: Coverage bar + status */}
                    {needsAssignment && hasEvents ? (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[11px] font-bold ${allAssigned ? 'text-emerald-700' : coveragePct > 0 ? 'text-amber-700' : 'text-red-700'}`}>
                            {coveragePct}% coverage
                          </span>
                        </div>
                        <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${allAssigned ? 'bg-emerald-500' : coveragePct > 0 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.max(coveragePct, 3)}%` }} />
                        </div>
                      </div>
                    ) : !needsAssignment ? (
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-400"></span>
                        <span className="text-[11px] font-semibold text-zinc-500">Support only</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-300"></span>
                        <span className="text-[11px] font-semibold text-zinc-400">No events {periodLabel}</span>
                      </div>
                    )}

                    {/* Deactivate / Activate button — admin only */}
                    {auth.isAdmin && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          await fetch(`/api/venues/${venue.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ is_active: !venue.is_active }),
                          })
                          setVenues(prev => prev.map(v => v.id === venue.id ? { ...v, is_active: !venue.is_active } : v))
                        }}
                        className={`mt-3 w-full py-1.5 rounded-lg text-xs font-semibold border transition-colors ${venue.is_active ? 'text-zinc-500 border-zinc-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200' : 'text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100'}`}>
                        {venue.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
