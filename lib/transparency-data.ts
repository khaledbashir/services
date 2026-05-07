import { query } from '@/lib/db'
import { hoursThisMonth } from '@/lib/service-triage'

// Data layer for the public transparency dashboard.
// Read-only aggregations from `service_requests` plus static contract clauses.

export interface WarrantyItem {
  id: string
  summary: string
  shipped_at: string          // ISO date
  warranty_expires: string    // ISO date (shipped_at + 30 days)
  days_remaining: number
  repo: string | null
  area: string | null
}

export interface CreditMeter {
  month: string
  hours_used: number
  hours_estimated_open: number
  cap_hours: number
  overage_hours: number
  hours_remaining: number      // max(cap_hours - hours_used, 0)
  pct_used: number             // 0..100
}

export interface RecentlyShipped {
  id: string
  summary: string
  shipped_at: string
  actual_hours: number | null
  repo: string | null
}

export interface TriagedRequest {
  id: string
  received_at: string
  requester: string | null
  summary: string
  classification: 'FIX' | 'NEW' | 'MIXED'
  classification_confidence: number | null   // 0..10
  classification_basis: string | null         // why FIX vs NEW vs MIXED
  status: string
  retainer_covered: boolean
  estimated_hours: number | null
  estimate_basis: string | null               // how the hours estimate was derived
  estimated_usd: number | null
  market_breakdown: any | null                // full chain when present (NEW/MIXED only)
  shipped_at: string | null
  actual_hours: number | null
  shipped_commit_sha: string | null
  repo: string | null
  area: string | null
}

export interface CoverageStrip {
  service_contract_hours_used: number    // FIX retainer-covered, shipped this month, sum(actual_hours)
  service_contract_cap: number            // RETAINER_CAP_HOURS
  warranty_active_count: number           // FIX shipped within 30d
  warranty_hours_protected: number        // sum(actual_hours) on those 30d-window FIX ships
  change_order_open_count: number         // NEW + MIXED with status in (open, in_progress, quoted)
  change_order_open_usd: number           // sum(estimated_usd) on those open COs
  change_order_shipped_count: number      // NEW + MIXED shipped this month
  change_order_shipped_usd: number        // sum(estimated_usd) on those (closed COs this month)
  // vs last month (same coverage period — full month or whatever's elapsed in current month)
  prev_service_contract_hours: number
  prev_warranty_active_count: number
  prev_change_order_total_usd: number
  // burndown — daily cumulative hours-used through this month
  burndown_days: Array<{ day: number; hours_cum: number; pace_cum: number }>
}

export interface PlatformBreakdown {
  platform: string
  fixes_shipped: number
  hours_used: number
  active_warranties: number
  open_cos: number
  open_co_usd: number
}

export interface ActivityEvent {
  id: string
  ts: string
  kind: 'triaged' | 'started' | 'quoted' | 'shipped' | 'cancelled'
  classification: 'FIX' | 'NEW' | 'MIXED'
  requester: string | null
  summary: string
  hours: number | null
  usd: number | null
}

export interface MonthStory {
  month_label: string
  days_elapsed: number
  days_total: number
  pct_elapsed: number
  shipped_count: number
  shipped_count_prev: number
  hours_used: number
  open_cos: number
  open_co_usd: number
  active_warranties: number
  pacing_status: 'ahead' | 'on_track' | 'behind' | 'over'
  narrative: string
}

export interface PaymentStatus {
  month: string
  status: 'paid' | 'pending' | 'overdue' | 'invoiced'
  amount: number | null
  paid_at: string | null
  invoice_number: string | null
}

export interface DashboardData {
  meter: CreditMeter
  coverage: CoverageStrip
  story: MonthStory
  platforms: PlatformBreakdown[]
  activity: ActivityEvent[]
  warranty_items: WarrantyItem[]
  recently_shipped: RecentlyShipped[]
  triaged_requests: TriagedRequest[]
  change_order_queue: TriagedRequest[]
  payment: PaymentStatus
  generated_at: string
}

