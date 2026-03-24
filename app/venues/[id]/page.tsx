'use client'

import { useEffect, useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { useAuth } from '@/lib/useAuth'

interface VenueDetail {
  id: string
  name: string
  market_name: string
  address: string
  slack_channel_id: string | null
  service_responsibilities: string[]
  primary_contact_name: string | null
  primary_contact_email: string | null
  requires_assignment: boolean
  portal_token: string | null
  venue_type: string
  distribution_emails: string[]
}

interface VenueService {
  service_type_id: string
  name: string
  description: string | null
  enabled: boolean
}

interface UpcomingEvent {
  id: string
  event_name: string
  league: string
  event_date: string
  start_time: string
  assigned_techs: string
  workflow_status: string
}

interface AssignedStaff {
  id: string
  full_name: string
  role: string
}

interface VenueScreen {
  id: string
  display_name: string
  manufacturer: string | null
  model: string | null
  pixel_pitch: number | null
  width_ft: number | null
  height_ft: number | null
  brightness_nits: number | null
  environment: string | null
  location_zone: string | null
  install_date: string | null
  is_active: boolean
}

const leagueColors: Record<string, { bg: string; text: string }> = {
  NBA: { bg: 'bg-orange-50', text: 'text-orange-600' },
  NHL: { bg: 'bg-blue-50', text: 'text-blue-600' },
  NCAAM: { bg: 'bg-violet-50', text: 'text-violet-600' },
  NCAAW: { bg: 'bg-pink-50', text: 'text-pink-600' },
  MLB: { bg: 'bg-red-50', text: 'text-red-600' },
  AHL: { bg: 'bg-teal-50', text: 'text-teal-600' },
  MiLB: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  'NBA G League': { bg: 'bg-orange-50', text: 'text-orange-500' },
}

const workflowConfig: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  pending: { label: 'Pending', dot: 'bg-zinc-300', bg: 'bg-zinc-50', text: 'text-zinc-600' },
  checked_in: { label: 'Checked In', dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
  game_ready: { label: 'Game Ready', dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  post_game_submitted: { label: 'Complete', dot: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
}

interface LinkedStaff {
  id: string
  staff_id: string
  full_name: string
  role: string
  email: string
}

interface AllStaff {
  id: string
  full_name: string
  role: string
}

const roleColors: Record<string, string> = {
  admin: 'bg-blue-500',
  manager: 'bg-emerald-500',
  technician: 'bg-zinc-500',
}

export default function VenueDetailPage({ params }: { params: { id: string } }) {
  const [venue, setVenue] = useState<VenueDetail | null>(null)
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [assignedStaff, setAssignedStaff] = useState<AssignedStaff[]>([])
  const [venueServices, setVenueServices] = useState<VenueService[]>([])
  const [screens, setScreens] = useState<VenueScreen[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'events' | 'staff' | 'specs' | 'settings'>('events')
  const [slackChannelId, setSlackChannelId] = useState('')
  const [savingSlack, setSavingSlack] = useState(false)
  const [togglingService, setTogglingService] = useState<string | null>(null)
  const [portalCopied, setPortalCopied] = useState(false)
  const [emailingSchedule, setEmailingSchedule] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [distEmails, setDistEmails] = useState<string[]>([])
  const [newDistEmail, setNewDistEmail] = useState('')
  const [savingDist, setSavingDist] = useState(false)
  const [linkedStaff, setLinkedStaff] = useState<LinkedStaff[]>([])
  const [allStaff, setAllStaff] = useState<AllStaff[]>([])
  const [staffSearch, setStaffSearch] = useState('')
  const [showStaffDropdown, setShowStaffDropdown] = useState(false)
  const router = useRouter()
  const auth = useAuth()

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/venues/${params.id}`)
        if (res.ok) {
          const data = await res.json()
          setVenue(data.venue)
          setUpcomingEvents(data.upcomingEvents || [])
          setAssignedStaff(data.assignedStaff || [])
          setVenueServices(data.venueServices || [])
          setSlackChannelId(data.venue.slack_channel_id || '')
          setDistEmails(data.venue.distribution_emails || [])

          // Fetch screens and linked staff
          const [screensRes, linkedStaffRes, allStaffRes] = await Promise.all([
            fetch(`/api/venues/${params.id}/screens`),
            fetch(`/api/venues/${params.id}/staff`),
            fetch(`/api/staff`),
          ])
          if (screensRes.ok) {
            const screensData = await screensRes.json()
            setScreens(screensData.screens || [])
          }
          if (linkedStaffRes.ok) {
            const data = await linkedStaffRes.json()
            setLinkedStaff(data.linkedStaff || [])
          }
          if (allStaffRes.ok) {
            const data = await allStaffRes.json()
            setAllStaff((data.staff || []).filter((s: any) => s.is_active !== false))
          }
        }
      } catch (err) {
        console.error('Failed to fetch venue:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [params.id])

  const handleSlackUpdate = async (e: FormEvent) => {
    e.preventDefault()
    if (!venue) return
    setSavingSlack(true)
    try {
      const res = await fetch(`/api/venues/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slack_channel_id: slackChannelId || null }),
      })
      if (res.ok) { const data = await res.json(); setVenue(data.venue) }
    } catch {} finally { setSavingSlack(false) }
  }

  const toggleService = async (serviceTypeId: string, enabled: boolean) => {
    setTogglingService(serviceTypeId)
    try {
      const res = await fetch(`/api/venues/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_type_id: serviceTypeId, enabled }),
      })
      if (res.ok) { const data = await res.json(); setVenue(data.venue); setVenueServices(data.venueServices || []) }
    } catch {} finally { setTogglingService(null) }
  }

  const toggleRequiresAssignment = async (val: boolean) => {
    try {
      const res = await fetch(`/api/venues/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requires_assignment: val }),
      })
      if (res.ok) { const data = await res.json(); setVenue(data.venue) }
    } catch {}
  }

  const updateVenueType = async (venueType: string) => {
    try {
      const res = await fetch(`/api/venues/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_type: venueType }),
      })
      if (res.ok) { const data = await res.json(); setVenue(data.venue) }
    } catch {}
  }

  const linkStaff = async (staffId: string) => {
    try {
      const res = await fetch(`/api/venues/${params.id}/staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: staffId }),
      })
      if (res.ok) {
        const data = await res.json()
        setLinkedStaff(data.linkedStaff || [])
        setStaffSearch('')
        setShowStaffDropdown(false)
      }
    } catch {}
  }

  const unlinkStaff = async (staffId: string) => {
    try {
      const res = await fetch(`/api/venues/${params.id}/staff`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: staffId }),
      })
      if (res.ok) {
        const data = await res.json()
        setLinkedStaff(data.linkedStaff || [])
      }
    } catch {}
  }

  const linkedStaffIds = new Set(linkedStaff.map(s => s.staff_id.toString()))
  const filteredStaff = allStaff.filter(
    s => !linkedStaffIds.has(s.id.toString()) &&
      s.full_name.toLowerCase().includes(staffSearch.toLowerCase())
  )

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const formatTime = (d: string) => new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })
  const getInitials = (name: string | null | undefined) => { if (!name) return '?'; const p = name.split(' '); return (p[0]?.[0] + (p[1]?.[0] || '')).toUpperCase() }

  if (loading) {
    return <DashboardLayout><div className="space-y-6"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div></DashboardLayout>
  }

  if (!venue) {
    return <DashboardLayout><div className="bg-white rounded border border-[#E8E8E8] p-12 text-center"><p className="text-zinc-500">Venue not found</p></div></DashboardLayout>
  }

  const enabledServices = venueServices.filter(s => s.enabled)

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back */}
        <button onClick={() => router.push('/venues')} className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">← Back to Venues</button>

        {/* Header */}
        <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
          <div className="p-8 flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-zinc-900">{venue.name}</h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-sm text-zinc-500">{venue.market_name}</span>
                {venue.address && <><span className="text-zinc-300">•</span><span className="text-sm text-zinc-500">{venue.address}</span></>}
              </div>
              <div className="flex items-center gap-4 mt-3">
                <div className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded ${venue.requires_assignment ? 'bg-blue-50 text-blue-700' : 'bg-zinc-100 text-zinc-500'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${venue.requires_assignment ? 'bg-blue-500' : 'bg-zinc-400'}`}></span>
                  {venue.requires_assignment ? 'Assignment Required' : 'Support Only'}
                </div>
                {enabledServices.length > 0 && (
                  <span className="text-xs text-zinc-400">{enabledServices.length} active service{enabledServices.length !== 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
            {/* Quick stats */}
            <div className="flex gap-6 text-center">
              <div>
                <p className="text-2xl font-semibold text-zinc-900">{upcomingEvents.length}</p>
                <p className="text-xs text-zinc-500">Upcoming</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-zinc-900">{assignedStaff.length}</p>
                <p className="text-xs text-zinc-500">Staff</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-zinc-900">{upcomingEvents.filter(e => e.assigned_techs).length}</p>
                <p className="text-xs text-zinc-500">Assigned</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-t border-[#E8E8E8] flex px-8">
            {(['events', 'staff', 'specs', 'settings'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-[#0A52EF] text-[#0A52EF]' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}>
                {tab === 'events' && `Events (${upcomingEvents.length})`}
                {tab === 'staff' && `Staff (${assignedStaff.length})`}
                {tab === 'specs' && `Specs${screens.length > 0 ? ` (${screens.length})` : ''}`}
                {tab === 'settings' && 'Settings'}
              </button>
            ))}
          </div>
        </div>

        {/* EVENTS TAB */}
        {activeTab === 'events' && (
          <div className="space-y-3">
            <div className="flex justify-end gap-2">
              <a
                href={`/api/schedule/export?venue_id=${params.id}&period=30`}
                download
                className="px-3 py-1.5 border border-[#E8E8E8] rounded text-xs font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 transition-colors inline-flex items-center gap-1.5"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Export PDF
              </a>
              {venue.primary_contact_email && (
                <button
                  onClick={async () => {
                    setEmailingSchedule(true)
                    try {
                      const res = await fetch(`/api/schedule/export?venue_id=${params.id}&period=30&action=email`)
                      if (res.ok) {
                        setEmailSent(true)
                        setTimeout(() => setEmailSent(false), 3000)
                      }
                    } catch {} finally { setEmailingSchedule(false) }
                  }}
                  disabled={emailingSchedule}
                  className="px-3 py-1.5 border border-[#E8E8E8] rounded text-xs font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  {emailingSchedule ? 'Sending...' : emailSent ? 'Sent!' : `Email to ${venue.primary_contact_name || venue.primary_contact_email}`}
                </button>
              )}
            </div>
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
            {upcomingEvents.length === 0 ? (
              <div className="p-12 text-center text-zinc-400 text-sm">No upcoming events in the next 30 days</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E8E8E8] bg-zinc-50">
                    <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Date</th>
                    <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Event</th>
                    <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">League</th>
                    <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Time</th>
                    <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Assigned</th>
                    <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingEvents.map(event => {
                    const lc = leagueColors[event.league] || { bg: 'bg-zinc-100', text: 'text-zinc-500' }
                    const wf = workflowConfig[event.workflow_status] || workflowConfig.pending
                    return (
                      <tr key={event.id} onClick={() => router.push(`/events/${event.id}`)} className="border-b border-[#E8E8E8] hover:bg-zinc-50 cursor-pointer transition-colors">
                        <td className="py-3 px-6 text-zinc-600 text-xs whitespace-nowrap">{formatDate(event.event_date)}</td>
                        <td className="py-3 px-6 font-medium text-zinc-900">{event.event_name}</td>
                        <td className="py-3 px-6"><span className={`text-xs font-medium px-2 py-0.5 rounded ${lc.bg} ${lc.text}`}>{event.league}</span></td>
                        <td className="py-3 px-6 text-zinc-600 text-xs">{formatTime(event.start_time)}</td>
                        <td className="py-3 px-6 text-xs text-zinc-600 max-w-40 truncate">{event.assigned_techs || <span className="text-zinc-400">Unassigned</span>}</td>
                        <td className="py-3 px-6">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex items-center gap-1.5 w-fit ${wf.bg} ${wf.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${wf.dot}`}></span>{wf.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
          </div>
        )}

        {/* STAFF TAB */}
        {activeTab === 'staff' && (
          <div className="space-y-6">
            {/* Linked Staff — Admin only */}
            {auth.isAdmin && (
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-zinc-900">Linked Staff</h3>
                  <p className="text-xs text-zinc-500 mt-0.5">Staff members permanently linked to this venue. Technicians will only see data for their linked venues.</p>
                </div>
                {/* Current linked staff chips */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {linkedStaff.length === 0 && (
                    <p className="text-xs text-zinc-400">No staff linked to this venue</p>
                  )}
                  {linkedStaff.map(s => (
                    <span key={s.staff_id} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium group">
                      {s.full_name}
                      <span className="text-blue-400 capitalize">({s.role})</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); unlinkStaff(s.staff_id) }}
                        className="ml-0.5 text-blue-400 hover:text-red-500 transition-colors"
                        title={`Remove ${s.full_name}`}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
                {/* Add staff search */}
                <div className="relative">
                  <input
                    type="text"
                    value={staffSearch}
                    onChange={e => { setStaffSearch(e.target.value); setShowStaffDropdown(true) }}
                    onFocus={() => setShowStaffDropdown(true)}
                    placeholder="Search staff to link..."
                    className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none"
                  />
                  {showStaffDropdown && (
                    <div className="absolute z-20 w-full mt-1 bg-white border border-[#E8E8E8] rounded shadow-lg max-h-60 overflow-y-auto"
                      onMouseDown={e => e.preventDefault()}>
                      {filteredStaff.length === 0 ? (
                        <div className="px-3 py-3 text-xs text-zinc-400">
                          {allStaff.length === 0 ? 'Loading staff...' : staffSearch ? 'No matching staff found' : 'All staff already linked'}
                        </div>
                      ) : (
                        filteredStaff.slice(0, 20).map(s => (
                          <button
                            key={s.id}
                            onClick={() => linkStaff(s.id)}
                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-blue-50 transition-colors flex justify-between items-center border-b border-zinc-50 last:border-0"
                          >
                            <span className="text-zinc-900 font-medium">{s.full_name}</span>
                            <span className="text-xs text-zinc-400 capitalize">{s.role}</span>
                          </button>
                        ))
                      )}
                      {showStaffDropdown && (
                        <button
                          onClick={() => { setShowStaffDropdown(false); setStaffSearch('') }}
                          className="w-full text-center px-3 py-2 text-xs text-zinc-400 hover:text-zinc-600 border-t border-[#E8E8E8]"
                        >
                          Close
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Event-based staff (existing) */}
            <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
              <div className="px-6 py-3 border-b border-[#E8E8E8] bg-zinc-50">
                <h3 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Staff Assigned via Events</h3>
              </div>
              {assignedStaff.length === 0 ? (
                <div className="p-12 text-center text-zinc-400 text-sm">No staff assigned to events at this venue</div>
              ) : (
                <div className="divide-y divide-[#E8E8E8]">
                  {assignedStaff.map(staff => (
                    <div key={staff.id} onClick={() => router.push(`/staff/${staff.id}`)} className="px-6 py-4 flex items-center gap-4 hover:bg-zinc-50 cursor-pointer transition-colors">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-semibold ${roleColors[staff.role] || 'bg-zinc-500'}`}>
                        {getInitials(staff.full_name)}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-zinc-900">{staff.full_name}</p>
                        <p className="text-xs text-zinc-500 capitalize">{staff.role}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SPECS TAB */}
        {activeTab === 'specs' && (
          <div className="space-y-6">
            {screens.length === 0 ? (
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-12 text-center">
                <p className="text-zinc-500 text-sm">No display specifications on file</p>
                <p className="text-xs text-zinc-400 mt-1">Specs auto-populate when a proposal is signed in the Proposal Engine</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {screens.map(screen => (
                  <div key={screen.id} className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
                    <div className={`h-1 ${screen.is_active ? 'bg-emerald-500' : 'bg-zinc-300'}`}></div>
                    <div className="p-5">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-zinc-900">{screen.display_name}</h3>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${screen.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                          {screen.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>

                      {screen.location_zone && (
                        <p className="text-xs text-zinc-500 mb-3 capitalize">{screen.location_zone}</p>
                      )}

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        {screen.manufacturer && (
                          <div>
                            <p className="text-zinc-500 font-medium">Manufacturer</p>
                            <p className="text-zinc-900 mt-0.5">{screen.manufacturer}</p>
                          </div>
                        )}
                        {screen.model && (
                          <div>
                            <p className="text-zinc-500 font-medium">Model</p>
                            <p className="text-zinc-900 mt-0.5">{screen.model}</p>
                          </div>
                        )}
                        {screen.pixel_pitch && (
                          <div>
                            <p className="text-zinc-500 font-medium">Pixel Pitch</p>
                            <p className="text-zinc-900 mt-0.5">{screen.pixel_pitch}mm</p>
                          </div>
                        )}
                        {(screen.width_ft || screen.height_ft) && (
                          <div>
                            <p className="text-zinc-500 font-medium">Dimensions</p>
                            <p className="text-zinc-900 mt-0.5">{screen.width_ft}' x {screen.height_ft}'</p>
                          </div>
                        )}
                        {screen.brightness_nits && (
                          <div>
                            <p className="text-zinc-500 font-medium">Brightness</p>
                            <p className="text-zinc-900 mt-0.5">{screen.brightness_nits.toLocaleString()} nits</p>
                          </div>
                        )}
                        {screen.environment && (
                          <div>
                            <p className="text-zinc-500 font-medium">Environment</p>
                            <p className="text-zinc-900 mt-0.5 capitalize">{screen.environment}</p>
                          </div>
                        )}
                        {screen.install_date && (
                          <div>
                            <p className="text-zinc-500 font-medium">Installed</p>
                            <p className="text-zinc-900 mt-0.5">{new Date(screen.install_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column */}
            <div className="space-y-6">
              {/* Client Portal */}
              {venue.portal_token && (
                <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
                  <h3 className="text-sm font-semibold text-zinc-900 mb-2">Client Portal</h3>
                  <p className="text-xs text-zinc-500 mb-3">Share this link with venue contacts for self-service access</p>
                  <div className="bg-zinc-50 font-mono text-xs rounded p-3 mb-3 overflow-hidden text-ellipsis whitespace-nowrap border border-[#E8E8E8]">
                    {typeof window !== 'undefined' ? `${window.location.origin}/portal/${venue.portal_token}` : `/portal/${venue.portal_token}`}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/portal/${venue.portal_token}`)
                      setPortalCopied(true)
                      setTimeout(() => setPortalCopied(false), 2000)
                    }}
                    className="w-full text-xs px-3 py-2 bg-[#0A52EF] text-white rounded hover:bg-[#0840C0] font-medium transition-colors"
                  >
                    {portalCopied ? 'Copied!' : 'Copy Portal Link'}
                  </button>
                </div>
              )}

              {/* Venue Type */}
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
                <h3 className="text-sm font-semibold text-zinc-900 mb-2">Venue Type</h3>
                <p className="text-xs text-zinc-500 mb-3">Categorize this venue to distinguish sports, OOH, and facility locations</p>
                <div className="flex gap-2">
                  {[
                    { value: 'sports', label: 'Sports', style: 'bg-blue-50 text-blue-700 border-blue-200' },
                    { value: 'ooh', label: 'OOH', style: 'bg-amber-50 text-amber-700 border-amber-200' },
                    { value: 'facility', label: 'Facility', style: 'bg-purple-50 text-purple-700 border-purple-200' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => updateVenueType(opt.value)}
                      className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
                        venue.venue_type === opt.value ? opt.style : 'bg-white text-zinc-400 border-[#E8E8E8] hover:border-zinc-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Assignment */}
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
                <h3 className="text-sm font-semibold text-zinc-900 mb-2">Assignment</h3>
                <p className="text-xs text-zinc-500 mb-4">Does this venue require staff assignment for events?</p>
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleRequiresAssignment(!venue.requires_assignment)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${venue.requires_assignment ? 'bg-[#0A52EF]' : 'bg-zinc-300'}`}>
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${venue.requires_assignment ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className="text-sm text-zinc-700">{venue.requires_assignment ? 'Required' : 'Not required (support only)'}</span>
                </div>
              </div>

              {/* Slack */}
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
                <h3 className="text-sm font-semibold text-zinc-900 mb-3">Slack Channel</h3>
                <form onSubmit={handleSlackUpdate} className="space-y-3">
                  <input type="text" value={slackChannelId} onChange={e => setSlackChannelId(e.target.value)}
                    placeholder="e.g., C05XXXXXX"
                    className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30" />
                  <button type="submit" disabled={savingSlack}
                    className="w-full px-3 py-2 bg-[#0A52EF] text-white text-sm rounded hover:bg-[#0840C0] font-medium transition-colors disabled:opacity-50">
                    {savingSlack ? 'Saving...' : 'Save'}
                  </button>
                </form>
              </div>
              {/* Distribution List */}
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
                <h3 className="text-sm font-semibold text-zinc-900 mb-2">Ticket Distribution List</h3>
                <p className="text-xs text-zinc-500 mb-3">These contacts receive automatic email updates when tickets are updated, commented on, or resolved</p>
                <div className="space-y-2 mb-3">
                  {distEmails.map((email, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-zinc-50 rounded px-3 py-2">
                      <span className="text-sm text-zinc-700">{email}</span>
                      <button
                        onClick={async () => {
                          const updated = distEmails.filter((_, i) => i !== idx)
                          setDistEmails(updated)
                          setSavingDist(true)
                          try {
                            await fetch(`/api/venues/${params.id}`, {
                              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ distribution_emails: updated }),
                            })
                          } catch {} finally { setSavingDist(false) }
                        }}
                        className="text-zinc-400 hover:text-red-500 text-xs"
                      >Remove</button>
                    </div>
                  ))}
                  {distEmails.length === 0 && <p className="text-xs text-zinc-400">No distribution contacts added</p>}
                </div>
                <form onSubmit={async (e) => {
                  e.preventDefault()
                  if (!newDistEmail.trim() || !newDistEmail.includes('@')) return
                  const updated = [...distEmails, newDistEmail.trim()]
                  setDistEmails(updated)
                  setNewDistEmail('')
                  setSavingDist(true)
                  try {
                    await fetch(`/api/venues/${params.id}`, {
                      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ distribution_emails: updated }),
                    })
                  } catch {} finally { setSavingDist(false) }
                }} className="flex gap-2">
                  <input type="email" value={newDistEmail} onChange={e => setNewDistEmail(e.target.value)}
                    placeholder="email@client.com"
                    className="flex-1 px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30" />
                  <button type="submit" disabled={savingDist}
                    className="px-3 py-2 bg-[#0A52EF] text-white text-sm rounded hover:bg-[#0840C0] font-medium transition-colors disabled:opacity-50">
                    {savingDist ? '...' : 'Add'}
                  </button>
                </form>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              {/* Contracted Services */}
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
                <h3 className="text-sm font-semibold text-zinc-900 mb-2">Contracted Services</h3>
                <p className="text-xs text-zinc-500 mb-4">Toggle which services this venue is contracted for</p>
                {venueServices.length === 0 ? (
                  <p className="text-zinc-400 text-sm">No service types configured</p>
                ) : (
                  <div className="space-y-3">
                    {venueServices.map(svc => (
                      <div key={svc.service_type_id} className="flex items-center justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-zinc-900">{svc.name}</p>
                          {svc.description && <p className="text-xs text-zinc-500 truncate">{svc.description}</p>}
                        </div>
                        <button onClick={() => toggleService(svc.service_type_id, !svc.enabled)} disabled={togglingService === svc.service_type_id}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0 ml-3 ${svc.enabled ? 'bg-emerald-500' : 'bg-zinc-300'}`}>
                          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm ${svc.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Contact Info */}
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
                <h3 className="text-sm font-semibold text-zinc-900 mb-4">Contact Info</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-zinc-500">Contact Name</p>
                    <p className="text-sm text-zinc-900 mt-0.5">{venue.primary_contact_name || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-zinc-500">Contact Email</p>
                    <p className="text-sm text-zinc-900 mt-0.5 break-all">{venue.primary_contact_email || 'Not set'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
