import Link from 'next/link'
import {
  Activity,
  ArrowRight,
  Brain,
  CalendarDays,
  CheckCircle2,
  FileText,
  MonitorUp,
  Sparkles,
  Ticket,
  TrendingUp,
  Wrench,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

const DEFAULT_VENUE_ID = 'd950d5cb-327a-4bbb-bcbf-c96da448e6c3'

type PageProps = {
  searchParams?: {
    venue_id?: string
  }
}

type Venue = {
  id: string
  name: string
  market: string | null
  venue_type: string | null
  address: string | null
  logo_url: string | null
  cover_image_url: string | null
  timezone: string
}

type StatRow = {
  tickets_total: string
  open_tickets: string
  closed_tickets: string
  high_priority_open: string
  events_total: string
  events_next_30: string
  event_workflows_ready: string
  design_requests_total: string
  design_requests_open: string
  maintenance_total: string
  screens_total: string
  documents_total: string
}

type ActivityRow = {
  kind: string
  title: string
  status: string | null
  happened_at: string
}

type EventRow = {
  id: string
  summary: string
  event_date: string
  event_type: string | null
  workflow_status: string
}

type DesignRow = {
  id: string
  job_title: string
  status: string
  due_date: string | null
}

type RankedVenue = {
  id: string
  name: string
  score: string
  tickets: string
  events: string
  design_requests: string
}

function n(value: string | number | null | undefined) {
  return Number(value || 0)
}

function fmtDate(value: string | null | undefined) {
  if (!value) return 'Not set'
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function statusLabel(value: string | null | undefined) {
  return (value || 'not set').replace(/_/g, ' ')
}

function pct(part: number, total: number) {
  if (!total) return 100
  return Math.round((part / total) * 100)
}

async function loadVenueId(requested?: string) {
  if (requested) {
    const found = await query('SELECT id FROM venues WHERE id = $1 LIMIT 1', [requested])
    if (found.rows[0]?.id) return found.rows[0].id as string
  }
  return DEFAULT_VENUE_ID
}

async function loadPageData(venueId: string) {
  const [
    venueRes,
    statsRes,
    activityRes,
    eventsRes,
    designsRes,
    rankedRes,
  ] = await Promise.all([
    query(
      `SELECT v.id, v.name, m.name AS market, v.venue_type, v.address, v.logo_url, v.cover_image_url, v.timezone
       FROM venues v
       LEFT JOIN markets m ON m.id = v.market_id
       WHERE v.id = $1`,
      [venueId],
    ),
    query(
      `SELECT
        (SELECT COUNT(*) FROM tickets WHERE venue_id = $1) AS tickets_total,
        (SELECT COUNT(*) FROM tickets WHERE venue_id = $1 AND status NOT IN ('closed')) AS open_tickets,
        (SELECT COUNT(*) FROM tickets WHERE venue_id = $1 AND status = 'closed') AS closed_tickets,
        (SELECT COUNT(*) FROM tickets WHERE venue_id = $1 AND status NOT IN ('closed') AND priority IN ('high','critical')) AS high_priority_open,
        (SELECT COUNT(*) FROM events WHERE venue_id = $1) AS events_total,
        (SELECT COUNT(*) FROM events WHERE venue_id = $1 AND event_date >= CURRENT_DATE AND event_date < CURRENT_DATE + INTERVAL '30 days') AS events_next_30,
        (SELECT COUNT(*) FROM events WHERE venue_id = $1 AND event_date >= CURRENT_DATE AND event_date < CURRENT_DATE + INTERVAL '30 days' AND workflow_status IN ('game_ready','post_game_submitted')) AS event_workflows_ready,
        (SELECT COUNT(*) FROM design_requests WHERE venue_id = $1 AND deleted_at IS NULL) AS design_requests_total,
        (SELECT COUNT(*) FROM design_requests WHERE venue_id = $1 AND deleted_at IS NULL AND status NOT IN ('done','cancelled','archived')) AS design_requests_open,
        (SELECT COUNT(*) FROM maintenance_logs WHERE venue_id = $1) AS maintenance_total,
        (SELECT COUNT(*) FROM venue_screens WHERE venue_id = $1) AS screens_total,
        (SELECT COUNT(*) FROM venue_documents WHERE venue_id = $1) AS documents_total`,
      [venueId],
    ),
    query(
      `SELECT * FROM (
        SELECT 'Ticket' AS kind, title, status, COALESCE(updated_at, created_at) AS happened_at
        FROM tickets WHERE venue_id = $1
        UNION ALL
        SELECT 'Event' AS kind, summary AS title, workflow_status AS status, start_time AS happened_at
        FROM events WHERE venue_id = $1
        UNION ALL
        SELECT 'Creative' AS kind, job_title AS title, status, COALESCE(updated_at, created_at) AS happened_at
        FROM design_requests WHERE venue_id = $1 AND deleted_at IS NULL
        UNION ALL
        SELECT 'Service' AS kind, COALESCE(issue_summary, issue, 'Maintenance activity') AS title, status, COALESCE(updated_at, created_at) AS happened_at
        FROM maintenance_logs WHERE venue_id = $1
      ) activity
      ORDER BY happened_at DESC
      LIMIT 9`,
      [venueId],
    ),
    query(
      `SELECT id, summary, event_date, event_type, workflow_status
       FROM events
       WHERE venue_id = $1 AND event_date >= CURRENT_DATE
       ORDER BY event_date ASC
       LIMIT 6`,
      [venueId],
    ),
    query(
      `SELECT id, job_title, status, due_date
       FROM design_requests
       WHERE venue_id = $1 AND deleted_at IS NULL
       ORDER BY COALESCE(updated_at, created_at) DESC
       LIMIT 6`,
      [venueId],
    ),
    query(
      `WITH rollup AS (
        SELECT v.id, v.name,
          COALESCE(t.tickets, 0) AS tickets,
          COALESCE(e.events, 0) AS events,
          COALESCE(dr.design_requests, 0) AS design_requests,
          (COALESCE(t.tickets, 0) * 5 + COALESCE(e.events, 0) * 2 + COALESCE(dr.design_requests, 0)) AS score
        FROM venues v
        LEFT JOIN (
          SELECT venue_id, COUNT(*) AS tickets
          FROM tickets
          GROUP BY venue_id
        ) t ON t.venue_id = v.id
        LEFT JOIN (
          SELECT venue_id, COUNT(*) AS events
          FROM events
          GROUP BY venue_id
        ) e ON e.venue_id = v.id
        LEFT JOIN (
          SELECT venue_id, COUNT(*) AS design_requests
          FROM design_requests
          WHERE deleted_at IS NULL
          GROUP BY venue_id
        ) dr ON dr.venue_id = v.id
        WHERE v.is_active = TRUE
      )
      SELECT id, name, score, tickets, events, design_requests
      FROM rollup
      ORDER BY score DESC
      LIMIT 8`,
    ),
  ])

  return {
    venue: venueRes.rows[0] as Venue,
    stats: statsRes.rows[0] as StatRow,
    activity: activityRes.rows as ActivityRow[],
    events: eventsRes.rows as EventRow[],
    designs: designsRes.rows as DesignRow[],
    rankedVenues: rankedRes.rows as RankedVenue[],
  }
}

function MetricCard({
  label,
  value,
  detail,
  tone = 'blue',
}: {
  label: string
  value: string | number
  detail: string
  tone?: 'blue' | 'green' | 'amber' | 'dark'
}) {
  const tones = {
    blue: 'border-[#0A52EF]/20 bg-[#0A52EF]/5 text-[#0A52EF]',
    green: 'border-emerald-500/20 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-500/25 bg-amber-50 text-amber-700',
    dark: 'border-zinc-200 bg-white text-zinc-950',
  }
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${tones[tone]}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">{label}</p>
      <p className="mt-3 text-3xl font-black tracking-tight">{value}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p>
    </div>
  )
}

function InsightCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.055] p-4 text-white shadow-[0_22px_70px_-45px_rgba(10,82,239,0.8)]">
      <div className="flex items-center gap-2 text-[#03B8FF]">
        {icon}
        <h3 className="text-sm font-black uppercase tracking-[0.04em] text-white">{title}</h3>
      </div>
      <p className="mt-3 text-sm leading-6 text-white/70">{body}</p>
    </div>
  )
}