// What the retainer covers — verbatim from the signed contract (2026-04-30).
export const COVERED_CLAUSES: Array<{ title: string; detail: string }> = [
  { title: 'Bug fixes on already-shipped functionality', detail: 'Anything previously delivered that is misbehaving — fixed and re-deployed.' },
  { title: 'Platform uptime', detail: 'Server health, restarts, monitoring, log review across all four platforms.' },
  { title: 'Slack bot infrastructure', detail: 'Keeping the bots reachable, authenticated, and responsive.' },
  { title: 'Performance on existing screens, reports, dashboards', detail: 'Latency or query slowdowns on already-shipped surfaces.' },
  { title: 'Operator support', detail: 'Direct answers and walkthroughs for questions from the ANC team on existing functionality.' },
  { title: 'Small configuration changes inside existing features', detail: 'Field rename, dashboard filter, saved-view tweak — non-structural adjustments.' },
  { title: 'Operator Docs upkeep', detail: 'docs.ancsports.net and its built-in AI assistant kept in sync as the platforms evolve.' },
]

// The honest middle — judgment calls. We label these openly so nobody's surprised.
export const GRAY_AREA_CLAUSES: Array<{ title: string; detail: string; rule: string }> = [
  {
    title: 'A "small change" that turns structural',
    detail: 'A "rename this column" ask that turns out to require a schema migration, view rewrites, and dependent dashboard updates.',
    rule: 'If it touches one row of one table → covered. If it ripples across 3+ surfaces → flagged for a quote first.',
  },
  {
    title: 'A bug in something that was almost shipped',
    detail: 'A fix for a feature delivered last month vs. one delivered last quarter. The 30-day warranty window is the cutoff.',
    rule: 'Inside 30 days from ship date → free under warranty. Outside 30 days → covered under retainer hours.',
  },
  {
    title: 'New automation on existing workflows',
    detail: 'Adding a Slack notification to an existing event firing today vs. building a new event source.',
    rule: 'Same event, new channel/format → covered. New event source / new trigger → quote.',
  },
  {
    title: 'Restoring something that decayed',
    detail: 'A vendor changed their API or a third-party token expired and broke an integration that was working.',
    rule: 'Restoring previously-working functionality → covered. Migrating to a different vendor → quote.',
  },
  {
    title: 'Asks that arrive as questions but require investigation',
    detail: '"Why is this number wrong?" turning into a 4-hour data-quality dive across three systems.',
    rule: 'Up to 1 hour of investigation → covered (operator support). Beyond that, surfaced and quoted before continuing.',
  },
  {
    title: 'MIXED-classification items',
    detail: 'A request that is partly an existing-feature fix and partly new behavior layered on top.',
    rule: 'The existing-feature portion is logged against the retainer; the new-behavior portion is broken out and quoted separately.',
  },
]

// What's a separate quote — also from the contract.
export const NOT_COVERED_CLAUSES: Array<{ title: string; detail: string }> = [
  { title: 'New features', detail: 'Behavior or capability that does not exist yet on any of the platforms.' },
  { title: 'New modules or pages', detail: 'A whole new section, view, or workflow inside an existing platform.' },
  { title: 'New dashboards or reports', detail: 'A new analytic surface, even if it draws from existing data.' },
  { title: 'Integrations', detail: 'Connecting an ANC platform to a new external system or API.' },
  { title: 'Automations', detail: 'New scheduled jobs, hooks, or rules that did not exist before.' },
  { title: 'Migrations', detail: 'Moving data, schemas, or services between systems.' },
  { title: 'New Slack/voice/AI agents', detail: 'A new bot or agent, or a new skill on an existing one.' },
]

const RETAINER_CAP_HOURS = parseInt(process.env.RETAINER_CAP_HOURS || '12', 10)

