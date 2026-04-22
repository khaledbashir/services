'use client'

import { useEffect, useState } from 'react'

interface PortalPayload {
  portal: {
    view_count: number
    last_viewed_at: string | null
    expires_at: string | null
  }
  venue: {
    id: string
    name: string
    address: string | null
    primary_contact_name: string | null
    primary_contact_email: string | null
  }
  stats: {
    total_displays: number
    displays_with_open_issues: number
    displays_offline: number
    open_tickets: number
  }
  open_tickets: Array<{
    id: string
    ticket_number: number
    title: string
    priority: string
    status: string
    category: string | null
    created_at: string
  }>
  maintenance_logs: Array<{
    id: string
    issue: string | null
    issue_summary: string | null
    status: string
    maintenance_type: string
    reported_date: string | null
    scheduled_date: string | null
    completed_date: string | null
    updated_at: string
    technician_name: string | null
    asset_name: string | null
  }>
}

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function toneForPriority(priority: string) {
  switch (priority) {
    case 'critical':
      return 'bg-red-50 text-red-700 border-red-200'
    case 'high':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    default:
      return 'bg-zinc-100 text-zinc-700 border-zinc-200'
  }
}

export default function PortalPublicClient({ token }: { token: string }) {
  const [data, setData] = useState<PortalPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/portals/token/${token}/data`, { cache: 'no-store' })
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Portal unavailable')
        setData(payload)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Portal unavailable')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [token])

  if (loading) {
    return (
      <main className="min-h-screen bg-[radial-gradient(circle_at_top,#DCEBFF_0%,#F7FAFF_45%,#EEF3FB_100%)] px-6 py-10 text-zinc-900">
        <div className="mx-auto max-w-6xl animate-pulse space-y-6">
          <div className="h-40 rounded-[28px] bg-white/80" />
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-32 rounded-2xl bg-white/80" />
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="h-96 rounded-2xl bg-white/80" />
            <div className="h-96 rounded-2xl bg-white/80" />
          </div>
        </div>
      </main>
    )
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#DCEBFF_0%,#F7FAFF_45%,#EEF3FB_100%)] px-6 py-10">
        <div className="w-full max-w-xl rounded-[28px] border border-zinc-200 bg-white p-10 text-center shadow-[0_24px_80px_-50px_rgba(15,23,42,0.35)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0A52EF]">ANC Client Portal</p>
          <h1 className="mt-3 text-2xl font-semibold text-zinc-950">Portal unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-zinc-500">
            {error || 'This portal link could not be found. It may have been revoked or expired.'}
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#DCEBFF_0%,#F7FAFF_45%,#EEF3FB_100%)] px-6 py-10 text-zinc-900">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-[32px] border border-[#D9E2F2] bg-gradient-to-br from-[#0A52EF] via-[#0A52EF] to-[#083BA8] text-white shadow-[0_30px_80px_-40px_rgba(10,82,239,0.9)]">
          <div className="flex flex-col gap-8 px-7 py-8 lg:flex-row lg:items-end lg:justify-between lg:px-10">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/70">ANC Service Dashboard</p>
              <h1 className="mt-3 text-3xl font-semibold">{data.venue.name}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-blue-100">
                Read-only venue status for your ANC-supported displays, support tickets, and recent maintenance activity.
              </p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-sm text-blue-100 backdrop-blur">
              <p>{data.venue.primary_contact_name || 'ANC client contact'}</p>
              <p className="mt-1">{data.venue.primary_contact_email || 'No contact email on file'}</p>
              <p className="mt-3 text-xs text-blue-200">{data.venue.address || 'Address not available'}</p>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Total Displays', value: data.stats.total_displays, tone: 'from-[#0A52EF]/10 to-[#0A52EF]/0 text-[#0A52EF]' },
            { label: 'Displays With Open Issues', value: data.stats.displays_with_open_issues, tone: 'from-amber-100 to-white text-amber-700' },
            { label: 'Displays Offline', value: data.stats.displays_offline, tone: 'from-red-100 to-white text-red-700' },
            { label: 'Open Tickets', value: data.stats.open_tickets, tone: 'from-zinc-100 to-white text-zinc-800' },
          ].map((card) => (
            <article key={card.label} className={`rounded-2xl border border-zinc-200 bg-gradient-to-br ${card.tone} p-5 shadow-sm`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{card.label}</p>
              <p className="mt-4 text-4xl font-semibold">{card.value}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <article className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 px-6 py-5">
              <h2 className="text-lg font-semibold text-zinc-950">Open Tickets</h2>
              <p className="mt-1 text-sm text-zinc-500">The 10 most recent active tickets for this venue.</p>
            </div>
            {data.open_tickets.length === 0 ? (
              <div className="px-6 py-14 text-center text-sm text-zinc-500">No open tickets right now.</div>
            ) : (
              <div className="divide-y divide-zinc-200">
                {data.open_tickets.map((ticket) => (
                  <div key={ticket.id} className="px-6 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0A52EF]">#{ticket.ticket_number}</span>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${toneForPriority(ticket.priority)}`}>
                            {ticket.priority}
                          </span>
                        </div>
                        <h3 className="mt-2 text-sm font-semibold text-zinc-950">{ticket.title}</h3>
                        <p className="mt-2 text-xs text-zinc-500">
                          {ticket.status.replace(/_/g, ' ')} • {ticket.category || 'general'} • Opened {formatDate(ticket.created_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>

          <article className="rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="border-b border-zinc-200 px-6 py-5">
              <h2 className="text-lg font-semibold text-zinc-950">Maintenance Summary</h2>
              <p className="mt-1 text-sm text-zinc-500">Last 10 maintenance records tied to this venue.</p>
            </div>
            {data.maintenance_logs.length === 0 ? (
              <div className="px-6 py-14 text-center text-sm text-zinc-500">No maintenance activity logged yet.</div>
            ) : (
              <div className="divide-y divide-zinc-200">
                {data.maintenance_logs.map((log) => (
                  <div key={log.id} className="px-6 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-semibold text-zinc-950">{log.issue_summary || log.issue || 'Maintenance log'}</p>
                        <p className="mt-1 text-xs text-zinc-500">
                          {log.asset_name || 'No asset linked'} • {log.technician_name || 'Unassigned'} • Updated {formatDate(log.updated_at)}
                        </p>
                      </div>
                      <span className="inline-flex rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600">
                        {log.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>
      </div>
    </main>
  )
}
