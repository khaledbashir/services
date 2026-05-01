'use client'

import { useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'

interface Venue {
  id: string
  name: string
  market: string
  venue_type: string
  feed_url: string | null
  active_service_count: number
  is_active: boolean
}

interface Candidate {
  url: string
  title: string
  snippet: string
  score: number
  source_kind: 'ticketmaster' | 'league_schedule' | 'venue_calendar' | 'team_website' | 'other'
}

interface VenueSuggestionState {
  loading: boolean
  saving: boolean
  candidates: Candidate[] | null
  error?: string
  saved_url?: string
}

const sourceKindLabel: Record<Candidate['source_kind'], { label: string; style: string }> = {
  ticketmaster:    { label: 'Ticketmaster',    style: 'bg-blue-50 text-blue-700 border-blue-200' },
  league_schedule: { label: 'League Schedule', style: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  venue_calendar:  { label: 'Venue Calendar',  style: 'bg-violet-50 text-violet-700 border-violet-200' },
  team_website:    { label: 'Team Website',    style: 'bg-amber-50 text-amber-700 border-amber-200' },
  other:           { label: 'Other',            style: 'bg-zinc-100 text-zinc-600 border-zinc-200' },
}

function scoreLabel(score: number): { text: string; style: string } {
  if (score >= 0.7) return { text: 'High',   style: 'bg-emerald-100 text-emerald-800' }
  if (score >= 0.5) return { text: 'Medium', style: 'bg-amber-100 text-amber-800' }
  return { text: 'Low',    style: 'bg-zinc-100 text-zinc-600' }
}

export default function FeedFinderPage() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState<Record<string, VenueSuggestionState>>({})
  const [bulkRunning, setBulkRunning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 })
  const toast = useToast()

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/venues?period=week')
        const data = await res.json()
        // Filter to sports venues with active services and no feed URL — the 41
        const eligible = (data.venues || []).filter((v: Venue) =>
          v.is_active &&
          v.venue_type === 'sports' &&
          (v.active_service_count || 0) > 0 &&
          (!v.feed_url || v.feed_url.trim() === '')
        )
        setVenues(eligible)
      } catch (err) {
        console.error('Failed to load venues:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtered = venues.filter((v) =>
    !search.trim() || v.name.toLowerCase().includes(search.toLowerCase())
  )

  async function findForVenue(venueId: string): Promise<void> {
    setSuggestions((prev) => ({ ...prev, [venueId]: { ...prev[venueId], loading: true, candidates: null, error: undefined } }))
    try {
      const res = await fetch(`/api/venues/${venueId}/suggest-feed-url`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setSuggestions((prev) => ({
          ...prev,
          [venueId]: { loading: false, saving: false, candidates: null, error: data.error || 'Search failed' },
        }))
        return
      }
      setSuggestions((prev) => ({
        ...prev,
        [venueId]: { loading: false, saving: false, candidates: data.candidates || [] },
      }))
    } catch (err) {
      setSuggestions((prev) => ({
        ...prev,
        [venueId]: { loading: false, saving: false, candidates: null, error: 'Network error' },
      }))
    }
  }

  async function saveUrl(venueId: string, url: string): Promise<void> {
    setSuggestions((prev) => ({ ...prev, [venueId]: { ...prev[venueId], saving: true } }))
    try {
      const res = await fetch(`/api/venues/${venueId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feed_url: url }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.showToast(data.error || 'Failed to save feed URL', 'error')
        setSuggestions((prev) => ({ ...prev, [venueId]: { ...prev[venueId], saving: false } }))
        return
      }
      setSuggestions((prev) => ({
        ...prev,
        [venueId]: { ...prev[venueId], saving: false, saved_url: url },
      }))
      toast.showToast('Feed URL saved', 'success')
    } catch (err) {
      toast.showToast('Network error saving URL', 'error')
      setSuggestions((prev) => ({ ...prev, [venueId]: { ...prev[venueId], saving: false } }))
    }
  }

  async function runForAll(): Promise<void> {
    setBulkRunning(true)
    setBulkProgress({ done: 0, total: filtered.length })
    // Run in batches of 4 so we don't hammer the search backend
    const batchSize = 4
    let done = 0
    for (let i = 0; i < filtered.length; i += batchSize) {
      const slice = filtered.slice(i, i + batchSize)
      await Promise.all(slice.map((v) => findForVenue(v.id)))
      done += slice.length
      setBulkProgress({ done, total: filtered.length })
    }
    setBulkRunning(false)
    toast.showToast(`AI ran on ${filtered.length} venues — review and confirm`, 'success')
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">Feed URL Finder</h1>
            <p className="text-sm text-zinc-500 mt-1">
              {filtered.length} sports {filtered.length === 1 ? 'venue' : 'venues'} with services on but no event feed.
              The AI suggests likely schedule URLs — confirm one per venue and they flip to auto-sync.
            </p>
          </div>
          <button
            onClick={runForAll}
            disabled={bulkRunning || filtered.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0A52EF] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#0840C0] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {bulkRunning ? `Running… ${bulkProgress.done}/${bulkProgress.total}` : `Run AI on all ${filtered.length}`}
          </button>
        </div>

        <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-4">
          <input
            type="text"
            placeholder="Search venues…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-[#E8E8E8] rounded outline-none focus:border-[#0A52EF]"
          />
        </div>

        {loading && <Skeleton className="h-64 w-full" />}

        {!loading && filtered.length === 0 && (
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-12 text-center">
            <p className="text-sm text-zinc-500">All sports venues have feed URLs. Nothing to do here.</p>
          </div>
        )}

        {!loading && filtered.map((v) => {
          const state = suggestions[v.id]
          const saved = state?.saved_url
          return (
            <div key={v.id} className="bg-white rounded border border-[#E8E8E8] shadow-sm overflow-hidden">
              <div className="flex items-start justify-between gap-4 p-5 border-b border-[#E8E8E8]">
                <div>
                  <h2 className="text-base font-semibold text-zinc-900">{v.name}</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">{v.market || 'No market'}</p>
                  {saved && (
                    <p className="text-xs text-emerald-700 mt-2">
                      ✓ Feed URL saved — venue will auto-sync starting next cycle
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!state?.loading && !saved && (
                    <button
                      onClick={() => findForVenue(v.id)}
                      className="text-sm font-medium text-[#0A52EF] hover:text-[#0840C0]"
                    >
                      {state?.candidates ? 'Re-run AI' : 'Find URL'}
                    </button>
                  )}
                  {state?.loading && <span className="text-sm text-zinc-500">Searching…</span>}
                </div>
              </div>

              {state?.error && (
                <div className="px-5 py-3 bg-rose-50 text-sm text-rose-700">{state.error}</div>
              )}

              {state?.candidates && !saved && state.candidates.length === 0 && (
                <div className="px-5 py-4 text-sm text-zinc-500">
                  No candidates found. Add a feed URL manually on the venue page.
                </div>
              )}

              {state?.candidates && !saved && state.candidates.length > 0 && (
                <div className="divide-y divide-[#E8E8E8]">
                  {state.candidates.map((c, idx) => {
                    const score = scoreLabel(c.score)
                    const kind = sourceKindLabel[c.source_kind]
                    return (
                      <div key={`${v.id}-${idx}`} className="px-5 py-4 hover:bg-zinc-50">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded border ${kind.style}`}>
                                {kind.label}
                              </span>
                              <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded ${score.style}`}>
                                {score.text} confidence
                              </span>
                            </div>
                            {c.title && <p className="mt-2 text-sm font-medium text-zinc-900">{c.title}</p>}
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 block text-xs text-[#0A52EF] hover:underline truncate"
                            >
                              {c.url}
                            </a>
                            {c.snippet && <p className="mt-2 text-xs text-zinc-600 line-clamp-2">{c.snippet}</p>}
                          </div>
                          <button
                            onClick={() => saveUrl(v.id, c.url)}
                            disabled={state.saving}
                            className="flex-shrink-0 rounded-lg bg-[#0A52EF] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0840C0] disabled:opacity-50"
                          >
                            {state.saving ? 'Saving…' : 'Use this URL'}
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </DashboardLayout>
  )
}