export async function getDashboardData(): Promise<DashboardData> {
  const meter = await hoursThisMonth().catch(() => ({
    month: new Date().toISOString().slice(0, 7),
    hours_used: 0,
    hours_estimated_open: 0,
    cap_hours: RETAINER_CAP_HOURS,
    overage_hours: 0,
  }))

  const cap = meter.cap_hours || RETAINER_CAP_HOURS
  const used = Math.max(0, Number(meter.hours_used) || 0)
  const remaining = Math.max(0, cap - used)
  const pct = cap > 0 ? Math.min(100, Math.round((used / cap) * 100)) : 0

  const warrantyRes = await query(
    `SELECT id, summary, shipped_at, repo, area
       FROM service_requests
      WHERE status = 'shipped'
        AND shipped_at IS NOT NULL
        AND shipped_at >= NOW() - INTERVAL '30 days'
      ORDER BY shipped_at DESC
      LIMIT 50`
  ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }))

  const now = Date.now()
  const warranty_items: WarrantyItem[] = warrantyRes.rows.map((r) => {
    const shippedAtIso = new Date(r.shipped_at as string).toISOString()
    const expiresMs = new Date(r.shipped_at as string).getTime() + 30 * 24 * 60 * 60 * 1000
    const daysRemaining = Math.max(0, Math.ceil((expiresMs - now) / (24 * 60 * 60 * 1000)))
    return {
      id: String(r.id),
      summary: String(r.summary || ''),
      shipped_at: shippedAtIso,
      warranty_expires: new Date(expiresMs).toISOString(),
      days_remaining: daysRemaining,
      repo: (r.repo as string) || null,
      area: (r.area as string) || null,
    }
  })

  const shippedRes = await query(
    `SELECT id, summary, shipped_at, actual_hours, repo
       FROM service_requests
      WHERE status = 'shipped'
        AND shipped_at IS NOT NULL
        AND shipped_at >= DATE_TRUNC('month', NOW())
      ORDER BY shipped_at DESC
      LIMIT 50`
  ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }))

  const recently_shipped: RecentlyShipped[] = shippedRes.rows.map((r) => ({
    id: String(r.id),
    summary: String(r.summary || ''),
    shipped_at: new Date(r.shipped_at as string).toISOString(),
    actual_hours: r.actual_hours == null ? null : Number(r.actual_hours),
    repo: (r.repo as string) || null,
  }))

  // Recent triaged requests (last 60 days, capped) — feeds the timeline
  // panel on the dashboard with click-to-expand justification.
  const triagedRes = await query(
    `SELECT id, received_at, requester, summary, classification, status,
            classification_confidence, classification_basis,
            retainer_covered, estimated_hours, estimate_basis, estimated_usd,
            market_breakdown, shipped_at, actual_hours,
            shipped_commit_sha, repo, area
       FROM service_requests
      WHERE received_at >= NOW() - INTERVAL '60 days'
        AND status <> 'cancelled'
      ORDER BY received_at DESC
      LIMIT 25`
  ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }))

  const triaged_requests: TriagedRequest[] = triagedRes.rows.map((r) => ({
    id: String(r.id),
    received_at: new Date(r.received_at as string).toISOString(),
    requester: (r.requester as string) || null,
    summary: String(r.summary || ''),
    classification: r.classification as 'FIX' | 'NEW' | 'MIXED',
    classification_confidence: r.classification_confidence == null ? null : Number(r.classification_confidence),
    classification_basis: (r.classification_basis as string) || null,
    status: String(r.status || 'open'),
    retainer_covered: Boolean(r.retainer_covered),
    estimated_hours: r.estimated_hours == null ? null : Number(r.estimated_hours),
    estimate_basis: (r.estimate_basis as string) || null,
    estimated_usd: r.estimated_usd == null ? null : Number(r.estimated_usd),
    market_breakdown: r.market_breakdown || null,
    shipped_at: r.shipped_at ? new Date(r.shipped_at as string).toISOString() : null,
    actual_hours: r.actual_hours == null ? null : Number(r.actual_hours),
    shipped_commit_sha: (r.shipped_commit_sha as string) || null,
    repo: (r.repo as string) || null,
    area: (r.area as string) || null,
  }))

  // Coverage-strip aggregates — three numbers above the meter.
  const coverageRes = await query(
    `SELECT
       COALESCE(SUM(actual_hours) FILTER (
         WHERE classification = 'FIX'
           AND retainer_covered = true
           AND status = 'shipped'
           AND shipped_at IS NOT NULL
           AND shipped_at >= DATE_TRUNC('month', NOW())
       ), 0)::numeric AS service_contract_hours_used,
       COUNT(*) FILTER (
         WHERE classification = 'FIX'
           AND status = 'shipped'
           AND shipped_at IS NOT NULL
           AND shipped_at >= NOW() - INTERVAL '30 days'
       )::int AS warranty_active_count,
       COALESCE(SUM(actual_hours) FILTER (
         WHERE classification = 'FIX'
           AND status = 'shipped'
           AND shipped_at IS NOT NULL
           AND shipped_at >= NOW() - INTERVAL '30 days'
       ), 0)::numeric AS warranty_hours_protected,
       COUNT(*) FILTER (
         WHERE classification IN ('NEW', 'MIXED')
           AND status IN ('open', 'in_progress', 'quoted')
       )::int AS change_order_open_count,
       COALESCE(SUM(estimated_usd) FILTER (
         WHERE classification IN ('NEW', 'MIXED')
           AND status IN ('open', 'in_progress', 'quoted')
       ), 0)::numeric AS change_order_open_usd,
       COUNT(*) FILTER (
         WHERE classification IN ('NEW', 'MIXED')
           AND status = 'shipped'
           AND shipped_at IS NOT NULL
           AND shipped_at >= DATE_TRUNC('month', NOW())
       )::int AS change_order_shipped_count,
       COALESCE(SUM(estimated_usd) FILTER (
         WHERE classification IN ('NEW', 'MIXED')
           AND status = 'shipped'
           AND shipped_at IS NOT NULL
           AND shipped_at >= DATE_TRUNC('month', NOW())
       ), 0)::numeric AS change_order_shipped_usd
     FROM service_requests`
  ).catch(() => ({ rows: [{}] as Array<Record<string, unknown>> }))

  const coverageRow = coverageRes.rows[0] || {}
  const coverage: CoverageStrip = {
    service_contract_hours_used: Number(coverageRow.service_contract_hours_used) || 0,
    service_contract_cap: cap,
    warranty_active_count: Number(coverageRow.warranty_active_count) || 0,
    warranty_hours_protected: Number(coverageRow.warranty_hours_protected) || 0,
    change_order_open_count: Number(coverageRow.change_order_open_count) || 0,
    change_order_open_usd: Number(coverageRow.change_order_open_usd) || 0,
    change_order_shipped_count: Number(coverageRow.change_order_shipped_count) || 0,
    change_order_shipped_usd: Number(coverageRow.change_order_shipped_usd) || 0,
    prev_service_contract_hours: 0,   // populated below from prevRes
    prev_warranty_active_count: 0,    // populated below
    prev_change_order_total_usd: 0,   // populated below
    burndown_days: [],                // populated below
  }

  // Open change-order queue — separate billing column from the timeline.
  const change_order_queue: TriagedRequest[] = triaged_requests
    .filter(
      (r) =>
        (r.classification === 'NEW' || r.classification === 'MIXED') &&
        ['open', 'in_progress', 'quoted'].includes(r.status)
    )
    .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())

  // Previous-month comparison — same shape as current, but shipped between
  // the start of last month and (last month's start + days-elapsed-in-current-month).
  // This gives an apples-to-apples "where were we at this point last month" read.
  const prevRes = await query(
    `WITH ctx AS (
       SELECT
         DATE_TRUNC('month', NOW() - INTERVAL '1 month')::date AS prev_month_start,
         (DATE_TRUNC('month', NOW())::date - DATE_TRUNC('month', NOW() - INTERVAL '1 month')::date) AS days_elapsed_now,
         (DATE_TRUNC('month', NOW() - INTERVAL '1 month')::date
            + (NOW()::date - DATE_TRUNC('month', NOW())::date)) AS prev_cutoff
     )
     SELECT
       COALESCE(SUM(actual_hours) FILTER (
         WHERE classification = 'FIX' AND retainer_covered = true
           AND status = 'shipped' AND shipped_at IS NOT NULL
           AND shipped_at >= ctx.prev_month_start
           AND shipped_at <= ctx.prev_cutoff
       ), 0)::numeric AS prev_service_contract_hours,
       COUNT(*) FILTER (
         WHERE classification = 'FIX' AND status = 'shipped'
           AND shipped_at IS NOT NULL
           AND shipped_at >= ctx.prev_cutoff - INTERVAL '30 days'
           AND shipped_at <= ctx.prev_cutoff
       )::int AS prev_warranty_active_count,
       COALESCE(SUM(estimated_usd) FILTER (
         WHERE classification IN ('NEW','MIXED')
           AND received_at >= ctx.prev_month_start
           AND received_at <= ctx.prev_cutoff
       ), 0)::numeric AS prev_change_order_total_usd,
       COUNT(*) FILTER (
         WHERE classification = 'FIX' AND status = 'shipped'
           AND shipped_at IS NOT NULL
           AND shipped_at >= ctx.prev_month_start
           AND shipped_at <= ctx.prev_cutoff
       )::int AS prev_shipped_count
     FROM service_requests, ctx`
  ).catch(() => ({ rows: [{}] as Array<Record<string, unknown>> }))

  const prevRow = prevRes.rows[0] || {}
  coverage.prev_service_contract_hours = Number(prevRow.prev_service_contract_hours) || 0
  coverage.prev_warranty_active_count = Number(prevRow.prev_warranty_active_count) || 0
  coverage.prev_change_order_total_usd = Number(prevRow.prev_change_order_total_usd) || 0
  const prevShippedCount = Number(prevRow.prev_shipped_count) || 0

  // Burndown series — cumulative hours used per day this month, plus a pace line.
  const burndownRes = await query(
    `WITH days AS (
       SELECT generate_series(
         DATE_TRUNC('month', NOW())::date,
         NOW()::date,
         '1 day'::interval
       )::date AS d
     ),
     daily AS (
       SELECT shipped_at::date AS d,
              COALESCE(SUM(actual_hours) FILTER (
                WHERE classification = 'FIX' AND retainer_covered = true
              ), 0)::numeric AS hrs
       FROM service_requests
       WHERE status = 'shipped'
         AND shipped_at IS NOT NULL
         AND shipped_at >= DATE_TRUNC('month', NOW())
       GROUP BY shipped_at::date
     )
     SELECT days.d AS day,
            COALESCE(SUM(daily.hrs) OVER (ORDER BY days.d ROWS UNBOUNDED PRECEDING), 0)::numeric AS hours_cum
     FROM days
     LEFT JOIN daily ON daily.d = days.d
     ORDER BY days.d`
  ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }))

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
  const daysInMonth = monthEnd.getDate()
  const paceHoursPerDay = cap / daysInMonth
  coverage.burndown_days = burndownRes.rows.map((r) => {
    const day = new Date(r.day as string).getDate()
    return {
      day,
      hours_cum: Number(r.hours_cum) || 0,
      pace_cum: Number((paceHoursPerDay * day).toFixed(2)),
    }
  })

  // Per-platform breakdown — group shipped + open work by `repo` field
  const platformRes = await query(
    `SELECT COALESCE(repo, 'other') AS platform,
            COUNT(*) FILTER (
              WHERE classification = 'FIX' AND status = 'shipped'
                AND shipped_at >= DATE_TRUNC('month', NOW())
            )::int AS fixes_shipped,
            COALESCE(SUM(actual_hours) FILTER (
              WHERE classification = 'FIX' AND retainer_covered = true AND status = 'shipped'
                AND shipped_at >= DATE_TRUNC('month', NOW())
            ), 0)::numeric AS hours_used,
            COUNT(*) FILTER (
              WHERE classification = 'FIX' AND status = 'shipped'
                AND shipped_at >= NOW() - INTERVAL '30 days'
            )::int AS active_warranties,
            COUNT(*) FILTER (
              WHERE classification IN ('NEW','MIXED') AND status IN ('open','in_progress','quoted')
            )::int AS open_cos,
            COALESCE(SUM(estimated_usd) FILTER (
              WHERE classification IN ('NEW','MIXED') AND status IN ('open','in_progress','quoted')
            ), 0)::numeric AS open_co_usd
     FROM service_requests
     WHERE status <> 'cancelled'
     GROUP BY COALESCE(repo, 'other')
     HAVING COUNT(*) > 0
     ORDER BY fixes_shipped DESC, hours_used DESC`
  ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }))

  const platforms: PlatformBreakdown[] = platformRes.rows.map((r) => ({
    platform: String(r.platform || 'other'),
    fixes_shipped: Number(r.fixes_shipped) || 0,
    hours_used: Number(r.hours_used) || 0,
    active_warranties: Number(r.active_warranties) || 0,
    open_cos: Number(r.open_cos) || 0,
    open_co_usd: Number(r.open_co_usd) || 0,
  }))

  // Recent activity events (last 10) — feeds the live activity ticker.
  const activityRes = await query(
    `WITH events AS (
       SELECT id, classification, requester, summary, estimated_hours, estimated_usd, actual_hours,
              received_at AS ts, 'triaged'::text AS kind FROM service_requests
       UNION ALL
       SELECT id, classification, requester, summary, estimated_hours, estimated_usd, actual_hours,
              shipped_at AS ts, 'shipped'::text AS kind FROM service_requests
         WHERE shipped_at IS NOT NULL
     )
     SELECT id, ts, kind, classification, requester, summary, estimated_hours, estimated_usd, actual_hours
     FROM events
     WHERE ts IS NOT NULL AND ts >= NOW() - INTERVAL '14 days'
     ORDER BY ts DESC
     LIMIT 10`
  ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }))

  const activity: ActivityEvent[] = activityRes.rows.map((r) => ({
    id: String(r.id),
    ts: new Date(r.ts as string).toISOString(),
    kind: r.kind as ActivityEvent['kind'],
    classification: r.classification as 'FIX' | 'NEW' | 'MIXED',
    requester: (r.requester as string) || null,
    summary: String(r.summary || ''),
    hours:
      r.kind === 'shipped' && r.actual_hours != null
        ? Number(r.actual_hours)
        : r.estimated_hours != null
          ? Number(r.estimated_hours)
          : null,
    usd: r.estimated_usd != null ? Number(r.estimated_usd) : null,
  }))

  // Story / narrative
  const today = new Date()
  const daysElapsed = today.getDate()
  const pctElapsed = Math.round((daysElapsed / daysInMonth) * 100)
  const shippedThisMonth = recently_shipped.length
  const expectedByNow = (cap * pctElapsed) / 100
  let pacing: MonthStory['pacing_status'] = 'on_track'
  if (used > cap) pacing = 'over'
  else if (used > expectedByNow * 1.15) pacing = 'behind'
  else if (used < expectedByNow * 0.5 && pctElapsed > 30) pacing = 'ahead'
  const monthLabel = today.toLocaleString('en-US', { month: 'long' })
  const prevMonthLabel = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    .toLocaleString('en-US', { month: 'long' })
  const shipDelta = shippedThisMonth - prevShippedCount
  const shipPace =
    shipDelta > 0 ? `ahead of ${prevMonthLabel} by ${shipDelta}` :
    shipDelta < 0 ? `${Math.abs(shipDelta)} behind ${prevMonthLabel}` :
    `matching ${prevMonthLabel}`
  const coUsdTotal = coverage.change_order_open_usd + coverage.change_order_shipped_usd
  const fmtUsdShort = (n: number) =>
    n >= 1000 ? '$' + (n / 1000).toFixed(1) + 'k' : '$' + Math.round(n).toLocaleString('en-US')
  const narrative =
    `${monthLabel} is ` +
    (pctElapsed < 33 ? 'just starting' : pctElapsed < 66 ? 'in motion' : 'wrapping up') +
    `. ${shippedThisMonth} ${shippedThisMonth === 1 ? 'fix' : 'fixes'} shipped so far` +
    (shipDelta !== 0 ? `, ${shipPace}` : '') +
    `, drawing ${used.toFixed(1)} of ${cap} retainer hours` +
    (pacing === 'on_track' ? ' (on pace)' : pacing === 'behind' ? ' (heavier than usual — watch the cap)' : pacing === 'ahead' ? ' (lighter than usual)' : ' — over the cap, $90/hr overage now applies') +
    `. ${coverage.warranty_active_count} ${coverage.warranty_active_count === 1 ? 'fix is' : 'fixes are'} still under the 30-day warranty clock` +
    (coUsdTotal > 0 ? `, and ${coverage.change_order_open_count} change ${coverage.change_order_open_count === 1 ? 'order is' : 'orders are'} queued at ${fmtUsdShort(coverage.change_order_open_usd)}` : '') +
    '.'

  const story: MonthStory = {
    month_label: monthLabel + ' ' + today.getFullYear(),
    days_elapsed: daysElapsed,
    days_total: daysInMonth,
    pct_elapsed: pctElapsed,
    shipped_count: shippedThisMonth,
    shipped_count_prev: prevShippedCount,
    hours_used: used,
    open_cos: coverage.change_order_open_count,
    open_co_usd: coverage.change_order_open_usd,
    active_warranties: coverage.warranty_active_count,
    pacing_status: pacing,
    narrative,
  }

  // Payment status for the current month — derived from service_payments
  // ledger; defaults to 'pending' if no row exists yet.
  const month = new Date().toISOString().slice(0, 7)
  const payRes = await query(
    `SELECT month, status, amount, paid_at, invoice_number
       FROM service_payments
      WHERE month = $1
      LIMIT 1`,
    [month]
  ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }))

  const payment: PaymentStatus = payRes.rows.length > 0
    ? {
        month: String(payRes.rows[0].month),
        status: payRes.rows[0].status as 'paid' | 'pending' | 'overdue' | 'invoiced',
        amount: payRes.rows[0].amount == null ? null : Number(payRes.rows[0].amount),
        paid_at: payRes.rows[0].paid_at ? new Date(payRes.rows[0].paid_at as string).toISOString() : null,
        invoice_number: (payRes.rows[0].invoice_number as string) || null,
      }
    : { month, status: 'pending', amount: null, paid_at: null, invoice_number: null }

  return {
    meter: {
      month: meter.month,
      hours_used: used,
      hours_estimated_open: Number(meter.hours_estimated_open) || 0,
      cap_hours: cap,
      overage_hours: Number(meter.overage_hours) || 0,
      hours_remaining: remaining,
      pct_used: pct,
    },
    coverage,
    story,
    platforms,
    activity,
    warranty_items,
    recently_shipped,
    triaged_requests,
    change_order_queue,
    payment,
    generated_at: new Date().toISOString(),
  }
}
