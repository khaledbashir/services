'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Request {
  id: string
  received_at: string
  source: string
  source_url?: string | null
  requester: string | null
  summary: string
  classification: 'FIX' | 'NEW' | 'MIXED'
  project: string | null
  status: string
  retainer_covered: boolean
  estimated_hours: number | null
  quote_amount: number | null
  estimated_usd: number | null
  actual_hours: number | null
  shipped_at: string | null
  inbox?: boolean
}

interface Meter {
  month: string
  hours_used: number
  hours_estimated_open: number
  cap_hours: number
  overage_hours: number
}

const PROJECT_LABEL: Record<string, string> = {
  'service-dashboard': 'Service Dashboard',
  'proposal-engine': 'Proposal Engine',
  'crm': 'CRM',
  'kb': 'Knowledge Base',
  'mirror-mode': 'Mirror Mode',
  'anything-llm': 'AI Assistant',
  'internal': 'Internal',
}

function ageInHours(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
}

function ageDays(iso: string): number {
  return Math.floor(ageInHours(iso) / 24)
}

function fmtAge(iso: string): string {
  const h = ageInHours(iso)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function fmtUSD(n: number | null | undefined): string {
  if (!n) return ''
  if (n >= 1000) return `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}k`
  return `$${Math.round(n)}`
}

export default function InboxPage() {
  const [meter, setMeter] = useState<Meter | null>(null)
  const [inbox, setInbox] = useState<Request[]>([])
  const [stakeholder, setStakeholder] = useState<Request[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    setLoading(true)
    const [stakeholderRes, inboxRes] = await Promise.all([
      fetch('/api/service-triage?limit=300').then(r => r.json()),
      fetch('/api/service-triage?inbox=true&limit=200').then(r => r.json()),
    ])
    setStakeholder(stakeholderRes.requests || [])
    setMeter(stakeholderRes.meter || null)
    setInbox(inboxRes.requests || [])
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const inboxCount = inbox.length
  const oldestInbox = inbox[inbox.length - 1]

  const stale = stakeholder.filter(r => {
    if (r.inbox) return false
    if (r.source === 'auto-push') return false
    const ageH = ageInHours(r.received_at)
    if (r.status === 'open' && ageH >= 24 * 3) return true
    if (r.status === 'quoted' && ageH >= 24 * 7) return true
    if (r.status === 'in_progress' && ageH >= 24 * 5) return true
    if (r.status === 'shipped' && r.classification !== 'FIX' && ageH >= 24 * 14) return true
    return false
  }).sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime())

  const pendingApproval = stakeholder.filter(r =>
    !r.inbox && r.status === 'quoted' && r.source !== 'auto-push'
  ).sort((a, b) => new Date(a.received_at).getTime() - new Date(b.received_at).getTime())

  const shippedYesterday = stakeholder.filter(r => {
    if (!r.shipped_at) return false
    const ageH = ageInHours(r.shipped_at)
    return ageH < 36 && r.source !== 'auto-push'
  }).sort((a, b) => new Date(b.shipped_at!).getTime() - new Date(a.shipped_at!).getTime())

  const meterPct = meter ? Math.min(100, Math.round((meter.hours_used / meter.cap_hours) * 100)) : 0
  const meterTone = meterPct >= 100 ? 'bg-red-500' : meterPct >= 75 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6">
          <div className="text-xs uppercase tracking-widest text-gray-500 mb-1">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Morning brief</h1>
          <p className="text-sm text-gray-500 mt-1">
            What landed overnight, what&apos;s gone stale, what&apos;s waiting on someone else.
          </p>
        </div>

        {meter && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm mb-4">
            <div className="flex items-baseline justify-between mb-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Service contract · {meter.month}</div>
                <div className="text-3xl font-bold tabular-nums mt-0.5">
                  {meter.hours_used.toFixed(1)}
                  <span className="text-sm font-normal text-gray-500 ml-1">/ {meter.cap_hours} hrs</span>
                </div>
              </div>
              <div className="text-right">
                <Link href="/transparency" className="text-xs text-blue-600 hover:underline">View transparency →</Link>
              </div>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div className={`h-full ${meterTone} transition-all`} style={{ width: `${meterPct}%` }} />
            </div>
          </div>
        )}

        {/* Inbox */}
        <Section
          title="Inbox"
          count={inboxCount}
          tone={inboxCount > 0 ? 'orange' : 'neutral'}
          subtitle={
            inboxCount === 0
              ? 'Nothing captured overnight.'
              : `${inboxCount} captured candidate${inboxCount === 1 ? '' : 's'}${oldestInbox ? ` · oldest ${fmtAge(oldestInbox.received_at)}` : ''}`
          }
          cta={inboxCount > 0 ? { href: '/service-log/change-orders?tab=inbox', label: 'Review inbox →' } : null}
        >
          {inbox.slice(0, 5).map(r => <RequestRow key={r.id} r={r} />)}
        </Section>

        {/* Stale */}
        <Section
          title="Stale"
          count={stale.length}
          tone={stale.length > 0 ? 'red' : 'neutral'}
          subtitle={
            stale.length === 0
              ? 'All active boards are within their windows.'
              : `${stale.length} item${stale.length === 1 ? '' : 's'} sitting too long.`
          }
          cta={stale.length > 0 ? { href: '/service-log/change-orders', label: 'Open boards →' } : null}
        >
          {stale.slice(0, 5).map(r => <RequestRow key={r.id} r={r} showAge />)}
        </Section>

        {/* Pending approval */}
        <Section
          title="Pending approval"
          count={pendingApproval.length}
          tone="amber"
          subtitle={
            pendingApproval.length === 0
              ? 'No quotes waiting on stakeholder approval.'
              : `${pendingApproval.length} quote${pendingApproval.length === 1 ? '' : 's'} sent · waiting on stakeholder.`
          }
          cta={pendingApproval.length > 0 ? { href: '/service-log/change-orders', label: 'View change orders →' } : null}
        >
          {pendingApproval.slice(0, 5).map(r => <RequestRow key={r.id} r={r} showQuote />)}
        </Section>

        {/* Shipped recently */}
        <Section
          title="Shipped in the last 36 hrs"
          count={shippedYesterday.length}
          tone="emerald"
          subtitle={
            shippedYesterday.length === 0
              ? 'Nothing shipped recently.'
              : `${shippedYesterday.length} item${shippedYesterday.length === 1 ? '' : 's'} delivered.`
          }
        >
          {shippedYesterday.slice(0, 5).map(r => <RequestRow key={r.id} r={r} showHours />)}
        </Section>

        {loading && (
          <div className="text-sm text-gray-400 text-center py-8">Loading…</div>
        )}
    </div>
  )
}

