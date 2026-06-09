'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

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

const PRIORITY_STYLES: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-blue-100 text-blue-700',
  low: 'bg-slate-100 text-slate-600',
}

const STATUS_STYLES: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-amber-100 text-amber-700',
  waiting: 'bg-purple-100 text-purple-700',
  on_hold: 'bg-slate-100 text-slate-600',
  resolved: 'bg-green-100 text-green-700',
  closed: 'bg-slate-100 text-slate-500',
}

function fmtDate(value: string) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-600'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  )
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

  // New-ticket form
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
      if (!res.ok) { setNtError(data.error || 'Could not submit ticket'); return }
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
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#1B2A4A] text-white">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-8" />
            <div>
              <div className="font-semibold leading-tight">Customer Portal</div>
              {user?.clientName && <div className="text-xs text-blue-200">{user.clientName}</div>}
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm">
            {user && <span className="text-blue-200 hidden sm:inline">{user.fullName}</span>}
            <button onClick={logout} className="rounded-lg border border-blue-300/40 px-3 py-1.5 hover:bg-white/10 transition">Sign out</button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-3xl font-semibold text-[#0A52EF]">{stats.open}</div>
            <div className="text-sm text-slate-500 mt-1">Open requests</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-3xl font-semibold text-green-600">{stats.closed}</div>
            <div className="text-sm text-slate-500 mt-1">Resolved</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="text-3xl font-semibold text-slate-800">{stats.total}</div>
            <div className="text-sm text-slate-500 mt-1">All time</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex rounded-lg border border-slate-200 bg-white p-1">
            {(['open', 'closed', 'all'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition ${tab === t ? 'bg-[#1B2A4A] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tickets…"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]"
            />
            <button
              onClick={() => setShowNew(true)}
              className="rounded-lg bg-[#0A52EF] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition whitespace-nowrap"
            >
              + New request
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
          {loading ? (
            <div className="p-10 text-center text-slate-400">Loading…</div>
          ) : tickets.length === 0 ? (
            <div className="p-10 text-center text-slate-400">No {tab !== 'all' ? tab : ''} tickets found.</div>
          ) : (
            tickets.map(t => (
              <Link key={t.id} href={`/customer/tickets/${t.id}`} className="block p-4 hover:bg-slate-50 transition">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-slate-400">#{String(t.ticket_number).padStart(8, '0')}</span>
                      <StatusBadge status={t.status} />
                      <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_STYLES[t.priority] || PRIORITY_STYLES.low}`}>
                        {t.priority}
                      </span>
                    </div>
                    <div className="font-medium text-slate-900 mt-1 truncate">{t.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {t.venue_name} · {fmtDate(t.created_at)}
                      {t.comment_count > 0 && ` · ${t.comment_count} ${t.comment_count === 1 ? 'reply' : 'replies'}`}
                    </div>
                  </div>
                  <span className="text-slate-300 mt-2">›</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </main>

      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => setShowNew(false)}>
          <form
            onSubmit={submitTicket}
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4"
          >
            <h2 className="text-lg font-semibold text-slate-900">New service request</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Venue</label>
              <select
                value={ntVenue}
                onChange={e => setNtVenue(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]"
              >
                <option value="">Select venue…</option>
                {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Summary</label>
              <input
                value={ntTitle}
                onChange={e => setNtTitle(e.target.value)}
                required
                placeholder="Brief description of the issue"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Details</label>
              <textarea
                value={ntDesc}
                onChange={e => setNtDesc(e.target.value)}
                rows={4}
                placeholder="What's happening? Include display location if relevant."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Priority</label>
              <select
                value={ntPriority}
                onChange={e => setNtPriority(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            {ntError && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{ntError}</div>}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setShowNew(false)} className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 transition">Cancel</button>
              <button type="submit" disabled={ntSubmitting} className="rounded-lg bg-[#0A52EF] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition">
                {ntSubmitting ? 'Submitting…' : 'Submit request'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
