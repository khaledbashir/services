'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { AlertBadge } from './alert-badge'

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
  created_at: string
  updated_at: string
  hours_spent: number
  entry_count: number
}

interface Venue { id: string; name: string }

function progressTone(progress: number) {
  if (progress >= 0.75) return 'bg-red-500'
  if (progress >= 0.5) return 'bg-orange-500'
  return 'bg-emerald-500'
}

function progressLabel(progress: number) {
  if (progress >= 0.75) return 'text-red-700 bg-red-50 border-red-100'
  if (progress >= 0.5) return 'text-orange-700 bg-orange-50 border-orange-100'
  return 'text-emerald-700 bg-emerald-50 border-emerald-100'
}

export default function HoursBudgetsPage() {
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    client_name: '',
    venue_id: '',
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return budgets.filter((item) =>
      !q ||
      item.client_name.toLowerCase().includes(q) ||
      (item.venue_name || '').toLowerCase().includes(q) ||
      (item.league || '').toLowerCase().includes(q) ||
      (item.season || '').toLowerCase().includes(q)
    )
  }, [budgets, search])

  const totals = useMemo(() => {
    const totalBudgetHours = budgets.reduce((sum, item) => sum + Number(item.total_hours || 0), 0)
    const totalSpentHours = budgets.reduce((sum, item) => sum + Number(item.hours_spent || 0), 0)
    return { totalBudgetHours, totalSpentHours }
  }, [budgets])

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
              {budgets.length} budgets · {totals.totalSpentHours.toFixed(1)} / {totals.totalBudgetHours.toFixed(1)} hrs
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
                  onChange={(e) => setFormData((prev) => ({ ...prev, venue_id: e.target.value }))}
                  className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                >
                  <option value="">Select venue...</option>
                  {venues.map((venue) => (
                    <option key={venue.id} value={venue.id}>{venue.name}</option>
                  ))}
                </select>
              </div>
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
            {filtered.length} shown
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
          {filtered.map((budget) => {
            const total = Number(budget.total_hours || 0)
            const spent = Number(budget.hours_spent || 0)
            const isUnlimited = total <= 0
            const progress = isUnlimited ? 0 : spent / total
            const tone = progressTone(progress)
            return (
              <Link
                key={budget.id}
                href={`/hours-budgets/${budget.id}`}
                className="border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-900 flex items-center">{budget.client_name}{!isUnlimited && <AlertBadge budgetId={budget.id} progress={progress} />}</h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      {budget.venue_name || 'No venue linked'}
                      {budget.league ? ` · ${budget.league}` : ''}
                      {budget.season ? ` · ${budget.season}` : ''}
                    </p>
                  </div>
                  {isUnlimited ? (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                      Unlimited
                    </span>
                  ) : (
                    <span className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${progressLabel(progress)}`}>
                      {Math.round(progress * 100)}%
                    </span>
                  )}
                </div>
                <div className="mt-4">
                  {!isUnlimited && (
                    <div className="h-2 rounded-full bg-zinc-100">
                      <div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                    <span>{spent.toFixed(1)} spent</span>
                    <span>{isUnlimited ? '∞ unlimited' : `${total.toFixed(1)} total`}</span>
                  </div>
                </div>
                <div className="mt-4 space-y-1 text-xs text-zinc-500">
                  <p>{budget.entry_count} time entries</p>
                  <p>{budget.contract_start || 'No start'} → {budget.contract_end || 'No end'}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </DashboardLayout>
  )
}
