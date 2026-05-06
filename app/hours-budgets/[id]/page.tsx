'use client'

import { FormEvent, useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'

interface BudgetDetail {
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

interface TimeEntry {
  id: string
  budget_id: string | null
  designer_id: string | null
  designer_name: string | null
  entry_date: string
  hours: number
  description: string | null
  created_at: string
}

interface AlertLog {
  threshold: number
  alerted_at: string
  slack_sent: boolean
  email_sent: boolean
  percent_at_alert: number
}

interface Staff { id: string; full_name: string }

export default function HoursBudgetDetailPage({ params }: { params: { id: string } }) {
  const [budget, setBudget] = useState<BudgetDetail | null>(null)
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [alerts, setAlerts] = useState<AlertLog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [simulating, setSimulating] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  useEffect(() => {
    try { setIsAdmin(localStorage.getItem('userRole') === 'admin') } catch {}
  }, [])
  const [formData, setFormData] = useState({
    designer_id: '',
    entry_date: new Date().toISOString().slice(0, 10),
    hours: '',
    description: '',
  })
  const router = useRouter()

  const fetchData = useCallback(async () => {
    try {
      const [budgetRes, staffRes, alertsRes] = await Promise.all([
        fetch(`/api/hours-budgets/${params.id}`),
        fetch('/api/staff'),
        fetch(`/api/hours-budgets/${params.id}/alert-status`)
      ])
      if (!budgetRes.ok) {
        setLoading(false)
        return
      }
      const budgetData = await budgetRes.json()
      const staffData = await staffRes.json()
      const alertsData = alertsRes.ok ? await alertsRes.json() : { alerts: [] }
      setBudget(budgetData.hours_budget)
      setEntries(budgetData.time_entries || [])
      setStaff(staffData.staff || [])
      setAlerts(alertsData.alerts || [])
      setFormData((prev) => ({ ...prev, entry_date: prev.entry_date || new Date().toISOString().slice(0, 10) }))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [params.id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const utilization = useMemo(() => {
    if (!budget || !budget.total_hours) return 0
    return budget.hours_spent / budget.total_hours
  }, [budget])

  const saveTimeEntry = async (e: FormEvent) => {
    e.preventDefault()
    if (!formData.hours.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          budget_id: params.id,
          designer_id: formData.designer_id || null,
          entry_date: formData.entry_date || new Date().toISOString().slice(0, 10),
          hours: Number(formData.hours),
          description: formData.description || null,
        }),
      })
      if (res.ok) {
        setFormData({
          designer_id: '',
          entry_date: new Date().toISOString().slice(0, 10),
          hours: '',
          description: '',
        })
        await fetchData()
      }
    } catch (err) {
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  const simulateAlert = async (threshold: number) => {
    setSimulating(true)
    try {
      const res = await fetch(`/api/hours-budgets/${params.id}/simulate-alert?threshold=${threshold}`, {
        method: 'POST'
      })
      if (res.ok) {
        await fetchData()
      } else {
        alert('Failed to simulate alert')
      }
    } catch (err) {
      console.error('Simulation error:', err)
      alert('Error running simulation')
    } finally {
      setSimulating(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="max-w-6xl mx-auto space-y-6 py-2">
          <Skeleton className="h-10 w-56" />
          <div className="grid gap-6 lg:grid-cols-[1.5fr,1fr]">
            <Skeleton className="h-80 w-full" />
            <Skeleton className="h-80 w-full" />
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!budget) {
    return (
      <DashboardLayout>
        <div className="max-w-6xl mx-auto py-20 text-center text-sm text-zinc-400">
          Hours budget not found
        </div>
      </DashboardLayout>
    )
  }

  const progress = Math.min(100, Math.max(0, utilization * 100))
  const tone = utilization >= 0.75 ? 'bg-red-500' : utilization >= 0.5 ? 'bg-orange-500' : 'bg-emerald-500'
  // Defensive coercion + Unlimited support per Alexis 5/6: a budget with no
  // total (NULL or 0 total_hours) is treated as unlimited — render only
  // hours-spent, hide percentage / progress bar / remaining-hours line.
  const totalHours = Number(budget.total_hours || 0)
  const hoursSpent = Number(budget.hours_spent || 0)
  const isUnlimited = !totalHours

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-8 py-2">
        <div className="space-y-4">
          <button
            onClick={() => router.push('/hours-budgets')}
            className="flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Hours Budgets
          </button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold text-zinc-900">{budget.client_name}</h1>
              <p className="mt-2 text-xs text-zinc-400">
                {budget.venue_name || 'No venue linked'}
                {budget.league ? ` · ${budget.league}` : ''}
                {budget.season ? ` · ${budget.season}` : ''}
              </p>
            </div>
            <div className="text-right text-xs text-zinc-500">
              <p>{budget.entry_count} entries</p>
              <p>{budget.contract_start || 'No start'} → {budget.contract_end || 'No end'}</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end items-center">
             {isAdmin && (
                <>
                  <button onClick={() => simulateAlert(50)} disabled={simulating} className="text-xs bg-zinc-200 hover:bg-zinc-300 text-zinc-800 px-3 py-1.5 rounded transition-colors disabled:opacity-50">Simulate 50% Alert</button>
                  <button onClick={() => simulateAlert(75)} disabled={simulating} className="text-xs bg-zinc-200 hover:bg-zinc-300 text-zinc-800 px-3 py-1.5 rounded transition-colors disabled:opacity-50">Simulate 75% Alert</button>
                </>
             )}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.3fr,1fr]">
          <div className="space-y-6">
            <div className="border border-zinc-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900">Budget Utilization</h2>
                <span className="text-xs text-zinc-500">
                  {isUnlimited
                    ? <>{hoursSpent.toFixed(1)} hrs · <span className="font-medium text-emerald-700">Unlimited</span></>
                    : <>{hoursSpent.toFixed(1)} / {totalHours.toFixed(1)} hrs</>
                  }
                </span>
              </div>
              {!isUnlimited && (
                <>
                  <div className="mt-4 h-3 rounded-full bg-zinc-100">
                    <div className={`h-3 rounded-full ${tone}`} style={{ width: `${progress}%` }} />
                  </div>
                  <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
                    <span>{Math.round(progress)}% used</span>
                    <span>
                      {totalHours > hoursSpent
                        ? `${(totalHours - hoursSpent).toFixed(1)} hrs remaining`
                        : 'Budget exceeded'}
                    </span>
                  </div>
                </>
              )}
            </div>

            <div className="border border-zinc-200 bg-white p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900">Time Entries</h2>
                <span className="text-xs text-zinc-400">{entries.length} records</span>
              </div>
              <div className="mt-4 space-y-3">
                {entries.length === 0 && (
                  <div className="border border-dashed border-zinc-200 bg-zinc-50 px-3 py-6 text-center text-xs text-zinc-400">
                    No time entries yet
                  </div>
                )}
                {entries.map((entry) => (
                  <div key={entry.id} className="border border-zinc-200 bg-zinc-50 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-sm font-medium text-zinc-900">{entry.designer_name || 'Unassigned designer'}</h3>
                        <p className="mt-1 text-xs text-zinc-400">{entry.entry_date}</p>
                      </div>
                      <span className="rounded-full bg-zinc-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                        {Number(entry.hours).toFixed(2)} hrs
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-zinc-600">{entry.description || 'No description'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <form onSubmit={saveTimeEntry} className="border border-zinc-200 bg-zinc-50 p-5 space-y-4">
              <h2 className="text-sm font-semibold text-zinc-900">Quick Add Time Entry</h2>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Designer</label>
                <select
                  value={formData.designer_id}
                  onChange={(e) => setFormData((prev) => ({ ...prev, designer_id: e.target.value }))}
                  className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                >
                  <option value="">Unassigned</option>
                  {staff.map((person) => (
                    <option key={person.id} value={person.id}>{person.full_name}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Entry Date</label>
                  <input
                    type="date"
                    value={formData.entry_date}
                    onChange={(e) => setFormData((prev) => ({ ...prev, entry_date: e.target.value }))}
                    className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-zinc-600">Hours</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.hours}
                    onChange={(e) => setFormData((prev) => ({ ...prev, hours: e.target.value }))}
                    className="w-full border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-600">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  rows={4}
                  className="w-full resize-none border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Add Time Entry'}
              </button>
            </form>

            <div className="border border-zinc-200 bg-zinc-50 p-5">
              <h2 className="text-sm font-semibold text-zinc-900 mb-4">Budget Details</h2>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between gap-4"><span className="text-zinc-500">Total Hours</span><span className="text-zinc-900">{budget.total_hours}</span></div>
                <div className="flex justify-between gap-4"><span className="text-zinc-500">Spent</span><span className="text-zinc-900">{hoursSpent.toFixed(2)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-zinc-500">Remaining</span><span className="text-zinc-900">{isUnlimited ? '∞' : Math.max(0, totalHours - hoursSpent).toFixed(2)}</span></div>
                <div className="flex justify-between gap-4"><span className="text-zinc-500">Notes</span><span className="max-w-[16rem] text-right text-zinc-900">{budget.notes || '—'}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