function Section({
  title, count, tone, subtitle, cta, children,
}: {
  title: string
  count: number
  tone: 'orange' | 'red' | 'amber' | 'emerald' | 'neutral'
  subtitle: string
  cta?: { href: string; label: string } | null
  children: React.ReactNode
}) {
  const toneMap: Record<string, { dot: string; ring: string }> = {
    orange:  { dot: 'bg-orange-500',  ring: 'ring-orange-100' },
    red:     { dot: 'bg-rose-500',    ring: 'ring-rose-100' },
    amber:   { dot: 'bg-amber-500',   ring: 'ring-amber-100' },
    emerald: { dot: 'bg-emerald-500', ring: 'ring-emerald-100' },
    neutral: { dot: 'bg-zinc-300',    ring: 'ring-zinc-100' },
  }
  const t = toneMap[tone]
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm mb-4 ring-2 ${t.ring}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${t.dot}`} />
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {count > 0 && <span className="px-1.5 py-0.5 text-[10px] font-bold tabular-nums bg-gray-100 text-gray-700 rounded">{count}</span>}
        </div>
        {cta && (
          <Link href={cta.href} className="text-xs text-blue-600 hover:underline whitespace-nowrap">
            {cta.label}
          </Link>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-3">{subtitle}</p>
      {count > 0 && <div className="space-y-1.5">{children}</div>}
    </section>
  )
}

function RequestRow({ r, showAge, showQuote, showHours }: { r: Request; showAge?: boolean; showQuote?: boolean; showHours?: boolean }) {
  const usd = r.quote_amount || r.estimated_usd
  const projectLabel = r.project ? (PROJECT_LABEL[r.project] || r.project) : null
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-gray-900 line-clamp-1">{r.summary}</div>
        <div className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5">
          <span>{r.requester || 'unknown'}</span>
          {projectLabel && <><span>·</span><span>{projectLabel}</span></>}
          {showAge && <><span>·</span><span className={ageDays(r.received_at) >= 7 ? 'text-rose-600 font-semibold' : ''}>{fmtAge(r.received_at)}</span></>}
          {!showAge && <><span>·</span><span>{fmtAge(r.received_at)}</span></>}
        </div>
      </div>
      <div className="text-right text-xs text-gray-500 flex-shrink-0 tabular-nums">
        {showQuote && usd ? fmtUSD(usd) : null}
        {showHours && r.actual_hours != null ? `${r.actual_hours}h` : null}
      </div>
    </div>
  )
}
