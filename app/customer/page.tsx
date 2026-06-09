'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import CopilotPanel from './CopilotPanel'

interface Ticket {
  id: string
  ticket_number: number
  title: string
  priority: string
  status: string
  category: string | null
  created_at: string
  updated_at: string
  venue_name: string
  comment_count: number
}

interface Venue { id: string; name: string }

function ledClass(status: string) {
  if (status === 'new' || status === 'open') return 'is-open'
  if (status === 'in_progress') return 'is-work'
  if (status === 'waiting' || status === 'on_hold' || status === 'pending') return 'is-wait'
  if (status === 'resolved') return 'is-done'
  return 'is-closed'
}

function statusColor(status: string) {
  if (status === 'new' || status === 'open') return 'var(--cp-blue-bright)'
  if (status === 'in_progress') return 'var(--cp-amber)'
  if (status === 'waiting' || status === 'on_hold' || status === 'pending') return 'var(--cp-violet)'
  if (status === 'resolved') return 'var(--cp-green)'
  return 'var(--cp-dim)'
}

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function CustomerDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<{ fullName: string; clientName: string | null } | null>(null)
  const [venues, setVenues] = useState<Venue[]>([])
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [stats, setStats] = useState({ open: 0, closed: 0, total: 0 })
  const [tab, setTab] = useState<'open' | 'closed' | 'all'>('open')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  const [ntVenue, setNtVenue] = useState('')
  const [ntTitle, setNtTitle] = useState('')
  const [ntDesc, setNtDesc] = useState('')
  const [ntPriority, setNtPriority] = useState('medium')
  const [ntSubmitting, setNtSubmitting] = useState(false)
  const [ntError, setNtError] = useState('')

  useEffect(() => {
    fetch('/api/customer/me')
      .then(res => {
        if (res.status === 401) { router.push('/customer/login'); return null }
        return res.json()
      })
      .then(data => {
        if (!data) return
        setUser(data.user)
        setVenues(data.venues)
        if (data.venues.length === 1) setNtVenue(data.venues[0].id)
      })
      .catch(() => router.push('/customer/login'))
  }, [router])

  const loadTickets = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ status: tab })
      if (search) params.set('q', search)
      const res = await fetch(`/api/customer/tickets?${params}`)
      if (res.status === 401) { router.push('/customer/login'); return }
      const data = await res.json()
      setTickets(data.tickets || [])
      setStats(data.stats || { open: 0, closed: 0, total: 0 })
    } finally {
      setLoading(false)
    }
  }, [tab, search, router])

  useEffect(() => {
    const t = setTimeout(loadTickets, search ? 300 : 0)
    return () => clearTimeout(t)
  }, [loadTickets, search])

  async function submitTicket(e: React.FormEvent) {
    e.preventDefault()
    setNtError('')
    setNtSubmitting(true)
    try {
      const res = await fetch('/api/customer/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ venue_id: ntVenue, title: ntTitle, description: ntDesc, priority: ntPriority }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setNtError(data.error || 'Could not submit request'); return }
      setShowNew(false)
      setNtTitle(''); setNtDesc(''); setNtPriority('medium')
      setTab('open')
      loadTickets()
    } finally {
      setNtSubmitting(false)
    }
  }

  async function logout() {
    await fetch('/api/customer/auth/logout', { method: 'POST' })
    router.push('/customer/login')
  }

  return (
    <div className="min-h-screen">
      <header className="cp-header">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-7" />
            <div className="hidden sm:block" style={{ width: 1, height: 28, background: 'var(--cp-line-strong)' }} />
            <div>
              <div className="cp-header-tag">Customer Portal</div>
              {user?.clientName && (
                <div className="cp-display text-base font-semibold leading-tight mt-0.5">{user.clientName}</div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <span className="cp-mono text-xs hidden sm:inline" style={{ color: 'var(--cp-muted)' }}>
                {user.fullName}
              </span>
            )}
            <button onClick={logout} className="cp-btn-ghost">Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-5 py-10">
        <div className="grid grid-cols-3 gap-4 mb-10 cp-stagger">
          <div className="cp-panel p-5">
            <div className="cp-stat-value is-blue">{stats.open}</div>
            <div className="cp-stat-label mt-3">Open requests</div>
          </div>
          <div className="cp-panel p-5">
            <div className="cp-stat-value is-green">{stats.closed}</div>
            <div className="cp-stat-label mt-3">Resolved</div>
          </div>
          <div className="cp-panel p-5">
            <div className="cp-stat-value">{stats.total}</div>
            <div className="cp-stat-label mt-3">All time</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-5">
          <div className="flex" style={{ borderBottom: '1px solid var(--cp-line)' }}>
            {(['open', 'closed', 'all'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)} className={`cp-tab ${tab === t ? 'is-active' : ''}`}>
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="cp-input"
              style={{ width: 220, padding: '9px 14px' }}
            />
            <button onClick={() => setShowNew(true)} className="cp-btn whitespace-nowrap" style={{ padding: '9px 20px' }}>
              + New request
            </button>
          </div>
        </div>

        <div className="cp-panel overflow-hidden">
          {loading ? (
            <div className="p-12 text-center cp-mono text-sm" style={{ color: 'var(--cp-dim)' }}>Loading…</div>
          ) : tickets.length === 0 ? (
            <div className="p-12 text-center">
              <div className="cp-mono text-sm" style={{ color: 'var(--cp-dim)' }}>No {tab !== 'all' ? tab : ''} requests yet</div>
            </div>
          ) : (
            <div className="cp-stagger">
              {tickets.map(t => (
                <Link key={t.id} href={`/customer/tickets/${t.id}`} className="cp-row">
                  <div className="flex items-center gap-4">
                    <span className={`cp-led ${ledClass(t.status)}`} />
                    <span className="cp-mono text-xs" style={{ color: 'var(--cp-dim)' }}>
                      #{String(t.ticket_number).padStart(8, '0')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{t.title}</div>
                      <div className="cp-mono mt-1" style={{ fontSize: 11, color: 'var(--cp-dim)' }}>
                        {t.venue_name} · {fmtDate(t.created_at)}
                        {t.comment_count > 0 && ` · ${t.comment_count} ${t.comment_count === 1 ? 'reply' : 'replies'}`}
                      </div>
                    </div>
                    <span className={`cp-chip p-${['urgent','high','medium','low'].includes(t.priority) ? t.priority : 'low'}`}>
                      {t.priority}
                    </span>
                    <span className="cp-status-text hidden sm:inline" style={{ color: statusColor(t.status), minWidth: 96, textAlign: 'right' }}>
                      {t.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>

      {showNew && (
        <div className="cp-overlay" onClick={() => setShowNew(false)}>
          <form onSubmit={submitTicket} onClick={e => e.stopPropagation()} className="cp-modal cp-panel p-7 space-y-5">
            <div>
              <div className="cp-header-tag mb-2">New Service Request</div>
              <h2 className="cp-display text-2xl font-bold">Report an issue</h2>
            </div>
            <div>
              <label className="cp-label">Venue</label>
              <select value={ntVenue} onChange={e => setNtVenue(e.target.value)} required className="cp-input">
                <option value="">Select venue…</option>
                {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
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

      <CopilotPanel onTicketCreated={loadTickets} />
    </div>
  )
}