export default async function VenueIntelligencePage({ searchParams }: PageProps) {
  const venueId = await loadVenueId(searchParams?.venue_id)
  const { venue, stats, activity, events, designs, rankedVenues } = await loadPageData(venueId)

  const totalTickets = n(stats.tickets_total)
  const closedTickets = n(stats.closed_tickets)
  const openTickets = n(stats.open_tickets)
  const nextEvents = n(stats.events_next_30)
  const readyEvents = n(stats.event_workflows_ready)
  const serviceProof = pct(closedTickets, totalTickets)
  const readiness = pct(readyEvents, nextEvents)
  const designOpen = n(stats.design_requests_open)
  const screens = n(stats.screens_total)
  const documents = n(stats.documents_total)

  const qbrNarrative = [
    `${venue.name} has ${totalTickets} service ticket${totalTickets === 1 ? '' : 's'} tracked in the dashboard, with ${closedTickets} closed.`,
    `${nextEvents} upcoming event${nextEvents === 1 ? '' : 's'} are visible in the next 30 days.`,
    `${n(stats.design_requests_total)} creative/design request${n(stats.design_requests_total) === 1 ? '' : 's'} are tied to the venue, creating a bridge from operations to sponsor-facing output.`,
  ]

  return (
    <DashboardLayout>
      <main className="min-h-screen bg-[#f6f8fb] text-zinc-950">
        <section className="overflow-hidden rounded-xl bg-[#02050b] text-white shadow-[0_30px_90px_-55px_rgba(10,82,239,0.9)]">
          <div className="relative px-6 py-7 lg:px-8 lg:py-9">
            <div className="absolute inset-0 opacity-70">
              <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#0A52EF]/25 blur-3xl" />
              <div className="absolute bottom-0 left-1/3 h-44 w-80 rounded-full bg-[#03B8FF]/10 blur-3xl" />
              <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#03B8FF]/60 to-transparent" />
            </div>

            <div className="relative z-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
              <div>
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-lg bg-[#0A52EF]">
                    <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-6 w-auto" />
                  </span>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#03B8FF]">Venue Intelligence Pilot</p>
                    <h1 className="mt-1 text-3xl font-black tracking-tight lg:text-5xl">{venue.name}</h1>
                  </div>
                </div>
                <p className="mt-5 max-w-3xl text-base leading-7 text-white/68">
                  A venue-facing ANC operating layer: service proof, event readiness, creative activity, client reporting, and an AI workspace for the digital environment ANC supports.
                </p>
                <div className="mt-6 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/70">
                  <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">{venue.market || 'Market not set'}</span>
                  <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">{venue.venue_type || 'Venue'}</span>
                  <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5">{venue.timezone}</span>
                </div>
              </div>

              <div className="rounded-lg border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/45">Pilot thesis</p>
                <p className="mt-3 text-sm leading-6 text-white/72">
                  Start with a service-led venue workspace Joe can stand behind, then add sponsor/media intelligence for Jireh once the client-facing proof layer is clear.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Link href="/customer" className="rounded-md bg-white px-3 py-2 text-center text-xs font-bold text-zinc-950 transition hover:bg-[#EAF2FF]">
                    Customer shell
                  </Link>
                  <Link href="/venue-vision" className="rounded-md border border-white/15 px-3 py-2 text-center text-xs font-bold text-white transition hover:bg-white/10">
                    Venue Vision
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="Service proof" value={`${serviceProof}%`} detail={`${closedTickets} of ${totalTickets} tracked tickets closed`} tone={openTickets > 0 ? 'amber' : 'green'} />
          <MetricCard label="Open risk" value={openTickets} detail={`${n(stats.high_priority_open)} high-priority open item${n(stats.high_priority_open) === 1 ? '' : 's'}`} tone={openTickets > 0 ? 'amber' : 'green'} />
          <MetricCard label="30-day readiness" value={`${readiness}%`} detail={`${readyEvents} of ${nextEvents || 0} upcoming workflows marked ready`} tone={nextEvents > 0 && readiness < 60 ? 'amber' : 'blue'} />
          <MetricCard label="Creative demand" value={designOpen} detail={`${n(stats.design_requests_total)} design requests connected to this venue`} tone="dark" />
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#0A52EF]">Executive readout</p>
                  <h2 className="mt-1 text-xl font-black text-zinc-950">What ANC can show the venue</h2>
                </div>
                <Link href="/reports" className="inline-flex items-center gap-2 rounded-md bg-[#0A52EF] px-3 py-2 text-xs font-bold text-white transition hover:bg-[#0840C0]">
                  Build QBR report <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="mt-5 grid gap-3">
                {qbrNarrative.map((item) => (
                  <div key={item} className="flex gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#0A52EF]" />
                    <p className="text-sm leading-6 text-zinc-600">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-[#0A52EF]" />
                  <h2 className="text-lg font-black text-zinc-950">Upcoming event readiness</h2>
                </div>
                <div className="mt-4 divide-y divide-zinc-100">
                  {events.length === 0 ? (
                    <p className="py-8 text-sm text-zinc-500">No upcoming events visible for this venue.</p>
                  ) : events.map((event) => (
                    <div key={event.id} className="py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-zinc-950">{event.summary}</p>
                          <p className="mt-1 text-xs text-zinc-500">{fmtDate(event.event_date)} · {event.event_type || 'event'}</p>
                        </div>
                        <span className="rounded-full bg-[#0A52EF]/8 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#0A52EF]">
                          {statusLabel(event.workflow_status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-[#0A52EF]" />
                  <h2 className="text-lg font-black text-zinc-950">Sponsor/creative signal</h2>
                </div>
                <div className="mt-4 divide-y divide-zinc-100">
                  {designs.length === 0 ? (
                    <p className="py-8 text-sm text-zinc-500">No creative activity visible for this venue.</p>
                  ) : designs.map((design) => (
                    <div key={design.id} className="py-3">
                      <p className="text-sm font-semibold text-zinc-950">{design.job_title}</p>
                      <p className="mt-1 text-xs text-zinc-500">{statusLabel(design.status)} · due {fmtDate(design.due_date)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-[#0A52EF]" />
                <h2 className="text-lg font-black text-zinc-950">Live activity stream</h2>
              </div>
              <div className="mt-4 grid gap-2">
                {activity.map((item) => (
                  <div key={`${item.kind}-${item.title}-${item.happened_at}`} className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-[96px_minmax(0,1fr)_110px] md:items-center">
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#0A52EF]">{item.kind}</span>
                    <span className="truncate text-sm font-semibold text-zinc-800">{item.title}</span>
                    <span className="text-xs text-zinc-500 md:text-right">{fmtDate(item.happened_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="rounded-xl bg-[#02050b] p-5 text-white shadow-[0_24px_80px_-50px_rgba(10,82,239,0.9)]">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#03B8FF]">AI employee layer</p>
              <h2 className="mt-2 text-xl font-black">What the venue can ask</h2>
              <div className="mt-4 grid gap-3">
                <InsightCard icon={<Brain className="h-4 w-4" />} title="Ops AI" body={`What needs attention at ${venue.name} before the next event?`} />
                <InsightCard icon={<Wrench className="h-4 w-4" />} title="Service AI" body="Summarize what ANC fixed this month and what is still open." />
                <InsightCard icon={<TrendingUp className="h-4 w-4" />} title="Revenue AI" body="Turn upcoming event and creative activity into sponsor-ready talking points." />
                <InsightCard icon={<FileText className="h-4 w-4" />} title="QBR AI" body="Create an executive recap from service, event, and creative data." />
              </div>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#0A52EF]">Data coverage</p>
              <div className="mt-4 space-y-3">
                {[
                  { icon: <Ticket className="h-4 w-4" />, label: 'Service tickets', value: totalTickets, ready: totalTickets > 0 },
                  { icon: <CalendarDays className="h-4 w-4" />, label: 'Events', value: n(stats.events_total), ready: n(stats.events_total) > 0 },
                  { icon: <Sparkles className="h-4 w-4" />, label: 'Creative requests', value: n(stats.design_requests_total), ready: n(stats.design_requests_total) > 0 },
                  { icon: <MonitorUp className="h-4 w-4" />, label: 'Display registry', value: screens, ready: screens > 0 },
                  { icon: <FileText className="h-4 w-4" />, label: 'Shared documents', value: documents, ready: documents > 0 },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800">
                      <span className={row.ready ? 'text-[#0A52EF]' : 'text-zinc-400'}>{row.icon}</span>
                      {row.label}
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${row.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-zinc-500">
                This pilot is intentionally honest: the service/event/design layer is usable now. Display inventory and document depth need enrichment before a full venue-facing rollout.
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#0A52EF]">Best demo venues</p>
              <div className="mt-4 grid gap-2">
                {rankedVenues.map((item) => (
                  <Link
                    key={item.id}
                    href={`/venue-intelligence?venue_id=${item.id}`}
                    className={`rounded-lg border p-3 transition ${item.id === venue.id ? 'border-[#0A52EF] bg-[#0A52EF]/5' : 'border-zinc-200 bg-zinc-50 hover:border-[#0A52EF]/35 hover:bg-white'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="truncate text-sm font-bold text-zinc-950">{item.name}</span>
                      <span className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-400">score {n(item.score)}</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">{n(item.tickets)} tickets · {n(item.events)} events · {n(item.design_requests)} creative</p>
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        </section>
      </main>
    </DashboardLayout>
  )
}
