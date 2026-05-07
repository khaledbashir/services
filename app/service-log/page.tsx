'use client'

import { useEffect, useMemo, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'

interface ServiceRequest {
  id: string
  received_at: string
  source: string
  source_url: string | null
  requester: string | null
  summary: string
  classification: 'FIX' | 'NEW' | 'MIXED'
  classification_confidence: number | null
  classification_basis: string | null
  repo: string | null
  area: string | null
  keywords: string[] | null
  estimated_hours: number | null
  estimate_basis: string | null
  retainer_covered: boolean
  status: 'open' | 'in_progress' | 'shipped' | 'quoted' | 'cancelled'
  started_at: string | null
  shipped_at: string | null
  actual_hours: number | null
  shipped_commit_sha: string | null
  notes: string | null
}

interface Meter {
  month: string
  hours_used: number
  hours_estimated_open: number
  cap_hours: number
  overage_hours: number
}

const STATUS_TONE: Record<string, string> = {
  open: 'bg-amber-50 text-amber-700 border-amber-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  shipped: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  quoted: 'bg-purple-50 text-purple-700 border-purple-200',
  cancelled: 'bg-gray-50 text-gray-500 border-gray-200',
}

const CLASSIFICATION_TONE: Record<string, string> = {
  FIX: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  NEW: 'bg-purple-100 text-purple-800 border-purple-300',
  MIXED: 'bg-orange-100 text-orange-800 border-orange-300',
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function ServiceLogPage() {
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [meter, setMeter] = useState<Meter | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [classificationFilter, setClassificationFilter] = useState<string>('')
  const [showTriage, setShowTriage] = useState(false)
  const [triageText, setTriageText] = useState('')
  const [triageRequester, setTriageRequester] = useState('')
  const [triageSource, setTriageSource] = useState('slack')
  const [submitting, setSubmitting] = useState(false)
  const [latestCard, setLatestCard] = useState<any>(null)

  const refresh = async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter) params.set('status', statusFilter)
    if (classificationFilter) params.set('classification', classificationFilter)
    const r = await fetch(`/api/service-triage?${params.toString()}`).then(r => r.json())
    setRequests(r.requests || [])
    setMeter(r.meter || null)
    setLoading(false)
  }

  useEffect(() => { refresh() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [statusFilter, classificationFilter])

  const submitTriage = async () => {
    if (!triageText.trim()) return
    setSubmitting(true)
    try {
      const r = await fetch('/api/service-triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: triageText, requester: triageRequester || undefined, source: triageSource }),
      }).then(r => r.json())
      setLatestCard(r)
      setTriageText('')
      setTriageRequester('')
      await refresh()
    } finally {
      setSubmitting(false)
    }
  }

  const ship = async (id: string) => {
    const hours = window.prompt('Actual hours spent on this fix?')
    if (!hours) return
    const sha = window.prompt('Shipping commit SHA (optional)?') || ''
    await fetch(`/api/service-triage/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'ship', actual_hours: Number(hours), shipped_commit_sha: sha || undefined }),
    })
    await refresh()
  }

  const start = async (id: string) => {
    await fetch(`/api/service-triage/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start' }),
    })
    await refresh()
  }

  const quote = async (id: string) => {
    const amt = window.prompt('Quote amount in USD (optional)?') || ''
    const notes = window.prompt('Notes (optional)?') || ''
    await fetch(`/api/service-triage/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'quote', quote_amount: amt ? Number(amt) : undefined, notes: notes || undefined }),
    })
    await refresh()
  }

  const meterFraction = meter ? Math.min(1, meter.hours_used / meter.cap_hours) : 0
  const meterTone = meterFraction >= 1 ? 'bg-red-500' : meterFraction >= 0.75 ? 'bg-orange-500' : 'bg-emerald-500'
  const remaining = meter ? Math.max(0, meter.cap_hours - meter.hours_used) : 0

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Service Log</h1>
            <p className="text-sm text-gray-500 mt-1">
              Triaged stakeholder requests, hours used vs the 12-hr/month service-contract retainer.
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href={`/service-log/report?month=${meter?.month || ''}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Monthly report (print-to-PDF)
            </a>
            <button
              onClick={() => setShowTriage(s => !s)}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              {showTriage ? 'Cancel' : '+ New triage'}
            </button>
          </div>
        </div>

        {meter && (
          <div className="rounded-lg border border-gray-200 bg-white p-4 mb-6">
            <div className="flex items-baseline justify-between mb-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500">{meter.month} retainer utilization</div>
                <div className="text-2xl font-semibold text-gray-900">
                  {meter.hours_used} / {meter.cap_hours} hrs <span className="text-sm font-normal text-gray-500">used</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-gray-700">{remaining} hrs remaining</div>
                {meter.hours_estimated_open > 0 && (
                  <div className="text-xs text-gray-500">+ {meter.hours_estimated_open} hrs estimated on open work</div>
                )}
                {meter.overage_hours > 0 && (
                  <div className="text-xs text-red-600 font-medium">
                    {meter.overage_hours} hrs overage @ $90/hr = ${meter.overage_hours * 90}
                  </div>
                )}
              </div>
            </div>
            <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
              <div className={`h-full ${meterTone}`} style={{ width: `${meterFraction * 100}%` }} />
            </div>
          </div>
        )}

        {showTriage && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 mb-6">
            <div className="text-sm font-medium text-gray-900 mb-2">Triage a new request</div>
            <textarea
              value={triageText}
              onChange={e => setTriageText(e.target.value)}
              placeholder="Paste the Slack message / email / voicemail transcript here..."
              className="w-full h-32 px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
            />
            <div className="flex gap-2 mt-2">
              <input
                value={triageRequester}
                onChange={e => setTriageRequester(e.target.value)}
                placeholder="Requester (Joe, Charlie, Alexis...)"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
              <select
                value={triageSource}
                onChange={e => setTriageSource(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="slack">Slack</option>
                <option value="email">Email</option>
                <option value="voicemail">Voicemail</option>
                <option value="meeting">Meeting</option>
                <option value="manual">Manual</option>
              </select>
              <button
                disabled={submitting || !triageText.trim()}
                onClick={submitTriage}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Triaging...' : 'Triage'}
              </button>
            </div>
          </div>
        )}

        {latestCard && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 mb-6">
            <div className="flex items-start justify-between mb-2">
              <div className="text-sm font-medium text-gray-900">Latest triage card</div>
              <button onClick={() => setLatestCard(null)} className="text-xs text-gray-500 hover:text-gray-700">Dismiss</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm mb-3">
              <div>
                <span className={`inline-block px-2 py-0.5 text-xs rounded border ${CLASSIFICATION_TONE[latestCard.classification]}`}>
                  {latestCard.classification}
                </span>
                <span className="ml-2 text-xs text-gray-600">{latestCard.confidence} confidence ({latestCard.confidence_score}/10)</span>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-600">Area: </span>
                <span className="text-xs font-mono">{latestCard.repo || '?'}/{latestCard.area || '?'}</span>
              </div>
              <div>
                <span className="text-xs text-gray-600">Estimated: </span>
                <span className="text-sm font-semibold">{latestCard.estimate?.hours_low}–{latestCard.estimate?.hours_high} hrs</span>
                <span className="text-xs text-gray-500 ml-1">({latestCard.estimate?.source})</span>
              </div>
              <div className="text-right">
                <span className="text-xs">{latestCard.retainer_covered ? '✅ retainer' : '🟡 fixed-price'}</span>
              </div>
            </div>
            <div className="text-xs text-gray-700 mb-3 italic">{latestCard.classification_basis}</div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">Paste-ready reply to requester</div>
              <textarea
                readOnly
                value={latestCard.stakeholder_message}
                className="w-full h-44 px-3 py-2 border border-gray-300 rounded-md text-sm bg-white font-mono"
                onClick={e => (e.target as HTMLTextAreaElement).select()}
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 mb-4 text-sm">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md"
          >
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="shipped">Shipped</option>
            <option value="quoted">Quoted</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select
            value={classificationFilter}
            onChange={e => setClassificationFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md"
          >
            <option value="">All types</option>
            <option value="FIX">FIX</option>
            <option value="NEW">NEW</option>
            <option value="MIXED">MIXED</option>
          </select>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">Received</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Summary</th>
                <th className="px-3 py-2 text-left">Area</th>
                <th className="px-3 py-2 text-right">Est.</th>
                <th className="px-3 py-2 text-right">Actual</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Requester</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">Loading...</td></tr>
              )}
              {!loading && requests.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">No requests yet — paste one above to get started.</td></tr>
              )}
              {requests.map(r => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs text-gray-600 whitespace-nowrap">{fmtDate(r.received_at)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 text-xs rounded border ${CLASSIFICATION_TONE[r.classification]}`}>
                      {r.classification}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-900 max-w-md">
                    <div className="truncate" title={r.summary}>{r.summary}</div>
                  </td>
                  <td className="px-3 py-2 text-xs font-mono text-gray-600">
                    {r.repo && r.area ? `${r.repo}/${r.area}` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                    {r.estimated_hours !== null ? `${r.estimated_hours}h` : '—'}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">
                    {r.actual_hours !== null ? `${r.actual_hours}h` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 text-xs rounded border ${STATUS_TONE[r.status]}`}>
                      {r.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">{r.requester || '—'}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {r.status === 'open' && r.retainer_covered && (
                      <button onClick={() => start(r.id)} className="text-xs text-blue-600 hover:underline mr-2">Start</button>
                    )}
                    {(r.status === 'open' || r.status === 'in_progress') && r.retainer_covered && (
                      <button onClick={() => ship(r.id)} className="text-xs text-emerald-600 hover:underline mr-2">Ship</button>
                    )}
                    {r.status === 'open' && !r.retainer_covered && (
                      <button onClick={() => quote(r.id)} className="text-xs text-purple-600 hover:underline">Quote</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </DashboardLayout>
  )
}
