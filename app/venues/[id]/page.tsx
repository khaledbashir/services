'use client'

import { useEffect, useState, FormEvent, useCallback } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { DiscoveryLoader } from '@/components/discovery-loader'
import { DiscoveryReviewCard } from '@/components/discovery-review-card'
import { DropZone } from '@/components/drop-zone'
import { InlineEdit } from '@/components/inline-edit'
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
  venue_manager_id: string | null
  lead_field_rep_id: string | null
  logo_url: string | null
  cover_image_url: string | null
  venue_manager_name: string | null
  lead_field_rep_name: string | null
  feed_url: string | null
  feed_type: 'ticketmaster' | 'team-website' | 'league-page' | 'mlb-schedule' | 'ical' | 'other'
  timezone: string | null
  last_feed_synced_at: string | null
  last_feed_sync_status: string | null
  primary_client_id?: string | null
  primary_client_name?: string | null
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

interface LinkedClient {
  id: string
  name: string
  client_kind: string
  sport: string | null
  relation_type: string
}

const roleColors: Record<string, string> = {
  admin: 'bg-blue-500',
  manager: 'bg-emerald-500',
  technician: 'bg-zinc-500',
}

export default function VenueDetailPage() {
  const [venue, setVenue] = useState<VenueDetail | null>(null)
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([])
  const [assignedStaff, setAssignedStaff] = useState<AssignedStaff[]>([])
  const [venueServices, setVenueServices] = useState<VenueService[]>([])
  const [screens, setScreens] = useState<VenueScreen[]>([])
  const [creative, setCreative] = useState<{
    designRequests: Array<{ id: string; job_title: string; status: string; due_date: string | null; created_at: string; hours_estimated: string | null; hours_spent: string | null }>
    cgDesigns: Array<{ id: string; job_title: string; league: string | null; team_name: string | null; status: string; due_date: string | null; created_at: string }>
    printRequests: Array<{ id: string; job_title: string; client_name: string | null; status: string; ship_date: string | null; arrival_date: string | null; created_at: string }>
    contentSchedules: Array<{ id: string; content_name: string; company_name: string | null; status: string; launch_date: string | null; end_date: string | null; created_at: string }>
    totalCount: number
  }>({ designRequests: [], cgDesigns: [], printRequests: [], contentSchedules: [], totalCount: 0 })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'events' | 'staff' | 'tickets' | 'specs' | 'documents' | 'creative' | 'settings'>('events')
  const [venueTickets, setVenueTickets] = useState<Array<{ id: string; title: string; ticket_number: number; status: string; priority: string; created_at: string; assigned_to_name: string | null }>>([])
  const [slackChannelId, setSlackChannelId] = useState('')
  const [savingSlack, setSavingSlack] = useState(false)
  const [togglingService, setTogglingService] = useState<string | null>(null)
  const [portalCopied, setPortalCopied] = useState(false)
  const [emailingSchedule, setEmailingSchedule] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [distEmails, setDistEmails] = useState<string[]>([])
  const [newDistEmail, setNewDistEmail] = useState('')
  const [savingDist, setSavingDist] = useState(false)
  const [savingFeed, setSavingFeed] = useState(false)
  const [linkedStaff, setLinkedStaff] = useState<LinkedStaff[]>([])
  const [linkedClients, setLinkedClients] = useState<LinkedClient[]>([])
  const [allStaff, setAllStaff] = useState<AllStaff[]>([])
  const [staffSearch, setStaffSearch] = useState('')
  const [showStaffDropdown, setShowStaffDropdown] = useState(false)
  const [briefing, setBriefing] = useState<{ content: string; alerts: Array<{ level: string; icon: string; message: string }>; stats: any; recommendation: string; generated_at: string } | null>(null)
  const [refreshingBriefing, setRefreshingBriefing] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [documents, setDocuments] = useState<Array<{ id: string; filename: string; original_name: string; file_type: string; file_size: number; description: string | null; uploaded_by_name: string | null; created_at: string }>>([])
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [docType, setDocType] = useState('document')
  const [docDescription, setDocDescription] = useState('')
  // Event discovery state
  const [discovering, setDiscovering] = useState(false)
  const [discoveredEvents, setDiscoveredEvents] = useState<Array<{
    venue_id: string
    venue_name: string
    summary: string
    event_date: string
    start_time: string | null
    end_time: string | null
    event_type: string
    league: string | null
    home_team?: string | null
    away_team?: string | null
    source: string
    source_label: string | null
    source_url: string | null
    match_type?: 'official_source' | 'ai_inferred'
    matched_query?: string | null
    evidence_snippet?: string | null
    confidence: number
    trust_score?: number
    trust_reasons?: string[]
    duplicate: boolean
    duplicate_reason: string | null
    auto_importable: boolean
    selected: boolean
  }>>([])
  const [discoverStats, setDiscoverStats] = useState<{ total_found: number; duplicates_skipped: number; existing_count: number } | null>(null)
  const [discoveryHint, setDiscoveryHint] = useState('')
  const [activeDiscoveryHint, setActiveDiscoveryHint] = useState<string | null>(null)
  const [includeExistingDiscovery, setIncludeExistingDiscovery] = useState(false)
  const [showDiscoverSummaryCard, setShowDiscoverSummaryCard] = useState(false)
  const [showDiscoverModal, setShowDiscoverModal] = useState(false)
  const [discoverTrustFilter, setDiscoverTrustFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all')
  const [importing, setImporting] = useState(false)
  const [discoverError, setDiscoverError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const router = useRouter()
  const params = useParams()
  const venueId = params?.id as string
  const auth = useAuth()

  useEffect(() => {
    if (!venueId) return

    const fetchData = async () => {
      try {
        setLoadError(null)
        const res = await fetch(`/api/venues/${venueId}`)
        if (res.ok) {
          const data = await res.json()
          setVenue(data.venue)
          setLinkedClients(data.linkedClients || [])
          setUpcomingEvents(data.upcomingEvents || [])
          setAssignedStaff(data.assignedStaff || [])
          setVenueServices(data.venueServices || [])
          setCreative(data.creative || { designRequests: [], cgDesigns: [], printRequests: [], contentSchedules: [], totalCount: 0 })
          setSlackChannelId(data.venue.slack_channel_id || '')
          setDistEmails(data.venue.distribution_emails || [])

          // Fetch briefing
          fetch(`/api/venues/${venueId}/briefing`).then(r => {
            if (!r.ok) { console.warn('Briefing fetch failed:', r.status); return null }
            return r.json()
          }).then(d => { if (d) setBriefing(d) }).catch(err => console.warn('Briefing error:', err))

          // Fetch screens, linked staff, and tickets
          const [screensRes, linkedStaffRes, allStaffRes, ticketsRes, docsRes] = await Promise.all([
            fetch(`/api/venues/${venueId}/screens`),
            fetch(`/api/venues/${venueId}/staff`),
            fetch(`/api/staff`),
            fetch(`/api/tickets?venue_id=${venueId}`),
            fetch(`/api/venues/${venueId}/documents`),
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
          if (ticketsRes.ok) {
            const data = await ticketsRes.json()
            setVenueTickets(data.tickets || [])
          }
          if (docsRes.ok) {
            const data = await docsRes.json()
            setDocuments(data.documents || [])
          }
        } else {
          const data = await res.json().catch(() => null)
          setLoadError(data?.error || `Unable to load venue (${res.status})`)
        }
      } catch (err) {
        console.error('Failed to fetch venue:', err)
        setLoadError('Unable to load venue right now')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [venueId])

  const handleSlackUpdate = async (e: FormEvent) => {
    e.preventDefault()
    if (!venue) return
    setSavingSlack(true)
    try {
      const res = await fetch(`/api/venues/${venueId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slack_channel_id: slackChannelId || null }),
      })
      if (res.ok) { const data = await res.json(); setVenue(data.venue) }
    } catch {} finally { setSavingSlack(false) }
  }

  const toggleService = async (serviceTypeId: string, enabled: boolean) => {
    setTogglingService(serviceTypeId)
    try {
      const res = await fetch(`/api/venues/${venueId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_type_id: serviceTypeId, enabled }),
      })
      if (res.ok) { const data = await res.json(); setVenue(data.venue); setVenueServices(data.venueServices || []) }
    } catch {} finally { setTogglingService(null) }
  }

  const toggleRequiresAssignment = async (val: boolean) => {
    try {
      const res = await fetch(`/api/venues/${venueId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requires_assignment: val }),
      })
      if (res.ok) { const data = await res.json(); setVenue(data.venue) }
    } catch {}
  }

  const updateVenueField = async (field: string, value: any) => {
    try {
      const res = await fetch(`/api/venues/${venueId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      if (res.ok) { const data = await res.json(); setVenue(data.venue) }
    } catch {}
  }

  const updateVenueType = async (venueType: string) => {
    try {
      const res = await fetch(`/api/venues/${venueId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_type: venueType }),
      })
      if (res.ok) { const data = await res.json(); setVenue(data.venue) }
    } catch {}
  }

  const saveFeedSettings = async (payload: { feed_url?: string | null; feed_type?: string; timezone?: string }) => {
    setSavingFeed(true)
    try {
      const res = await fetch(`/api/venues/${venueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        const data = await res.json()
        setVenue(data.venue)
      }
    } finally {
      setSavingFeed(false)
    }
  }

  const linkStaff = async (staffId: string) => {
    try {
      const res = await fetch(`/api/venues/${venueId}/staff`, {
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
      const res = await fetch(`/api/venues/${venueId}/staff`, {
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

  const linkedStaffIds = new Set(linkedStaff.map(s => s.staff_id?.toString()))
  const filteredStaff = allStaff.filter(
    s => !linkedStaffIds.has(s.id?.toString()) &&
      (s.full_name || '').toLowerCase().includes(staffSearch.toLowerCase())
  )
  const filteredDiscoveredEvents = discoveredEvents.filter((event) => {
    const trust = event.trust_score || 0
    if (discoverTrustFilter === 'high') return trust >= 0.85
    if (discoverTrustFilter === 'medium') return trust >= 0.7 && trust < 0.85
    if (discoverTrustFilter === 'low') return trust < 0.7
    return true
  })

  const formatDate = (d: string) => {
    // Parse YYYY-MM-DD parts directly to avoid the UTC-midnight shift
    // that pushes dates one day west in non-UTC zones.
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
    const dt = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d)
    return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  }
  const formatTime = (d: string) => new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })
  const getInitials = (name: string | null | undefined) => { if (!name) return '?'; const p = name.split(' '); return (p[0]?.[0] + (p[1]?.[0] || '')).toUpperCase() }

  if (loading) {
    return <DashboardLayout><div className="space-y-6"><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div></DashboardLayout>
  }

  if (!venue) {
    return (
      <DashboardLayout>
        <div className="bg-white rounded border border-[#E8E8E8] p-12 text-center">
          <p className="text-zinc-700 font-medium">{loadError || 'Venue not found'}</p>
          {loadError && <p className="text-zinc-400 text-sm mt-2">If this should exist, the detail API is failing before the page can hydrate.</p>}
        </div>
      </DashboardLayout>
    )
  }

  const enabledServices = venueServices.filter(s => s.enabled)
  const feedStatusStyles: Record<string, string> = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    partial: 'bg-amber-50 text-amber-700 border-amber-200',
    failed: 'bg-rose-50 text-rose-700 border-rose-200',
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Back */}
        <button onClick={() => router.push('/venues')} className="text-sm text-zinc-500 hover:text-zinc-900 transition-colors">← Back to Venues</button>

        {/* Header */}
        <div className="bg-white rounded-lg border border-[#E8E8E8] shadow-sm overflow-hidden">
          {/* Cover — only show if uploaded */}
          {venue.cover_image_url && (
            <div className="relative h-32 overflow-hidden">
              <img src={venue.cover_image_url} alt="" className="w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent"></div>
            </div>
          )}

          {/* Venue Info */}
          <div className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                {/* Logo */}
                <div className="w-14 h-14 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0 border border-zinc-200 shadow-sm">
                  {venue.logo_url ? (
                    <img src={venue.logo_url} alt={venue.name} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-[#0A52EF] to-[#0840C0] flex items-center justify-center">
                      <span className="text-white font-bold text-base">{venue.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                    </div>
                  )}
                </div>
                {/* Name + meta */}
                <div>
                  <h1 className="text-lg font-bold text-zinc-900">
                    <InlineEdit value={venue.name} onSave={v => updateVenueField('name', v)} displayClassName="text-lg font-bold text-zinc-900" />
                  </h1>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-zinc-500">{venue.market_name}</span>
                    <span className="text-zinc-300">•</span>
                    <InlineEdit value={venue.address || ''} onSave={v => updateVenueField('address', v)} placeholder="Add address" emptyText="No address" displayClassName="text-xs text-zinc-400" />
                  </div>
                  {/* Tags row */}
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${venue.requires_assignment ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-zinc-50 text-zinc-500 border-zinc-200'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${venue.requires_assignment ? 'bg-blue-500' : 'bg-zinc-400'}`}></span>
                      {venue.requires_assignment ? 'Assignment Required' : 'Support Only'}
                    </span>
                    {venue.primary_client_name && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
                        Client: {venue.primary_client_name}
                      </span>
                    )}
                    {enabledServices.length > 0 && enabledServices.map(svc => (
                      <span key={svc.service_type_id} className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                        {svc.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              {/* Stats */}
              <div className="flex gap-5 flex-shrink-0">
                {[
                  { val: upcomingEvents.length, label: 'Upcoming' },
                  { val: assignedStaff.length, label: 'Staff' },
                  { val: upcomingEvents.filter(e => e.assigned_techs).length, label: 'Assigned' },
                ].map(s => (
                  <div key={s.label} className="text-center">
                    <p className="text-2xl font-bold text-zinc-900">{s.val}</p>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-medium">{s.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* People row */}
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-zinc-100">
              {[
                { label: 'Venue Manager', name: venue.venue_manager_name, color: 'amber' },
                { label: 'Lead Field Rep', name: venue.lead_field_rep_name, color: 'indigo' },
              ].map(role => (
                <div key={role.label} className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    role.name ? `bg-${role.color}-100 text-${role.color}-700` : 'bg-zinc-100 text-zinc-400'
                  }`}>
                    {role.name ? role.name.split(' ').map((w: string) => w[0]).join('').slice(0, 2) : '?'}
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-400 leading-none">{role.label}</p>
                    <p className={`text-xs font-medium leading-tight ${role.name ? 'text-zinc-800' : 'text-zinc-300'}`}>{role.name || 'Unassigned'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Briefing */}
          {briefing && (
            <div className="mx-6 mb-4">
              <div className="rounded-xl border border-zinc-200/80 bg-gradient-to-b from-white to-zinc-50/50 overflow-hidden shadow-sm">
                {/* Header */}
                <div className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
                      <span className="text-white text-xs">✦</span>
                    </div>
                    <div>
                      <span className="text-xs font-semibold text-zinc-800">AI Venue Intel</span>
                      <span className="text-[10px] text-zinc-400 ml-2">
                        {new Date(briefing.generated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      setRefreshingBriefing(true)
                      const res = await fetch(`/api/venues/${venueId}/briefing`, { method: 'POST' })
                      if (res.ok) setBriefing(await res.json())
                      setRefreshingBriefing(false)
                    }}
                    disabled={refreshingBriefing}
                    className="text-[10px] text-zinc-400 hover:text-[#0A52EF] transition-colors flex items-center gap-1"
                  >
                    <svg className={`w-3 h-3 ${refreshingBriefing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    {refreshingBriefing ? 'Updating...' : 'Refresh'}
                  </button>
                </div>

                {/* Content — flowing text like an AI response */}
                <div className="px-5 pb-4">
                  <p className="text-[13px] text-zinc-700 leading-relaxed" dangerouslySetInnerHTML={{
                    __html: briefing.content
                      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-zinc-900">$1</strong>')
                  }} />

                  {/* Stats pills */}
                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {briefing.stats.coverage_rate !== null && (
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                        briefing.stats.coverage_rate >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        briefing.stats.coverage_rate >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          briefing.stats.coverage_rate >= 80 ? 'bg-emerald-500' :
                          briefing.stats.coverage_rate >= 50 ? 'bg-amber-500' : 'bg-red-500'
                        }`}></span>
                        Coverage {briefing.stats.coverage_rate}%
                      </div>
                    )}
                    {briefing.stats.workflow_rate !== null && (
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                        briefing.stats.workflow_rate >= 80 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        briefing.stats.workflow_rate >= 50 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${
                          briefing.stats.workflow_rate >= 80 ? 'bg-emerald-500' :
                          briefing.stats.workflow_rate >= 50 ? 'bg-amber-500' : 'bg-red-500'
                        }`}></span>
                        Workflows {briefing.stats.workflow_rate}%
                      </div>
                    )}
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-zinc-50 text-zinc-600 border border-zinc-200">
                      {briefing.stats.upcoming_events} events
                    </div>
                    {briefing.stats.open_tickets > 0 && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-zinc-50 text-zinc-600 border border-zinc-200">
                        {briefing.stats.open_tickets} tickets
                      </div>
                    )}
                  </div>

                  {/* Recommendation */}
                  {briefing.recommendation && (
                    <div className="mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-gradient-to-r from-blue-50/80 to-violet-50/40 border border-blue-100/60">
                      <span className="text-xs mt-0.5">💡</span>
                      <p className="text-xs text-blue-800 leading-relaxed">{briefing.recommendation}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tabs */}
          <div className="border-t border-[#E8E8E8] flex px-6 overflow-x-auto">
            {(['events', 'staff', 'tickets', 'specs', 'documents', 'creative', 'settings'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === tab ? 'border-[#0A52EF] text-[#0A52EF]' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}>
                {tab === 'events' && `Events (${upcomingEvents.length})`}
                {tab === 'staff' && `Staff (${assignedStaff.length})`}
                {tab === 'tickets' && `Tickets (${venueTickets.length})`}
                {tab === 'specs' && `Specs${screens.length > 0 ? ` (${screens.length})` : ''}`}
                {tab === 'documents' && `Docs${documents.length > 0 ? ` (${documents.length})` : ''}`}
                {tab === 'creative' && `Creative${creative.totalCount > 0 ? ` (${creative.totalCount})` : ''}`}
                {tab === 'settings' && 'Settings'}
              </button>
            ))}
          </div>
        </div>

        {/* EVENTS TAB */}
        {activeTab === 'events' && (
          <div className="space-y-3">
            <div className="flex justify-end gap-2">
              <input
                type="text"
                value={discoveryHint}
                onChange={e => setDiscoveryHint(e.target.value)}
                placeholder="Optional discovery hint"
                className="px-3 py-1.5 border border-[#E8E8E8] rounded text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 w-64"
              />
              <label className="inline-flex items-center gap-2 px-3 py-1.5 border border-[#E8E8E8] rounded text-xs text-zinc-700 bg-white">
                <input
                  type="checkbox"
                  checked={includeExistingDiscovery}
                  onChange={e => setIncludeExistingDiscovery(e.target.checked)}
                  className="rounded border-zinc-300"
                />
                Demo mode
              </label>
              <button
                type="button"
                onClick={async () => {
                  setDiscovering(true)
                  setDiscoveredEvents([])
                  setDiscoverStats(null)
                  setShowDiscoverSummaryCard(false)
                  setDiscoverTrustFilter('all')
                  setDiscoverError(null)
                  try {
                    const res = await fetch('/api/events/discover', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        venue_id: venueId,
                        discovery_hint: discoveryHint.trim() || undefined,
                        include_existing: includeExistingDiscovery,
                      }),
                    })
                    if (res.ok) {
                      const data = await res.json()
                      setDiscoveredEvents((data.discovered || []).map((e: any) => ({ ...e, selected: !e.duplicate })))
                      setDiscoverStats({ total_found: data.total_found, duplicates_skipped: data.duplicates_skipped, existing_count: data.existing_count })
                      setActiveDiscoveryHint(data.discovery_hint || discoveryHint.trim() || null)
                      setShowDiscoverSummaryCard(true)
                      setShowDiscoverModal(true)
                    } else {
                      const data = await res.json().catch(() => null)
                      setDiscoverError(data?.error || 'Unable to discover events right now.')
                    }
                  } catch {
                    setDiscoverError('Unable to discover events right now.')
                  } finally { setDiscovering(false) }
                }}
                disabled={discovering}
                className="px-3 py-1.5 bg-[#0A52EF] text-white rounded text-xs font-medium hover:bg-[#0941bf] transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {discovering ? 'Searching...' : 'Discover Events'}
              </button>
              <a
                href={`/api/schedule/export?venue_id=${venueId}&period=30`}
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
                      const res = await fetch(`/api/schedule/export?venue_id=${venueId}&period=30&action=email`)
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
            {discoverError && (
              <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {discoverError}
              </div>
            )}
            {!discovering && showDiscoverSummaryCard && discoverStats && (
              <div className="border-b border-[#E8E8E8] bg-[linear-gradient(180deg,#FFFFFF,#F8FAFC)] px-5 py-4 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-400">Discovery Complete</div>
                  <h3 className="mt-1 text-base font-semibold text-zinc-900">
                    {discoverStats.total_found} results found for this venue
                  </h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    {discoveredEvents.filter(e => !e.duplicate).length} importable
                    {' · '}
                    {discoveredEvents.filter(e => e.auto_importable && !e.duplicate).length} high confidence
                    {discoverStats.duplicates_skipped > 0 && ` · ${discoverStats.duplicates_skipped} duplicates`}
                  </p>
                  {activeDiscoveryHint && (
                    <p className="mt-2 text-xs text-zinc-500">
                      Discovery hint used: "{activeDiscoveryHint}"
                    </p>
                  )}
                  {includeExistingDiscovery && (
                    <p className="mt-1 text-xs text-zinc-500">
                      Demo mode included events that already exist so they can still show up as duplicates.
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowDiscoverModal(true)}
                    className="px-4 py-2 rounded-xl bg-[#0A52EF] text-white text-sm font-medium hover:bg-[#0840C0] transition-colors"
                  >
                    Review Results
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDiscoverSummaryCard(false)}
                    className="px-3 py-2 rounded-xl border border-[#E8E8E8] text-sm text-zinc-500 hover:text-zinc-700 hover:border-zinc-300 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
            {discovering && (
              <div className="p-5 bg-[linear-gradient(180deg,rgba(248,250,252,0.92),rgba(255,255,255,0.78))]">
                <DiscoveryLoader
                  title="Discovering Events"
                  subtitle="Scanning official schedules, venue calendars, and ticket sources for this venue."
                  compact
                  hints={[
                    'Ticketmaster',
                    'Venue Calendars',
                    'League Schedules',
                  ]}
                />
              </div>
            )}
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

          {/* Event Discovery Modal */}
          {showDiscoverModal && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowDiscoverModal(false)}>
              <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-[#E8E8E8]">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-zinc-900">Discovered Events</h3>
                      {discoverStats && (
                        <p className="text-sm text-zinc-500 mt-1">
                          Found {discoverStats.total_found} results
                          {discoverStats.duplicates_skipped > 0 && ` (${discoverStats.duplicates_skipped} duplicates already in database)`}
                          {' '}&middot; {discoverStats.existing_count} existing events
                        </p>
                      )}
                      {activeDiscoveryHint && (
                        <p className="text-xs text-zinc-500 mt-2">
                          Discovery hint: "{activeDiscoveryHint}"
                        </p>
                      )}
                      {includeExistingDiscovery && (
                        <p className="text-xs text-zinc-500 mt-1">
                          Demo mode is on, so existing events may appear here as duplicates.
                        </p>
                      )}
                    </div>
                    <button onClick={() => setShowDiscoverModal(false)} className="text-zinc-400 hover:text-zinc-600">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="overflow-y-auto flex-1 p-4">
                  {discoveredEvents.length === 0 ? (
                    <div className="text-center py-12 text-zinc-400">No new events found for this venue in the next 60 days.</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-3 px-2 mb-3">
                        <label className="flex items-center gap-2 text-sm text-zinc-600">
                          <input
                            type="checkbox"
                            checked={discoveredEvents.filter(e => !e.duplicate).length > 0 && discoveredEvents.filter(e => !e.duplicate).every(e => e.selected)}
                            onChange={e => setDiscoveredEvents(prev => prev.map(ev => ev.duplicate ? ev : ({ ...ev, selected: e.target.checked })))}
                            className="rounded border-zinc-300"
                          />
                          Select all ({discoveredEvents.filter(e => e.selected && !e.duplicate).length}/{discoveredEvents.filter(e => !e.duplicate).length})
                        </label>
                        <select
                          value={discoverTrustFilter}
                          onChange={(e) => setDiscoverTrustFilter(e.target.value as 'all' | 'high' | 'medium' | 'low')}
                          className="px-3 py-2 border border-[#E8E8E8] rounded-xl text-sm bg-white text-zinc-700"
                        >
                          <option value="all">All Trust</option>
                          <option value="high">High Trust</option>
                          <option value="medium">Medium Trust</option>
                          <option value="low">Low Trust</option>
                        </select>
                      </div>
                      {filteredDiscoveredEvents.map((event, idx) => (
                        <DiscoveryReviewCard
                          key={`${event.summary}-${event.event_date}-${event.start_time || idx}`}
                          summary={event.summary}
                          eventDate={event.event_date}
                          startTime={event.start_time}
                          endTime={event.end_time}
                          venueName={event.venue_name}
                          eventType={event.event_type}
                          league={event.league}
                          sourceLabel={event.source_label || event.source}
                          sourceUrl={event.source_url}
                          trustScore={event.trust_score}
                          confidence={event.confidence}
                          duplicate={event.duplicate}
                          duplicateReason={event.duplicate_reason}
                          selected={event.selected}
                          disabled={event.duplicate}
                          subtitle={[
                            event.match_type === 'official_source' ? 'Official source' : 'AI inferred',
                            (event.home_team || event.away_team) ? [event.home_team, event.away_team].filter(Boolean).join(' vs ') : null,
                            event.matched_query ? `Query: ${event.matched_query}` : null,
                            event.evidence_snippet || null,
                          ].filter(Boolean).join(' · ')}
                          onToggle={() => setDiscoveredEvents(prev => prev.map((entry) => (
                            entry.summary === event.summary &&
                            entry.event_date === event.event_date &&
                            entry.start_time === event.start_time
                              ? { ...entry, selected: !entry.selected }
                              : entry
                          )))}
                        />
                      ))}
                      {filteredDiscoveredEvents.length === 0 && (
                        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
                          No discovered events match the current trust filter.
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {discoveredEvents.length > 0 && (
                  <div className="p-4 border-t border-[#E8E8E8] flex items-center justify-between bg-zinc-50">
                    <span className="text-sm text-zinc-500">
                      {discoveredEvents.filter(e => e.selected && !e.duplicate).length} events selected for import
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowDiscoverModal(false)}
                        className="px-4 py-2 text-sm font-medium text-zinc-600 border border-[#E8E8E8] rounded hover:border-zinc-300 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          const selected = discoveredEvents.filter(e => e.selected && !e.duplicate)
                          if (selected.length === 0) return
                          setImporting(true)
                          setImportError(null)
                          try {
                            const res = await fetch('/api/events/discover/import', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                venue_id: venueId,
                                status: 'confirmed',
                                events: selected.map(({ selected: _, ...e }) => e),
                              }),
                            })
                            if (res.ok) {
                              await res.json()
                              setShowDiscoverModal(false)
                              setDiscoveredEvents([])
                              // Refresh venue data to show new events
                              const venueRes = await fetch(`/api/venues/${venueId}`)
                              if (venueRes.ok) {
                                const vData = await venueRes.json()
                                setUpcomingEvents(vData.upcomingEvents || [])
                              }
                            } else {
                              const data = await res.json().catch(() => null)
                              setImportError(data?.error || 'Import failed. Please try again.')
                            }
                          } catch {
                            setImportError('Import failed. Please try again.')
                          } finally { setImporting(false) }
                        }}
                        disabled={importing || discoveredEvents.filter(e => e.selected && !e.duplicate).length === 0}
                        className="px-4 py-2 text-sm font-medium text-white bg-[#0A52EF] rounded hover:bg-[#0941bf] transition-colors disabled:opacity-50 inline-flex items-center gap-1.5"
                      >
                        {importing ? (
                          <>
                            <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                            Importing...
                          </>
                        ) : (
                          `Import ${discoveredEvents.filter(e => e.selected && !e.duplicate).length} Events`
                        )}
                      </button>
                    </div>
                  </div>
                )}
                {importError && (
                  <div className="border-t border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {importError}
                  </div>
                )}
              </div>
            </div>
          )}

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

        {/* TICKETS TAB */}
        {activeTab === 'tickets' && (
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
            {venueTickets.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-sm text-zinc-500">No tickets for this venue</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#E8E8E8] bg-zinc-50">
                    <th className="text-left py-3 px-5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Case #</th>
                    <th className="text-left py-3 px-5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Title</th>
                    <th className="text-left py-3 px-5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                    <th className="text-left py-3 px-5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Priority</th>
                    <th className="text-left py-3 px-5 text-xs font-medium text-zinc-500 uppercase tracking-wider">Assigned To</th>
                  </tr>
                </thead>
                <tbody>
                  {venueTickets.map(t => {
                    const priColor = t.priority === 'critical' ? 'bg-red-500' : t.priority === 'high' ? 'bg-orange-500' : t.priority === 'medium' ? 'bg-amber-500' : 'bg-zinc-400'
                    const stColor = t.status === 'closed' ? 'text-zinc-400' : t.status === 'escalated' ? 'text-orange-600' : t.status === 'in_progress' ? 'text-amber-600' : 'text-red-600'
                    return (
                      <tr key={t.id} onClick={() => router.push(`/tickets/${t.id}`)} className="border-b border-[#E8E8E8] hover:bg-zinc-50 cursor-pointer transition-colors">
                        <td className="py-3 px-5 text-xs font-mono text-zinc-500">{String(t.ticket_number).padStart(8, '0')}</td>
                        <td className="py-3 px-5 font-medium text-zinc-900 max-w-xs truncate">{t.title}</td>
                        <td className={`py-3 px-5 text-xs font-semibold capitalize ${stColor}`}>{t.status.replace('_', ' ')}</td>
                        <td className="py-3 px-5"><span className={`inline-block w-2 h-2 rounded-full ${priColor} mr-1.5`} /><span className="text-xs text-zinc-600 capitalize">{t.priority}</span></td>
                        <td className="py-3 px-5 text-xs text-zinc-600">{t.assigned_to_name || <span className="text-zinc-400">Unassigned</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
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

        {/* DOCUMENTS TAB */}
        {activeTab === 'documents' && (
          <div className="space-y-4">
            {/* Upload area */}
            {auth.isManager && (
              <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
                <h3 className="text-sm font-semibold text-zinc-900 mb-1">Upload Document</h3>
                <p className="text-xs text-zinc-500 mb-4">Share spec sheets, config files, firmware, SOPs, and vendor documents</p>
                <div className="flex flex-col sm:flex-row gap-3 mb-3">
                  <select value={docType} onChange={e => setDocType(e.target.value)}
                    className="px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none bg-white">
                    <option value="document">Document</option>
                    <option value="spec_sheet">Spec Sheet</option>
                    <option value="config">Config File</option>
                    <option value="firmware">Firmware</option>
                    <option value="sop">SOP</option>
                    <option value="vendor">Vendor File</option>
                    <option value="image">Image</option>
                    <option value="other">Other</option>
                  </select>
                  <input type="text" value={docDescription} onChange={e => setDocDescription(e.target.value)}
                    placeholder="Description (optional)"
                    className="flex-1 px-3 py-2 border border-zinc-200 rounded-lg text-sm focus:ring-2 focus:ring-[#0A52EF]/30 outline-none" />
                  <label className={`px-5 py-2 rounded-lg text-sm font-semibold cursor-pointer transition-colors flex items-center gap-2 ${
                    uploadingDoc ? 'bg-zinc-100 text-zinc-400 cursor-wait' : 'bg-[#0A52EF] text-white hover:bg-[#0840C0]'
                  }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    {uploadingDoc ? 'Uploading...' : 'Choose File'}
                    <input type="file" className="hidden" disabled={uploadingDoc}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        setUploadingDoc(true)
                        try {
                          const fd = new FormData()
                          fd.append('file', file)
                          fd.append('file_type', docType)
                          fd.append('description', docDescription)
                          const res = await fetch(`/api/venues/${venueId}/documents`, { method: 'POST', body: fd })
                          if (res.ok) {
                            const data = await res.json()
                            setDocuments(prev => [data.document, ...prev])
                            setDocDescription('')
                            setDocType('document')
                          }
                        } catch {} finally { setUploadingDoc(false) }
                        e.target.value = ''
                      }} />
                  </label>
                </div>
                {/* Drag-and-drop zone */}
                <DropZone
                  accept="*"
                  disabled={uploadingDoc}
                  onFile={async (file) => {
                    setUploadingDoc(true)
                    try {
                      const fd = new FormData()
                      fd.append('file', file)
                      fd.append('file_type', docType)
                      fd.append('description', docDescription)
                      const res = await fetch(`/api/venues/${venueId}/documents`, { method: 'POST', body: fd })
                      if (res.ok) {
                        const data = await res.json()
                        setDocuments(prev => [data.document, ...prev])
                        setDocDescription('')
                      }
                    } catch {} finally { setUploadingDoc(false) }
                  }}
                  className="w-full h-20 rounded-lg bg-zinc-50 flex items-center justify-center border-2 border-dashed border-zinc-200 hover:border-zinc-300 transition-colors"
                  activeClassName="ring-2 ring-[#0A52EF] border-[#0A52EF] bg-blue-50"
                >
                  <div className="text-center">
                    <p className="text-xs text-zinc-400">{uploadingDoc ? 'Uploading...' : 'Drag & drop files here'}</p>
                    <p className="text-[10px] text-zinc-300 mt-0.5">PDF, Excel, Word, Images, ZIP — up to 50MB</p>
                  </div>
                </DropZone>
              </div>
            )}

            {/* Document list grouped by type */}
            {documents.length === 0 ? (
              <div className="bg-white rounded-xl border border-zinc-200 p-16 text-center">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto text-zinc-300 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <p className="text-sm font-medium text-zinc-500">No documents uploaded yet</p>
                <p className="text-xs text-zinc-400 mt-1">Upload spec sheets, firmware, SOPs, or vendor files</p>
              </div>
            ) : (
              (() => {
                const typeGroups: Record<string, { label: string; icon: string; color: string }> = {
                  spec_sheet: { label: 'Spec Sheets', icon: '📋', color: 'blue' },
                  config: { label: 'Config Files', icon: '⚙️', color: 'violet' },
                  firmware: { label: 'Firmware', icon: '💾', color: 'amber' },
                  sop: { label: 'SOPs', icon: '📖', color: 'emerald' },
                  vendor: { label: 'Vendor Files', icon: '📦', color: 'orange' },
                  image: { label: 'Images', icon: '🖼️', color: 'pink' },
                  document: { label: 'Documents', icon: '📄', color: 'zinc' },
                  other: { label: 'Other', icon: '📎', color: 'zinc' },
                }
                const grouped = documents.reduce((acc, doc) => {
                  const key = doc.file_type || 'document'
                  if (!acc[key]) acc[key] = []
                  acc[key].push(doc)
                  return acc
                }, {} as Record<string, typeof documents>)

                const formatSize = (bytes: number) => {
                  if (bytes < 1024) return `${bytes} B`
                  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
                  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
                }

                return Object.entries(typeGroups).filter(([key]) => grouped[key]?.length).map(([key, conf]) => (
                  <div key={key} className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-zinc-100 bg-zinc-50/50 flex items-center gap-2">
                      <span className="text-sm">{conf.icon}</span>
                      <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">{conf.label}</h3>
                      <span className="text-xs text-zinc-400">({grouped[key].length})</span>
                    </div>
                    <div className="divide-y divide-zinc-100">
                      {grouped[key].map(doc => (
                        <div key={doc.id} className="px-5 py-3 flex items-center gap-3 hover:bg-zinc-50 transition-colors group">
                          <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center flex-shrink-0 group-hover:bg-zinc-200 transition-colors">
                            <span className="text-xs font-bold text-zinc-500 uppercase">{doc.original_name.split('.').pop()?.slice(0, 4) || '?'}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <a href={doc.filename} download target="_blank" rel="noopener noreferrer"
                              className="text-sm font-medium text-zinc-900 hover:text-[#0A52EF] transition-colors truncate block">
                              {doc.original_name}
                            </a>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-zinc-400">{formatSize(doc.file_size)}</span>
                              {doc.description && (
                                <>
                                  <span className="text-zinc-300">·</span>
                                  <span className="text-[10px] text-zinc-500 truncate">{doc.description}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className="text-right">
                              <p className="text-[10px] text-zinc-400">{new Date(doc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                              {doc.uploaded_by_name && <p className="text-[10px] text-zinc-400">by {doc.uploaded_by_name}</p>}
                            </div>
                            <a href={doc.filename} download target="_blank" rel="noopener noreferrer"
                              className="p-1.5 rounded-md hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors"
                              title="Download">
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                            </a>
                            {auth.isAdmin && (
                              <button
                                onClick={async () => {
                                  if (!confirm(`Delete "${doc.original_name}"?`)) return
                                  const res = await fetch(`/api/venues/${venueId}/documents`, {
                                    method: 'DELETE',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ document_id: doc.id }),
                                  })
                                  if (res.ok) setDocuments(prev => prev.filter(d => d.id !== doc.id))
                                }}
                                className="p-1.5 rounded-md hover:bg-red-50 text-zinc-400 hover:text-red-500 transition-colors"
                                title="Delete">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              })()
            )}
          </div>
        )}

        {/* CREATIVE TAB */}
        {activeTab === 'creative' && (
          <div className="space-y-6">
            {creative.totalCount === 0 ? (
              <div className="bg-white rounded border border-[#E8E8E8] p-12 text-center">
                <p className="text-sm text-zinc-500">No creative requests linked to this venue yet.</p>
                <p className="text-xs text-zinc-400 mt-1">Design, CG, print, and content-schedule requests show up here once they're tagged with this venue.</p>
              </div>
            ) : (
              <>
                {creative.designRequests.length > 0 && (
                  <div className="bg-white rounded border border-[#E8E8E8] shadow-sm">
                    <div className="px-5 py-3 border-b border-[#E8E8E8] flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-zinc-900">Design Requests <span className="text-zinc-400 font-normal">({creative.designRequests.length})</span></h3>
                      <Link href="/designs" className="text-xs text-[#0A52EF] hover:underline">View all →</Link>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-[#FAFAFA] text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        <tr>
                          <th className="px-5 py-2 text-left">Title</th>
                          <th className="px-5 py-2 text-left">Status</th>
                          <th className="px-5 py-2 text-left">Due</th>
                          <th className="px-5 py-2 text-left">Hours</th>
                          <th className="px-5 py-2 text-left">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0F0F0]">
                        {creative.designRequests.map(d => (
                          <tr key={d.id} className="hover:bg-[#FAFAFA]">
                            <td className="px-5 py-3">
                              <Link href={`/designs/${d.id}`} className="text-[#0A52EF] hover:underline">{d.job_title}</Link>
                            </td>
                            <td className="px-5 py-3 text-zinc-600">{d.status.replace(/_/g, ' ')}</td>
                            <td className="px-5 py-3 text-zinc-600">{d.due_date || '—'}</td>
                            <td className="px-5 py-3 text-zinc-600">{d.hours_spent ?? 0} / {d.hours_estimated || '—'}</td>
                            <td className="px-5 py-3 text-zinc-500">{d.created_at}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {creative.cgDesigns.length > 0 && (
                  <div className="bg-white rounded border border-[#E8E8E8] shadow-sm">
                    <div className="px-5 py-3 border-b border-[#E8E8E8] flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-zinc-900">CG Designs <span className="text-zinc-400 font-normal">({creative.cgDesigns.length})</span></h3>
                      <Link href="/cg-designs" className="text-xs text-[#0A52EF] hover:underline">View all →</Link>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-[#FAFAFA] text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        <tr>
                          <th className="px-5 py-2 text-left">Title</th>
                          <th className="px-5 py-2 text-left">League / Team</th>
                          <th className="px-5 py-2 text-left">Status</th>
                          <th className="px-5 py-2 text-left">Due</th>
                          <th className="px-5 py-2 text-left">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0F0F0]">
                        {creative.cgDesigns.map(d => (
                          <tr key={d.id} className="hover:bg-[#FAFAFA]">
                            <td className="px-5 py-3">
                              <Link href={`/cg-designs/${d.id}`} className="text-[#0A52EF] hover:underline">{d.job_title}</Link>
                            </td>
                            <td className="px-5 py-3 text-zinc-600">{[d.league, d.team_name].filter(Boolean).join(' · ') || '—'}</td>
                            <td className="px-5 py-3 text-zinc-600">{d.status.replace(/_/g, ' ')}</td>
                            <td className="px-5 py-3 text-zinc-600">{d.due_date || '—'}</td>
                            <td className="px-5 py-3 text-zinc-500">{d.created_at}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {creative.printRequests.length > 0 && (
                  <div className="bg-white rounded border border-[#E8E8E8] shadow-sm">
                    <div className="px-5 py-3 border-b border-[#E8E8E8] flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-zinc-900">Print Requests <span className="text-zinc-400 font-normal">({creative.printRequests.length})</span></h3>
                      <Link href="/prints" className="text-xs text-[#0A52EF] hover:underline">View all →</Link>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-[#FAFAFA] text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        <tr>
                          <th className="px-5 py-2 text-left">Title</th>
                          <th className="px-5 py-2 text-left">Client</th>
                          <th className="px-5 py-2 text-left">Status</th>
                          <th className="px-5 py-2 text-left">Ship</th>
                          <th className="px-5 py-2 text-left">Arrival</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0F0F0]">
                        {creative.printRequests.map(p => (
                          <tr key={p.id} className="hover:bg-[#FAFAFA]">
                            <td className="px-5 py-3">
                              <Link href={`/prints/${p.id}`} className="text-[#0A52EF] hover:underline">{p.job_title}</Link>
                            </td>
                            <td className="px-5 py-3 text-zinc-600">{p.client_name || '—'}</td>
                            <td className="px-5 py-3 text-zinc-600">{p.status.replace(/_/g, ' ')}</td>
                            <td className="px-5 py-3 text-zinc-600">{p.ship_date || '—'}</td>
                            <td className="px-5 py-3 text-zinc-600">{p.arrival_date || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {creative.contentSchedules.length > 0 && (
                  <div className="bg-white rounded border border-[#E8E8E8] shadow-sm">
                    <div className="px-5 py-3 border-b border-[#E8E8E8] flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-zinc-900">Content Schedule <span className="text-zinc-400 font-normal">({creative.contentSchedules.length})</span></h3>
                      <Link href="/content-schedules" className="text-xs text-[#0A52EF] hover:underline">View all →</Link>
                    </div>
                    <table className="w-full text-sm">
                      <thead className="bg-[#FAFAFA] text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                        <tr>
                          <th className="px-5 py-2 text-left">Content</th>
                          <th className="px-5 py-2 text-left">Company</th>
                          <th className="px-5 py-2 text-left">Status</th>
                          <th className="px-5 py-2 text-left">Launch</th>
                          <th className="px-5 py-2 text-left">End</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#F0F0F0]">
                        {creative.contentSchedules.map(c => (
                          <tr key={c.id} className="hover:bg-[#FAFAFA]">
                            <td className="px-5 py-3">
                              <Link href={`/content-schedules/${c.id}`} className="text-[#0A52EF] hover:underline">{c.content_name}</Link>
                            </td>
                            <td className="px-5 py-3 text-zinc-600">{c.company_name || '—'}</td>
                            <td className="px-5 py-3 text-zinc-600">{c.status.replace(/_/g, ' ')}</td>
                            <td className="px-5 py-3 text-zinc-600">{c.launch_date || '—'}</td>
                            <td className="px-5 py-3 text-zinc-600">{c.end_date || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeTab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left column */}
            <div className="space-y-6">
              {/* Branding */}
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
                <h3 className="text-sm font-semibold text-zinc-900 mb-2">Branding</h3>
                <p className="text-xs text-zinc-500 mb-4">Customize the venue profile with a logo and cover image</p>
                <div className="space-y-4">
                  {/* Logo */}
                  <div>
                    <label className="text-xs font-medium text-zinc-500 block mb-2">Logo</label>
                    <div className="flex items-center gap-3">
                      <DropZone
                        accept="image/*"
                        disabled={uploadingLogo}
                        onFile={async (file) => {
                          setUploadingLogo(true)
                          const fd = new FormData(); fd.append('file', file); fd.append('type', 'logo')
                          const res = await fetch(`/api/venues/${venueId}/branding`, { method: 'POST', body: fd })
                          if (res.ok) { const d = await res.json(); setVenue({ ...venue, logo_url: d.url }) }
                          setUploadingLogo(false)
                        }}
                        className="w-16 h-16 rounded-lg bg-zinc-50 flex items-center justify-center overflow-hidden border-2 border-dashed border-zinc-200 hover:border-zinc-300"
                        activeClassName="ring-2 ring-[#0A52EF] border-[#0A52EF] bg-blue-50"
                      >
                        {venue.logo_url ? (
                          <img src={venue.logo_url} alt="Logo" className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-zinc-300 text-[10px] text-center leading-tight">{uploadingLogo ? '...' : 'Drop\nlogo'}</span>
                        )}
                      </DropZone>
                      {venue.logo_url && (
                        <button onClick={async () => {
                          await fetch(`/api/venues/${venueId}/branding`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'logo' }) })
                          setVenue({ ...venue, logo_url: null })
                        }} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                      )}
                    </div>
                  </div>
                  {/* Cover */}
                  <div>
                    <label className="text-xs font-medium text-zinc-500 block mb-2">Cover Image</label>
                    <DropZone
                      accept="image/*"
                      disabled={uploadingCover}
                      onFile={async (file) => {
                        setUploadingCover(true)
                        const fd = new FormData(); fd.append('file', file); fd.append('type', 'cover')
                        const res = await fetch(`/api/venues/${venueId}/branding`, { method: 'POST', body: fd })
                        if (res.ok) { const d = await res.json(); setVenue({ ...venue, cover_image_url: d.url }) }
                        setUploadingCover(false)
                      }}
                      className="relative w-full h-24 rounded-lg bg-zinc-50 flex items-center justify-center overflow-hidden border-2 border-dashed border-zinc-200 hover:border-zinc-300"
                      activeClassName="ring-2 ring-[#0A52EF] border-[#0A52EF] bg-blue-50"
                    >
                      {venue.cover_image_url ? (
                        <img src={venue.cover_image_url} alt="Cover" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-zinc-300 text-xs">{uploadingCover ? 'Uploading...' : 'Drop cover image here or click'}</span>
                      )}
                    </DropZone>
                    {venue.cover_image_url && (
                      <button onClick={async () => {
                        await fetch(`/api/venues/${venueId}/branding`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'cover' }) })
                        setVenue({ ...venue, cover_image_url: null })
                      }} className="text-xs text-red-500 hover:text-red-700 mt-1">Remove</button>
                    )}
                  </div>
                </div>
              </div>

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

              {/* Feed Sync */}
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">Venue Feed Sync</h3>
                    <p className="text-xs text-zinc-500 mt-1">Configure a hands-off source URL for daily syncs. Venues without a feed can still use AI discovery.</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[11px] font-medium ${
                    feedStatusStyles[venue.last_feed_sync_status || ''] || 'bg-zinc-50 text-zinc-500 border-zinc-200'
                  }`}>
                    {venue.last_feed_sync_status || 'Not synced'}
                  </span>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-zinc-500 block mb-1">Feed Type</label>
                    <select
                      value={venue.feed_type || 'other'}
                      onChange={(e) => saveFeedSettings({ feed_type: e.target.value })}
                      className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
                    >
                      <option value="ticketmaster">Ticketmaster</option>
                      <option value="mlb-schedule">MLB Schedule API</option>
                      <option value="team-website">Team Website</option>
                      <option value="league-page">League Page</option>
                      <option value="ical">iCal</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-500 block mb-1">Feed URL</label>
                    <input
                      type="url"
                      defaultValue={venue.feed_url || ''}
                      onBlur={(e) => {
                        if ((venue.feed_url || '') !== e.target.value) {
                          saveFeedSettings({ feed_url: e.target.value || null })
                        }
                      }}
                      placeholder="https://..."
                      className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-500 block mb-1">Timezone</label>
                    <select
                      value={venue.timezone || 'America/New_York'}
                      onChange={(e) => saveFeedSettings({ timezone: e.target.value })}
                      className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
                    >
                      <option value="America/New_York">Eastern (ET)</option>
                      <option value="America/Chicago">Central (CT)</option>
                      <option value="America/Denver">Mountain (MT)</option>
                      <option value="America/Phoenix">Arizona (MST, no DST)</option>
                      <option value="America/Los_Angeles">Pacific (PT)</option>
                      <option value="America/Anchorage">Alaska (AKT)</option>
                      <option value="Pacific/Honolulu">Hawaii (HST)</option>
                    </select>
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span>
                      Last synced: {venue.last_feed_synced_at ? new Date(venue.last_feed_synced_at).toLocaleString() : 'Never'}
                    </span>
                    <span>{savingFeed ? 'Saving…' : 'Saves automatically'}</span>
                  </div>
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
                            await fetch(`/api/venues/${venueId}`, {
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
                    await fetch(`/api/venues/${venueId}`, {
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
                <p className="text-xs text-zinc-500 mb-4">
                  These now belong to the venue&apos;s primary client{venue.primary_client_name ? ` (${venue.primary_client_name})` : ''}.
                </p>
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
                {linkedClients.length > 0 && (
                  <div className="mt-5 pt-5 border-t border-zinc-100">
                    <p className="text-xs font-semibold text-zinc-600 mb-2">Linked clients</p>
                    <div className="flex flex-wrap gap-2">
                      {linkedClients.map((client) => (
                        <a
                          key={client.id}
                          href={`/clients/${client.id}`}
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium bg-zinc-100 text-zinc-700 hover:bg-zinc-200 transition-colors"
                        >
                          {client.name}{client.sport ? ` • ${client.sport}` : ''}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Venue Roles */}
              <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
                <h3 className="text-sm font-semibold text-zinc-900 mb-2">Venue Roles</h3>
                <p className="text-xs text-zinc-500 mb-4">Assign key personnel for this venue</p>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-zinc-500 block mb-1">Venue Manager</label>
                    <select
                      value={venue.venue_manager_id || ''}
                      onChange={async (e) => {
                        const val = e.target.value || null
                        await fetch(`/api/venues/${venueId}`, {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ venue_manager_id: val }),
                        })
                        const res = await fetch(`/api/venues/${venueId}`)
                        if (res.ok) { const d = await res.json(); setVenue(d.venue) }
                      }}
                      className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
                    >
                      <option value="">Not assigned</option>
                      {allStaff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-zinc-500 block mb-1">Lead Field Representative</label>
                    <select
                      value={venue.lead_field_rep_id || ''}
                      onChange={async (e) => {
                        const val = e.target.value || null
                        await fetch(`/api/venues/${venueId}`, {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ lead_field_rep_id: val }),
                        })
                        const res = await fetch(`/api/venues/${venueId}`)
                        if (res.ok) { const d = await res.json(); setVenue(d.venue) }
                      }}
                      className="w-full px-3 py-2 border border-[#E8E8E8] rounded text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
                    >
                      <option value="">Not assigned</option>
                      {allStaff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                    </select>
                  </div>
                </div>
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
