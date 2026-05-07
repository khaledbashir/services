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
  status: string
  retainer_covered: boolean
  estimated_hours: number | null
  estimate_basis: string | null
  estimated_usd: number | null
  market_breakdown: any | null   // full chain when present (NEW/MIXED only)
  shipped_at: string | null
  actual_hours: number | null
  shipped_commit_sha: string | null
  repo: string | null
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
            retainer_covered, estimated_hours, estimate_basis, estimated_usd,
            market_breakdown, shipped_at, actual_hours,
            shipped_commit_sha, repo
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
  }

  // Open change-order queue — separate billing column from the timeline.
  const change_order_queue: TriagedRequest[] = triaged_requests
    .filter(
      (r) =>
        (r.classification === 'NEW' || r.classification === 'MIXED') &&
        ['open', 'in_progress', 'quoted'].includes(r.status)
    )
    .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())

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
    warranty_items,
    recently_shipped,
    triaged_requests,
    change_order_queue,
    payment,
    generated_at: new Date().toISOString(),
  }
}
