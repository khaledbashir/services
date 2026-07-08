'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { venueTriCodes, allTriCodes } from '@/lib/tricodes'

interface Budget {
  id: string
  client_name: string
  venue_id: string | null
  venue_name: string | null
  league: string | null
  season: string | null
  total_hours: number
  contract_start: string | null
  contract_end: string | null
  notes: string | null
  tricode: string | null
  created_at: string
  updated_at: string
  hours_spent: number
  entry_count: number
}

interface Venue { id: string; name: string; aliases?: string[] | null }

// The Wrike import created one budget per client × YEAR, with the tri-code
// buried in the client name — e.g. "Indiana Pacers (IND-PAC)". That's why the
// list looked like it had missing tri-codes (no badge) and duplicates (the same
// client repeated once per season). We derive the tri-code and roll the yearly
// rows up under it so every tri-code shows exactly once. Non-destructive — the
// per-year budgets stay intact underneath (real, distinct hours per year).
function budgetTriCodeFromName(name: string): string | null {
  const matches = [...(name || '').matchAll(/\(([A-Z0-9]{2,4}(?:-[A-Z0-9]{2,4}){0,3})\)/g)]
  return matches.length ? matches[matches.length - 1][1].toUpperCase() : null
}

function cleanBudgetName(name: string): string {
  return (name || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
}

interface BudgetGroup {
  key: string
  tricode: string | null
  title: string
  venue_name: string | null
  league: string | null
  spent: number
  entry_count: number
  budgets: Budget[]
}

export default function HoursBudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    client_name: '',
    venue_id: '',
    tricode: '',
    league: '',
    season: '',
    total_hours: '',
    contract_start: '',
    contract_end: '',
    notes: '',
  })

  const fetchData = async () => {
    try {
      const [budgetsRes, venuesRes] = await Promise.all([
        fetch('/api/hours-budgets').then((r) => r.json()),
        fetch('/api/venues').then((r) => r.json()),
      ])
      setBudgets(budgetsRes.hours_budgets || [])
      setVenues(venuesRes.venues || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!formData.client_name.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/hours-budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Empty Total Hours = Unlimited budget (per Alexis 5/6) — pass 0 so
        // the API stores a null/0 total and the detail page renders "Unlimited"
        // with no progress bar / percentage / remaining-hours line.
        body: JSON.stringify({
          ...formData,
          venue_id: formData.venue_id || null,
          total_hours: formData.total_hours.trim() ? Number(formData.total_hours) : 0,
          contract_start: formData.contract_start || null,
          contract_end: formData.contract_end || null,
        }),
      })
      if (res.ok) {
        setFormData({
          client_name: '',
          venue_id: '',
          tricode: '',
          league: '',
          season: '',
          total_hours: '',
          contract_start: '',
          contract_end: '',
          notes: '',
        })
        setShowForm(false)
        await fetchData()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  // Roll the per-year budgets up into one group per tri-code (falling back to the
  // cleaned client name, then venue). Each group shows the tri-code once and sums
  // hours across its seasons; expanding reveals the individual yearly budgets.
  const groups = useMemo(() => {
    const venueSingleTri = (venueId: string | null) => {
      if (!venueId) return null
      const codes = venueTriCodes(venues.find((v) => v.id === venueId)?.aliases)
      return codes.length === 1 ? codes[0] : null
    }
    const map = new Map<string, BudgetGroup>()
    for (const b of budgets) {
      const tri = b.tricode?.trim().toUpperCase() || budgetTriCodeFromName(b.client_name) || venueSingleTri(b.venue_id)
      const title = cleanBudgetName(b.client_name) || b.venue_name || b.client_name || 'Untitled'
      const key = tri || `name:${title.toLowerCase()}`
      const g = map.get(key) || { key, tricode: tri, title, venue_name: b.venue_name, league: b.league, spent: 0, entry_count: 0, budgets: [] }
      g.spent += Number(b.hours_spent || 0)
      g.entry_count += Number(b.entry_count || 0)
      if (!g.venue_name && b.venue_name) g.venue_name = b.venue_name
      if (!g.league && b.league) g.league = b.league
      g.budgets.push(b)
      map.set(key, g)
    }
    const all = Array.from(map.values())
    for (const g of all) {
      g.budgets.sort((a, b) => (b.season || '').localeCompare(a.season || ''))
    }
    all.sort((a, b) => b.spent - a.spent)
    const q = search.trim().toLowerCase()
    if (!q) return all
    return all.filter((g) =>
      g.title.toLowerCase().includes(q) ||
      (g.tricode || '').toLowerCase().includes(q) ||
      (g.venue_name || '').toLowerCase().includes(q) ||
      g.budgets.some((b) => (b.season || '').toLowerCase().includes(q))
    )
  }, [budgets, venues, search])

  const totals = useMemo(() => {
    const totalBudgetHours = budgets.reduce((sum, item) => sum + Number(item.total_hours || 0), 0)
    const totalSpentHours = budgets.reduce((sum, item) => sum + Number(item.hours_spent || 0), 0)
    return { totalBudgetHours, totalSpentHours }
  }, [budgets])

  // Tri-code picker: a chosen venue narrows to that venue's codes; otherwise the
  // full deduped catalog across all venues. Enumerated through the shared helper
  // so nothing is missing (all of a venue's codes, not just one) or duplicated.
  const budgetTriCodeOptions = useMemo(() => {
    if (formData.venue_id) {
      const venue = venues.find((v) => v.id === formData.venue_id)
      return venueTriCodes(venue?.aliases)
    }
    return allTriCodes(venues)
  }, [formData.venue_id, venues])

  if (loading) {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-56 w-full" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">Hours Budgets</h1>
            <p className="mt-1 text-sm text-zinc-500">
              {groups.length} tri-codes · {budgets.length} budgets · {totals.totalSpentHours.toFixed(1)} hrs logged
            </p>
          </div>
          <button
            onClick={() => setShowForm((prev) => !prev)}
            className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors"
          >
            {showForm ? 'Cancel' : 'New Budget'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="border border-zinc-200 bg-zinc-50 p-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Client Name *</label>
                <input
                  type="text"
                  value={formData.client_name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, client_name: e.target.value }))}
                  className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Venue</label>
                <select
                  value={formData.venue_id}
                  onChange={(e) => {
                    const venueId = e.target.value
                    const venue = venueId ? venues.find((v) => v.id === venueId) : null
                    const codes = venueTriCodes(venue?.aliases)
                    setFormData((prev) => ({
                      ...prev,
                      venue_id: venueId,
                      // Auto-pick when the venue has a single code; keep the
                      // current one only if it's still valid for this venue.
                      tricode: codes.length === 1 ? codes[0] : (codes.includes(prev.tricode) ? prev.tricode : ''),
                    }))
                  }}
                  className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                >
                  <option value="">Select venue...</option>
                  {venues.map((venue) => (
                    <option key={venue.id} value={venue.id}>{venue.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              {/* Alexis 5/13: budgets roll up by Tri-Code. Any design request
                  with the same Tri-Code lands hours in this budget. */}
              <label className="mb-1 block text-xs font-medium text-zinc-600">Tri-Code</label>
              {budgetTriCodeOptions.length > 0 ? (
                <select
                  value={formData.tricode}
                  onChange={(e) => setFormData((prev) => ({ ...prev, tricode: e.target.value }))}
                  className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm uppercase font-mono outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                >
                  <option value="">{formData.venue_id ? 'Match by venue only' : 'All tri-codes — select one'}</option>
                  {budgetTriCodeOptions.map((code) => (
                    <option key={code} value={code}>{code}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={formData.tricode}
                  onChange={(e) => setFormData((prev) => ({ ...prev, tricode: e.target.value.toUpperCase() }))}
                  placeholder="e.g. ABC"
                  className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm uppercase font-mono outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                />
              )}
              <p className="mt-1 text-[11px] text-zinc-500">Design requests with this Tri-Code will roll up to this budget. Leave blank to match by venue only.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">League</label>
                <input
                  type="text"
                  value={formData.league}
                  onChange={(e) => setFormData((prev) => ({ ...prev, league: e.target.value }))}
                  className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Season</label>
                <input
                  type="text"
                  value={formData.season}
                  onChange={(e) => setFormData((prev) => ({ ...prev, season: e.target.value }))}
                  className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Total Hours <span className="font-normal text-zinc-400">(leave blank for Unlimited)</span></label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.total_hours}
                  onChange={(e) => setFormData((prev) => ({ ...prev, total_hours: e.target.value }))}
                  placeholder="Unlimited"
                  className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Contract End</label>
                <input
                  type="date"
                  value={formData.contract_end}
                  onChange={(e) => setFormData((prev) => ({ ...prev, contract_end: e.target.value }))}
                  className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Contract Start</label>
                <input
                  type="date"
                  value={formData.contract_start}
                  onChange={(e) => setFormData((prev) => ({ ...prev, contract_start: e.target.value }))}
                  className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Notes</label>
                <input
                  type="text"
                  value={formData.notes}
                  onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Budget'}
            </button>
          </form>
        )}

        <div className="flex items-center justify-between gap-4 border-b border-zinc-200">
          <div className="pb-2 text-sm text-zinc-500">
            {groups.length} shown
          </div>
          <div className="pb-2">
            <input
              type="text"
              placeholder="Search budgets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72 border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => {
            const isOpen = expanded.has(group.key)
            const single = group.budgets.length === 1 ? group.budgets[0] : null
            const seasons = group.budgets.map((b) => b.season).filter(Boolean)
            return (
              <div key={group.key} className="border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-zinc-900 flex items-center gap-2 flex-wrap">
                      <span className="truncate">{group.title}</span>
                      {group.tricode && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono font-bold text-zinc-700 tracking-wider">{group.tricode}</span>
                      )}
                    </h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      {group.venue_name || 'No venue linked'}
                      {group.league ? ` · ${group.league}` : ''}
                    </p>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 whitespace-nowrap">
                    Unlimited
                  </span>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs text-zinc-500">
                  <span className="font-medium text-zinc-700">{group.spent.toFixed(1)} hrs logged</span>
                  <span>{group.entry_count} entries</span>
                </div>
                <div className="mt-3 border-t border-zinc-100 pt-3">
                  {single ? (
                    <Link href={`/hours-budgets/${single.id}`} className="text-xs font-medium text-[#0A52EF] hover:underline">
                      Open {single.season || 'budget'} →
                    </Link>
                  ) : (
                    <>
                      <button
                        onClick={() => setExpanded((prev) => {
                          const next = new Set(prev)
                          next.has(group.key) ? next.delete(group.key) : next.add(group.key)
                          return next
                        })}
                        className="text-xs font-medium text-zinc-600 hover:text-zinc-900"
                      >
                        {isOpen ? '▾ ' : '▸ '}{group.budgets.length} seasons ({seasons.join(', ')})
                      </button>
                      {isOpen && (
                        <div className="mt-2 space-y-1">
                          {group.budgets.map((b) => (
                            <Link
                              key={b.id}
                              href={`/hours-budgets/${b.id}`}
                              className="flex items-center justify-between rounded px-2 py-1.5 text-xs hover:bg-zinc-50"
                            >
                              <span className="font-medium text-zinc-700">{b.season || '—'}</span>
                              <span className="text-zinc-500">{Number(b.hours_spent || 0).toFixed(1)} hrs · {b.entry_count} entries</span>
                            </Link>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </DashboardLayout>
  )
}
