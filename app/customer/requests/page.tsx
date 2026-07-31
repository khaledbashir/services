'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import PortalShell, { usePortal } from '../PortalShell'
import { CLIENT_TICKET_CATEGORIES, ticketCategoryLabel } from '@/lib/ticket-categories'

interface Ticket {
  id: string
  ticket_number: number
  title: string
  priority: string
  status: string
  category: string | null
  subcategory: string | null
  created_at: string
  updated_at: string
  venue_name: string
  comment_count: number
}

function ledClass(status: string) {
  if (status === 'new' || status === 'open') return 'is-open'
  if (status === 'in_progress') return 'is-work'
  if (status === 'waiting' || status === 'on_hold' || status === 'pending') return 'is-wait'
  if (status === 'resolved') return 'is-done'
  return 'is-closed'
}

function statusColor(status: string) {
  if (status === 'new' || status === 'open') return 'var(--anc-brand)'
  if (status === 'in_progress') return 'var(--cp-amber)'
  if (status === 'waiting' || status === 'on_hold' || status === 'pending') return 'var(--cp-violet)'
  if (status === 'resolved') return 'var(--cp-green)'
  return 'var(--anc-muted)'
}

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function RequestsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { venues, refreshSignal, selectedVenueId } = usePortal()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [stats, setStats] = useState({ open: 0, closed: 0, total: 0 })
  const [tab, setTab] = useState<'open' | 'closed' | 'all'>('open')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(searchParams.get('new') === '1')

  const [ntVenue, setNtVenue] = useState('')
  const [ntTitle, setNtTitle] = useState('')
  const [ntDesc, setNtDesc] = useState('')
  const [ntCategory, setNtCategory] = useState('')
  const [ntIssue, setNtIssue] = useState('')
  const [ntPriority, setNtPriority] = useState('medium')
  const [ntAttachment, setNtAttachment] = useState<{ data: string; mimeType: string; name: string } | null>(null)
  const [ntSubmitting, setNtSubmitting] = useState(false)
  const [ntError, setNtError] = useState('')

  const availableVenues = selectedVenueId && selectedVenueId !== 'all'
    ? venues.filter((venue) => venue.id === selectedVenueId)
    : venues

  useEffect(() => {
    if (selectedVenueId && selectedVenueId !== 'all') {
      setNtVenue(selectedVenueId)
    } else if (venues.length === 1) {
      setNtVenue(venues[0].id)
    } else if (ntVenue && !venues.some((venue) => venue.id === ntVenue)) {
      setNtVenue('')
    }
  }, [ntVenue, selectedVenueId, venues])

  useEffect(() => {
    const venueParam = searchParams.get('venue')
    const displayParam = searchParams.get('display')
    if (venueParam) setNtVenue(venueParam)
    if (displayParam && !ntTitle) {
      setNtTitle(`Issue with ${displayParam}`)
      setNtDesc(`Display: ${displayParam}\n\nWhat happened:\n`)
    }
  }, [searchParams, ntTitle])

  const loadTickets = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: tab })
      if (search) params.set('q', search)
      if (selectedVenueId && selectedVenueId !== 'all') params.set('venue', selectedVenueId)
      const res = await fetch(`/api/customer/tickets?${params}`)
      if (res.status === 401) { router.push('/customer/login'); return }
      const data = await res.json()
      setTickets(data.tickets || [])
      setStats(data.stats || { open: 0, closed: 0, total: 0 })
    } finally {
      setLoading(false)
    }
  }, [tab, search, router, selectedVenueId])

  useEffect(() => {
    const t = setTimeout(loadTickets, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [loadTickets, search, refreshSignal])

  async function submitTicket(e: React.FormEvent) {
    e.preventDefault()
    setNtError('')
    setNtSubmitting(true)
    try {
      const res = await fetch('/api/customer/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: ntVenue, title: ntTitle, description: ntDesc, category: ntCategory, subcategory: ntIssue || null, priority: ntPriority, attachment: ntAttachment }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setNtError(data.error || 'Could not submit request'); return }
      setShowNew(false)
      setNtTitle(''); setNtDesc(''); setNtCategory(''); setNtIssue(''); setNtPriority('medium'); setNtAttachment(null)
      setTab('open')
      loadTickets()
    } finally {
      setNtSubmitting(false)
    }
  }

  async function readAttachment(file: File) {
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
    setNtAttachment({ data, mimeType: file.type || 'application/octet-stream', name: file.name })
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="cp-page-title">Service requests</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--anc-muted)' }}>
            {stats.open} open · {stats.closed} resolved · {stats.total} all time
          </p>
        </div>
        <button onClick={() => setShowNew(true)} className="cp-btn whitespace-nowrap">+ New request</button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-5">
        <div className="flex" style={{ borderBottom: '1px solid var(--anc-border)' }}>
          {(['open', 'closed', 'all'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`cp-tab ${tab === t ? 'is-active' : ''}`}>
              {t}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          className="cp-input"
          style={{ width: 240, padding: '9px 14px' }}
        />
      </div>

      <div className="cp-panel overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-sm" style={{ color: 'var(--anc-muted)' }}>Loading…</div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center text-sm" style={{ color: 'var(--anc-muted)' }}>
            No {tab !== 'all' ? tab : ''} requests yet
          </div>
        ) : (
          <div className="cp-stagger">
            {tickets.map(t => (
              <Link key={t.id} href={`/customer/tickets/${t.id}`} className="cp-row">
                <div className="flex items-center gap-4">
                  <span className={`cp-led ${ledClass(t.status)}`} />
                  <span className="cp-mono text-xs" style={{ color: 'var(--anc-muted)' }}>
                    #{String(t.ticket_number).padStart(8, '0')}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{t.title}</div>
                    <div className="text-xs mt-1" style={{ color: 'var(--anc-muted)' }}>
                      {t.venue_name} · {ticketCategoryLabel(t.category)}
                      {t.subcategory ? ` — ${t.subcategory}` : ''} · {fmtDate(t.created_at)}
                      {t.comment_count > 0 && ` · ${t.comment_count} ${t.comment_count === 1 ? 'reply' : 'replies'}`}
                    </div>
                  </div>
                  <span className={`cp-chip p-${['urgent','high','medium','low'].includes(t.priority) ? t.priority : 'low'}`}>
                    {t.priority}
                  </span>
                  <span className="cp-status-text hidden sm:inline" style={{ color: statusColor(t.status), minWidth: 90, textAlign: 'right' }}>
                    {t.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showNew && (
        <div className="cp-overlay" onClick={() => setShowNew(false)}>
          <form onSubmit={submitTicket} onClick={e => e.stopPropagation()} className="cp-modal cp-panel p-7 space-y-5">
            <h2 className="text-lg font-semibold">New service request</h2>
            <div>
              <label className="cp-label">Venue</label>
              <select value={ntVenue} onChange={e => setNtVenue(e.target.value)} required className="cp-input">
                <option value="">Select venue…</option>
                {availableVenues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="cp-label">Category</label>
              <select
                value={ntCategory}
                onChange={e => {
                  const next = e.target.value
                  setNtCategory(next)
                  setNtIssue('')
                  if (next === 'urgent_issue') setNtPriority('urgent')
                }}
                required
                className="cp-input"
              >
                <option value="">Select a category…</option>
                {CLIENT_TICKET_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            {(() => {
              const issues = CLIENT_TICKET_CATEGORIES.find(c => c.value === ntCategory)?.issues || []
              if (!issues.length) return null
              return (
                <div>
                  <label className="cp-label">Specific issue <span style={{ color: 'var(--anc-muted)', fontWeight: 400 }}>(optional)</span></label>
                  <select value={ntIssue} onChange={e => setNtIssue(e.target.value)} className="cp-input">
                    <option value="">Select the closest match…</option>
                    {issues.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
              )
            })()}
            <div>
              <label className="cp-label">Summary</label>
              <input
                value={ntTitle}
                onChange={e => setNtTitle(e.target.value)}
                required
                placeholder="Brief description of the issue"
                className="cp-input"
              />
            </div>
            <div>
              <label className="cp-label">Details</label>
              <textarea
                value={ntDesc}
                onChange={e => setNtDesc(e.target.value)}
                rows={4}
                placeholder="What's happening? Include the display location if relevant."
                className="cp-input"
              />
            </div>
            <div>
              <label className="cp-label">Photo or file</label>
              <input
                type="file"
                className="cp-input"
                accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) void readAttachment(file)
                  else setNtAttachment(null)
                }}
              />
              {ntAttachment && (
                <div className="mt-2 text-xs" style={{ color: 'var(--anc-muted)' }}>
                  Attached: {ntAttachment.name}
                </div>
              )}
            </div>
            <div>
              <label className="cp-label">Priority</label>
              <select value={ntPriority} onChange={e => setNtPriority(e.target.value)} className="cp-input">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            {ntError && <div className="cp-error">{ntError}</div>}
            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={() => setShowNew(false)} className="cp-btn-ghost">Cancel</button>
              <button type="submit" disabled={ntSubmitting} className="cp-btn">
                {ntSubmitting ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

export default function CustomerRequestsPage() {
  return (
    <PortalShell active="Requests">
      <Suspense fallback={null}>
        <RequestsContent />
      </Suspense>
    </PortalShell>
  )
}
