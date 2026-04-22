'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { formatDate } from '@/lib/format-date'
import { useAuth } from '@/lib/useAuth'

interface VenueOption {
  id: string
  name: string
}

interface ChecklistItem {
  id: string
  venue_id: string | null
  venue_name: string | null
  name: string
  league: string | null
  phase: string
  opening_date: string | null
  due_date: string | null
  item_description: string | null
  checklist_assignee_id: string | null
  checklist_assignee_name: string | null
  status: string
  completed_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface TemplateOption {
  id: string
  name: string
  league: string | null
  items: Array<{
    phase: string
    name: string
    itemDescription: string
    defaultAssigneeRole: string
  }>
}

const PHASES = [
  { key: '90_day', label: '90 Day' },
  { key: '60_day', label: '60 Day' },
  { key: '30_day', label: '30 Day' },
  { key: 'opening_week', label: 'Opening Week' },
  { key: 'opening_day', label: 'Opening Day' },
] as const

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  in_progress: 'bg-sky-50 text-sky-700 border-sky-200',
  blocked: 'bg-rose-50 text-rose-700 border-rose-200',
  complete: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  skipped: 'bg-amber-50 text-amber-700 border-amber-200',
}

export default function OpeningChecklistsPage() {
  const auth = useAuth()
  const { showToast } = useToast()

  const [venues, setVenues] = useState<VenueOption[]>([])
  const [items, setItems] = useState<ChecklistItem[]>([])
  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [leagueFilter, setLeagueFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [cloneVenueId, setCloneVenueId] = useState<string | null>(null)
  const [cloneTemplateId, setCloneTemplateId] = useState('')
  const [cloneOpeningDate, setCloneOpeningDate] = useState('')
  const [cloning, setCloning] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const fetchData = async () => {
    setLoading(true)
    try {
      const [checklistRes, venuesRes] = await Promise.all([
        fetch('/api/opening-checklists?include_templates=1&open_only=0').then((response) => response.json()),
        fetch('/api/venues').then((response) => response.json()),
      ])

      setItems(checklistRes.items || [])
      setTemplates(checklistRes.templates || [])
      setVenues((venuesRes.venues || []).map((venue: any) => ({ id: venue.id, name: venue.name })))
    } catch (err) {
      console.error(err)
      showToast('Failed to load stadium prep data', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filteredVenues = useMemo(() => {
    const q = search.trim().toLowerCase()
    return venues.filter((venue) => {
      const matchesSearch = !q || venue.name.toLowerCase().includes(q)
      return matchesSearch
    })
  }, [search, venues])

  const venueGroups = useMemo(() => {
    return filteredVenues.map((venue) => {
      const venueItems = items.filter((item) => {
        const matchesVenue = item.venue_id === venue.id
        const matchesLeague = leagueFilter === 'all' || item.league === leagueFilter
        const matchesStatus = statusFilter === 'all' || item.status === statusFilter
        return matchesVenue && matchesLeague && matchesStatus
      })
      return { venue, items: venueItems }
    })
  }, [filteredVenues, items, leagueFilter, statusFilter])

  const activeTemplates = useMemo(() => {
    return cloneVenueId ? templates : templates
  }, [cloneVenueId, templates])

  const summary = useMemo(() => {
    return {
      totalItems: items.length,
      activeVenues: new Set(items.map((item) => item.venue_id).filter(Boolean)).size,
      blocked: items.filter((item) => item.status === 'blocked').length,
      complete: items.filter((item) => item.status === 'complete').length,
    }
  }, [items])

  async function updateStatus(itemId: string, status: string) {
    try {
      const response = await fetch(`/api/opening-checklists/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        showToast(json.error || 'Failed to update checklist item', 'error')
        return
      }
      setItems((current) => current.map((item) => (item.id === itemId ? json.item : item)))
    } catch (err) {
      console.error(err)
      showToast('Failed to update checklist item', 'error')
    }
  }

  async function submitClone(event: FormEvent) {
    event.preventDefault()
    if (!cloneVenueId || !cloneTemplateId || !cloneOpeningDate) {
      showToast('Pick a template and opening date first', 'error')
      return
    }

    setCloning(true)
    try {
      const response = await fetch('/api/opening-checklists/clone-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: cloneVenueId,
          template_id: cloneTemplateId,
          opening_date: cloneOpeningDate,
        }),
      })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) {
        showToast(json.error || 'Failed to start stadium prep', 'error')
        return
      }

      showToast(`Prep started: ${json.created_count || 0} items created`, 'success')
      setCloneVenueId(null)
      setCloneTemplateId('')
      setCloneOpeningDate('')
      await fetchData()
    } catch (err) {
      console.error(err)
      showToast('Failed to start stadium prep', 'error')
    } finally {
      setCloning(false)
    }
  }

  function togglePhase(venueId: string, phase: string) {
    const key = `${venueId}:${phase}`
    setCollapsed((current) => ({ ...current, [key]: !current[key] }))
  }

  if (loading || !auth.loaded) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-14 w-72 rounded-2xl" />
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-96 w-full rounded-2xl" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <section className="rounded-2xl border border-[#D9E4FF] bg-gradient-to-br from-[#F8FBFF] via-white to-[#EEF4FF] p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0A52EF]">Operations</div>
              <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Stadium Prep</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Gianni’s 30/60/90 opening checklist flow, organized by venue and kickoff phase.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/70 bg-white px-4 py-3 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Checklist Items</div>
                <div className="mt-2 text-2xl font-semibold text-zinc-950">{summary.totalItems}</div>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white px-4 py-3 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Active Venues</div>
                <div className="mt-2 text-2xl font-semibold text-zinc-950">{summary.activeVenues}</div>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white px-4 py-3 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Blocked</div>
                <div className="mt-2 text-2xl font-semibold text-rose-600">{summary.blocked}</div>
              </div>
              <div className="rounded-2xl border border-white/70 bg-white px-4 py-3 shadow-sm">
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Completed</div>
                <div className="mt-2 text-2xl font-semibold text-emerald-600">{summary.complete}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[#E6ECF5] bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="relative flex-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search venues..."
                className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] py-2.5 pl-10 pr-4 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
              />
            </div>
            <select
              value={leagueFilter}
              onChange={(event) => setLeagueFilter(event.target.value)}
              className="rounded-xl border border-[#E6ECF5] bg-white px-3 py-2.5 text-sm text-zinc-700 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
            >
              <option value="all">All Leagues</option>
              {['MLB', 'NBA', 'NHL', 'NFL', 'NCAA', 'OTHER'].map((league) => (
                <option key={league} value={league}>{league === 'OTHER' ? 'Other' : league}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="rounded-xl border border-[#E6ECF5] bg-white px-3 py-2.5 text-sm text-zinc-700 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="in_progress">In Progress</option>
              <option value="blocked">Blocked</option>
              <option value="complete">Complete</option>
              <option value="skipped">Skipped</option>
            </select>
          </div>
        </section>

        <section className="space-y-4">
          {venueGroups.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#D9E4FF] bg-white p-16 text-center shadow-sm">
              <p className="text-sm font-medium text-zinc-900">No venues match this filter.</p>
              <p className="mt-1 text-sm text-zinc-500">Try a different search or league.</p>
            </div>
          ) : (
            venueGroups.map(({ venue, items: venueItems }) => (
              <div key={venue.id} className="rounded-2xl border border-[#E6ECF5] bg-white shadow-sm">
                <div className="flex flex-col gap-3 border-b border-[#EEF2F7] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-950">{venue.name}</h2>
                    <p className="mt-1 text-sm text-zinc-500">
                      {venueItems.length} checklist item{venueItems.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/opening-checklists/${venue.id}`}
                      className="rounded-xl border border-[#D9E4FF] px-4 py-2 text-sm font-medium text-[#0A52EF] transition hover:bg-[#F5F9FF]"
                    >
                      Open Venue Detail
                    </Link>
                    <button
                      onClick={() => setCloneVenueId(venue.id)}
                      className="rounded-xl bg-[#0A52EF] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#0840C0]"
                    >
                      Start Prep
                    </button>
                  </div>
                </div>

                {venueItems.length === 0 ? (
                  <div className="px-5 py-10 text-center">
                    <p className="text-sm font-medium text-zinc-900">No opening checklist items yet.</p>
                    <p className="mt-1 text-sm text-zinc-500">Kick off a seeded template to build this venue’s prep plan.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#F0F3F8]">
                    {PHASES.map((phase) => {
                      const phaseItems = venueItems.filter((item) => item.phase === phase.key)
                      const collapseKey = `${venue.id}:${phase.key}`
                      const isCollapsed = collapsed[collapseKey] ?? false
                      return (
                        <div key={phase.key}>
                          <button
                            onClick={() => togglePhase(venue.id, phase.key)}
                            className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-[#FAFCFF]"
                          >
                            <div>
                              <div className="text-sm font-semibold text-zinc-900">{phase.label}</div>
                              <div className="mt-1 text-xs text-zinc-500">{phaseItems.length} item{phaseItems.length === 1 ? '' : 's'}</div>
                            </div>
                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-zinc-400 transition-transform ${isCollapsed ? '-rotate-90' : 'rotate-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>

                          {!isCollapsed && (
                            <div className="space-y-3 px-5 pb-5">
                              {phaseItems.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-[#D9E4FF] bg-[#FBFDFF] p-4 text-sm text-zinc-500">
                                  No items in this phase yet.
                                </div>
                              ) : (
                                phaseItems.map((item) => (
                                  <div key={item.id} className="rounded-2xl border border-[#E6ECF5] bg-[#FCFDFF] p-4">
                                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <h3 className="text-sm font-semibold text-zinc-950">{item.name}</h3>
                                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_TONE[item.status] || STATUS_TONE.pending}`}>
                                            {item.status.replace('_', ' ')}
                                          </span>
                                        </div>
                                        <p className="mt-2 text-sm text-zinc-600">{item.item_description || 'No description yet.'}</p>
                                        <div className="mt-3 flex flex-wrap gap-4 text-xs text-zinc-500">
                                          <span>Assignee: {item.checklist_assignee_name || 'Unassigned'}</span>
                                          <span>Due: {formatDate(item.due_date)}</span>
                                          <span>Opening: {formatDate(item.opening_date)}</span>
                                        </div>
                                      </div>
                                      {auth.isManager && (
                                        <select
                                          value={item.status}
                                          onChange={(event) => updateStatus(item.id, event.target.value)}
                                          className="rounded-xl border border-[#E6ECF5] bg-white px-3 py-2 text-sm text-zinc-700 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                                        >
                                          <option value="pending">Pending</option>
                                          <option value="in_progress">In Progress</option>
                                          <option value="blocked">Blocked</option>
                                          <option value="complete">Complete</option>
                                          <option value="skipped">Skipped</option>
                                        </select>
                                      )}
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </section>

        {cloneVenueId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/45 p-4 backdrop-blur-[2px]">
            <div className="w-full max-w-2xl rounded-[28px] border border-[#D9E4FF] bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-[#E6ECF5] px-6 py-5">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0A52EF]">Start Prep</div>
                  <h2 className="mt-1 text-lg font-semibold text-zinc-950">
                    {venues.find((venue) => venue.id === cloneVenueId)?.name || 'Venue'}
                  </h2>
                </div>
                <button onClick={() => setCloneVenueId(null)} className="rounded-full p-2 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form onSubmit={submitClone} className="space-y-5 px-6 py-6">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Template</label>
                  <select
                    value={cloneTemplateId}
                    onChange={(event) => setCloneTemplateId(event.target.value)}
                    className="w-full rounded-xl border border-[#E6ECF5] bg-white px-4 py-3 text-sm text-zinc-700 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                  >
                    <option value="">Select template...</option>
                    {activeTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} {template.league ? `(${template.league})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Opening Date</label>
                  <input
                    type="date"
                    value={cloneOpeningDate}
                    onChange={(event) => setCloneOpeningDate(event.target.value)}
                    className="w-full rounded-xl border border-[#E6ECF5] bg-[#FBFDFF] px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-[#0A52EF] focus:ring-4 focus:ring-[#0A52EF]/10"
                  />
                </div>

                {cloneTemplateId && (
                  <div className="rounded-2xl border border-[#E6ECF5] bg-[#FBFDFF] p-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Template Preview</div>
                    <div className="mt-3 space-y-3">
                      {(templates.find((template) => template.id === cloneTemplateId)?.items || []).map((item, index) => (
                        <div key={`${item.name}-${index}`} className="rounded-xl border border-white bg-white px-3 py-3">
                          <div className="text-sm font-medium text-zinc-900">{item.name}</div>
                          <div className="mt-1 text-xs text-zinc-500">
                            {item.phase.replace('_', ' ')} · {item.defaultAssigneeRole.replace('_', ' ')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setCloneVenueId(null)}
                    className="rounded-xl border border-[#E6ECF5] px-4 py-2.5 text-sm font-medium text-zinc-600 transition hover:border-zinc-300 hover:text-zinc-900"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={cloning}
                    className="rounded-xl bg-[#0A52EF] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#0840C0] disabled:opacity-50"
                  >
                    {cloning ? 'Starting...' : 'Start Prep'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
