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
  alert_thresholds: number[]
  alert_recipient_email: string | null
}

interface TimeEntry {
  id: string
  budget_id: string | null
  designer_id: string | null
  designer_name: string | null
  design_request_id: string | null
  design_request_title: string | null
  design_request_tricode: string | null
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

        {/* Edit budget — Alexis 5/6: "Where can I assign the hour budgets
            per client and contract dates?" Inline editor for contract dates,
            total, client name. PATCH /api/hours-budgets/[id] writes through. */}
        <details className="border border-zinc-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-900 select-none">Edit budget · contract dates · total hours</summary>
          <BudgetEditor
            budget={budget}
            onSaved={fetchData}
          />
        </details>

        <div className="flex gap-3 justify-end items-center">
             {isAdmin && (
                <>
                  {(budget.alert_thresholds || [25, 50, 75, 85, 90, 95, 100]).map((threshold) => (
                    <button key={threshold} onClick={() => simulateAlert(threshold)} disabled={simulating} className="text-xs bg-zinc-200 hover:bg-zinc-300 text-zinc-800 px-3 py-1.5 rounded transition-colors disabled:opacity-50">Simulate {threshold}%</button>
                  ))}
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

            {/* Per-request breakdown (Alexis 5/6 — "how many entries per
                job"). Aggregates the same time-entries list grouped by the
                linked design request. Untracked time (no design_request_id)
                rolls up under "Unlinked entries". */}
            {entries.length > 0 && (() => {
              const byJob = new Map<string, { title: string; tricode: string | null; count: number; hours: number; href: string | null }>()
              for (const e of entries) {
                const key = e.design_request_id || '__unlinked__'
                const cur = byJob.get(key)
                const title = e.design_request_title || (key === '__unlinked__' ? 'Unlinked entries' : 'Untitled request')
                if (cur) { cur.count++; cur.hours += Number(e.hours) || 0 }
                else byJob.set(key, {
                  title, tricode: e.design_request_tricode || null,
                  count: 1, hours: Number(e.hours) || 0,
                  href: e.design_request_id ? `/designs/${e.design_request_id}` : null,
                })
              }
              const groups = Array.from(byJob.values()).sort((a, b) => b.hours - a.hours)
              return (
                <div className="border border-zinc-200 bg-white p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-zinc-900">Per request</h2>
                    <span className="text-xs text-zinc-400">{groups.length} requests · {entries.length} entries</span>
                  </div>
                  <div className="mt-4 divide-y divide-zinc-100">
                    {groups.map((g, i) => (
                      <div key={i} className="flex items-center justify-between py-2 gap-3">
                        <div className="min-w-0 flex-1">
                          {g.href ? (
                            <a href={g.href} className="text-sm font-medium text-zinc-900 hover:text-[#0A52EF] hover:underline truncate block">{g.title}</a>
                          ) : (
                            <span className="text-sm font-medium text-zinc-500 truncate block">{g.title}</span>
                          )}
                          {g.tricode && <span className="text-[10px] font-mono text-zinc-400">{g.tricode}</span>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="text-sm font-semibold text-zinc-900 tabular-nums">{g.hours.toFixed(1)} hrs</div>
                          <div className="text-[10px] text-zinc-500 tabular-nums">{g.count} {g.count === 1 ? 'entry' : 'entries'}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}

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
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-medium text-zinc-900">{entry.designer_name || 'Unassigned designer'}</h3>
                        <p className="mt-1 text-xs text-zinc-400">{entry.entry_date}</p>
                      </div>
                      <span className="rounded-full bg-zinc-900 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white flex-shrink-0">
                        {Number(entry.hours).toFixed(2)} hrs
                      </span>
                    </div>
                    {/* Linked design request — Alexis 5/6: "can you add what
                        the request is" on the time-entry card. */}
                    {entry.design_request_id && (
                      <a
                        href={`/designs/${entry.design_request_id}`}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#0A52EF] hover:underline"
                        title="Open the design request this time was logged against"
                      >
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 3h7v7M10 14 21 3M21 14v7H3V3h7" /></svg>
                        <span className="truncate">
                          {entry.design_request_title || 'Open request'}
                          {entry.design_request_tricode ? ` · ${entry.design_request_tricode}` : ''}
                        </span>
                      </a>
                    )}
                    <p className="mt-2 text-sm text-zinc-600">{entry.description || 'No description'}</p>
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

function BudgetEditor({ budget, onSaved }: { budget: BudgetDetail; onSaved: () => void }) {
  const [draft, setDraft] = useState({
    client_name: budget.client_name || '',
    contract_start: budget.contract_start || '',
    contract_end: budget.contract_end || '',
    total_hours: budget.total_hours == null ? '' : String(budget.total_hours),
    league: budget.league || '',
    season: budget.season || '',
    alert_thresholds: (budget.alert_thresholds || [25, 50, 75, 85, 90, 95, 100]).join(', '),
    alert_recipient_email: budget.alert_recipient_email || '',
  })
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/hours-budgets/${budget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_name: draft.client_name.trim() || null,
          contract_start: draft.contract_start || null,
          contract_end: draft.contract_end || null,
          total_hours: draft.total_hours.trim() === '' ? 0 : Number(draft.total_hours),
          league: draft.league.trim() || null,
          season: draft.season.trim() || null,
          alert_thresholds: draft.alert_thresholds.split(',').map((value) => Number(value.trim())),
          alert_recipient_email: draft.alert_recipient_email.trim() || null,
        }),
      })
      if (res.ok) {
        setSavedFlash(true)
        await onSaved()
        setTimeout(() => setSavedFlash(false), 1600)
      }
    } finally { setSaving(false) }
  }

  return (
    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
      <Field label="Client">
        <input value={draft.client_name} onChange={e => setDraft(p => ({ ...p, client_name: e.target.value }))}
          className="w-full border border-zinc-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-zinc-400" />
      </Field>
      <Field label="Contract Start">
        <input type="date" value={draft.contract_start} onChange={e => setDraft(p => ({ ...p, contract_start: e.target.value }))}
          className="w-full border border-zinc-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-zinc-400" />
      </Field>
      <Field label="Contract End">
        <input type="date" value={draft.contract_end} onChange={e => setDraft(p => ({ ...p, contract_end: e.target.value }))}
          className="w-full border border-zinc-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-zinc-400" />
      </Field>
      <Field label="Total Hours (blank = Unlimited)">
        <input type="number" step="0.01" value={draft.total_hours} placeholder="Unlimited"
          onChange={e => setDraft(p => ({ ...p, total_hours: e.target.value }))}
          className="w-full border border-zinc-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-zinc-400" />
      </Field>
      <Field label="League">
        <input value={draft.league} onChange={e => setDraft(p => ({ ...p, league: e.target.value }))}
          className="w-full border border-zinc-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-zinc-400" />
      </Field>
      <Field label="Season">
        <input value={draft.season} onChange={e => setDraft(p => ({ ...p, season: e.target.value }))}
          className="w-full border border-zinc-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-zinc-400" />
      </Field>
      <Field label="Alert Thresholds (%)">
        <input value={draft.alert_thresholds} onChange={e => setDraft(p => ({ ...p, alert_thresholds: e.target.value }))}
          placeholder="25, 50, 75, 85, 90, 95, 100"
          className="w-full border border-zinc-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-zinc-400" />
      </Field>
      <Field label="Client Alert Email">
        <input type="email" value={draft.alert_recipient_email} onChange={e => setDraft(p => ({ ...p, alert_recipient_email: e.target.value }))}
          placeholder="client@example.com"
          className="w-full border border-zinc-300 px-2 py-1.5 outline-none focus:ring-1 focus:ring-zinc-400" />
      </Field>
      <div className="md:col-span-2 lg:col-span-3 flex items-center justify-end gap-2 pt-1">
        {savedFlash && <span className="text-emerald-600 text-[11px]">Saved.</span>}
        <button onClick={save} disabled={saving}
          className="px-3 py-1.5 bg-zinc-900 text-white rounded text-xs font-medium disabled:opacity-50 hover:bg-zinc-800">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</label>
      {children}
    </div>
  )
}
