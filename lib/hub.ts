import { query } from '@/lib/db'

/**
 * Leadership Platform Hub — registry, live health, KPIs, and personal access.
 * Served through unguessable personal tokens (same trust model as proof-share links).
 */

/** Not-yet-production platforms carry a badge so nobody mistakes them for shipped work. */
export type HubPlatformStatus = 'live' | 'in_progress' | 'experimental'

export type HubPlatform = {
  key: string
  name: string
  category: string
  description: string
  capabilities: string[]
  url: string
  healthUrl?: string
  status?: HubPlatformStatus
}

export const HUB_PLATFORMS: HubPlatform[] = [
  {
    key: 'crm',
    name: 'The CRM',
    category: 'Revenue',
    description: 'Every account, opportunity, and pipeline number — the commercial source of truth.',
    capabilities: ['Pipeline & forecasts', 'Accounts & contacts', 'Dashboards & reports', 'Ask the AI anything'],
    url: 'https://crm.ancsports.net',
  },
  {
    key: 'proposals',
    name: 'Proposal Engine',
    category: 'Revenue',
    description: 'LED estimating, proposals, contracts, and the pricing tools behind every bid.',
    capabilities: ['Proposals & exports', 'LED pricing & estimating', 'Control-system calculator', 'Service contracts'],
    url: 'https://proposals.anc.com',
  },
  {
    key: 'services',
    name: 'Service Dashboard',
    category: 'Operations',
    description: 'Venue operations across the country — events, staffing, tickets, and field work.',
    capabilities: ['Events & staffing', 'Service tickets', 'Venues & check-ins', 'Reports'],
    url: 'https://services.ancsports.net',
  },
  {
    key: 'projects',
    name: 'Project Delivery',
    category: 'Operations',
    description: 'Install schedules, submittals, and the delivery timeline for every venue project.',
    capabilities: ['Project schedules', 'Submittal tracking', 'Delivery milestones', 'Schedule exports'],
    url: 'https://services.ancsports.net/project-schedule',
    healthUrl: 'https://services.ancsports.net',
  },
  {
    key: 'ops',
    name: 'Operations Tables',
    category: 'Operations',
    description: 'The operational data tables — inventory, advertising, and regional service bases.',
    capabilities: ['Inventory', 'Regional service bases', 'Advertising ops'],
    url: 'https://ops.ancsports.net',
  },
  {
    key: 'marketing',
    name: 'Marketing Hub',
    category: 'Marketing',
    description: 'Contacts, audiences, newsletters, social publishing, and form routing — under one roof.',
    capabilities: ['22k+ contacts & audiences', 'Newsletter campaigns', 'Approvals & routing', 'Social publishing'],
    url: 'https://services.ancsports.net/marketing-hub',
    healthUrl: 'https://services.ancsports.net',
  },
  {
    key: 'docs',
    name: 'Docs & Academy',
    category: 'Knowledge',
    description: 'Training, how-tos, and platform documentation for the whole team.',
    capabilities: ['Training guides', 'Platform docs', 'AI assistant'],
    url: 'https://docs.ancsports.net',
  },
  {
    key: 'studio',
    name: 'ANC Studio',
    category: 'In Development',
    description: 'Client decks built from live project and pricing data — presented, shared, and tracked.',
    capabilities: ['Client presentations', 'Live deck sharing', 'Before/after showcases', 'Deck library'],
    url: 'https://presentation.basheer.app',
    status: 'in_progress',
  },
  {
    key: 'aihub',
    name: 'AI Hub',
    category: 'In Development',
    description: 'Where new AI capabilities are trialled before they earn a place in the platforms.',
    capabilities: ['Document generation', 'Report drafting', 'Content tools', 'Prototypes'],
    url: 'https://ai.basheer.app',
    status: 'experimental',
  },
]

// ---------- classifications ----------

/**
 * Employee classifications (Jireh 7/14): everyone gets the same hub, scoped to
 * their world. Each classification picks which platforms and which KPI tiles
 * its links show. `leadership` sees everything.
 */
export type HubClassification =
  | 'leadership'
  | 'sales'
  | 'design'
  | 'operations'
  | 'marketing'
  | 'project_management'

export type HubKpiKey =
  | 'opportunities'
  | 'openTickets'
  | 'eventsNext7Days'
  | 'marketingContacts'
  | 'emailsDelivered'

export const HUB_CLASSIFICATIONS: Record<HubClassification, {
  label: string
  platformKeys: string[] | 'all'
  kpiKeys: HubKpiKey[] | 'all'
}> = {
  leadership: { label: 'Leadership', platformKeys: 'all', kpiKeys: 'all' },
  sales: {
    label: 'Sales & Enterprise',
    platformKeys: ['crm', 'proposals', 'studio', 'docs'],
    kpiKeys: ['opportunities'],
  },
  design: {
    label: 'Design & Creative',
    platformKeys: ['services', 'studio', 'docs'],
    kpiKeys: ['openTickets'],
  },
  operations: {
    label: 'Operations & Field',
    platformKeys: ['services', 'ops', 'docs'],
    kpiKeys: ['openTickets', 'eventsNext7Days'],
  },
  marketing: {
    label: 'Marketing',
    platformKeys: ['marketing', 'docs'],
    kpiKeys: ['marketingContacts', 'emailsDelivered'],
  },
  // Jireh 7/14: Jesse leads Project Management — the schedule builder, submittals,
  // and the venue delivery calendar are his world.
  project_management: {
    label: 'Project Management',
    platformKeys: ['projects', 'services', 'ops', 'docs'],
    kpiKeys: ['openTickets', 'eventsNext7Days'],
  },
}

/**
 * A link can carry SEVERAL classifications (Jireh 7/14: "Alexis is going to be
 * combined with design and operations and also sales"). Stored comma-separated;
 * the hub shows the union of every classification's platforms and KPIs.
 */
export function normalizeClassifications(value: unknown): HubClassification[] {
  const parts = String(value ?? '')
    .toLowerCase()
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p in HUB_CLASSIFICATIONS) as HubClassification[]
  const unique = Array.from(new Set(parts))
  return unique.length ? unique : ['leadership']
}

/** Single-value form kept for callers that only need one (first wins). */
export function normalizeClassification(value: unknown): HubClassification {
  return normalizeClassifications(value)[0]
}

export function labelForClassifications(classifications: HubClassification[]): string {
  if (classifications.includes('leadership')) return 'Leadership'
  return classifications.map((c) => HUB_CLASSIFICATIONS[c].label).join(' · ')
}

export function platformsForClassifications(classifications: HubClassification[]): HubPlatform[] {
  if (classifications.some((c) => HUB_CLASSIFICATIONS[c].platformKeys === 'all')) return HUB_PLATFORMS
  const keys = new Set(
    classifications.flatMap((c) => HUB_CLASSIFICATIONS[c].platformKeys as string[])
  )
  return HUB_PLATFORMS.filter((p) => keys.has(p.key))
}

export function kpiKeysForClassifications(classifications: HubClassification[]): HubKpiKey[] | 'all' {
  if (classifications.some((c) => HUB_CLASSIFICATIONS[c].kpiKeys === 'all')) return 'all'
  return Array.from(
    new Set(classifications.flatMap((c) => HUB_CLASSIFICATIONS[c].kpiKeys as HubKpiKey[]))
  )
}

// ---------- health ----------

type Health = { key: string; ok: boolean; ms: number }
let healthCache: { at: number; data: Health[] } | null = null

export async function getPlatformHealth(): Promise<Health[]> {
  if (healthCache && Date.now() - healthCache.at < 5 * 60_000) return healthCache.data
  const checks = await Promise.all(
    HUB_PLATFORMS.map(async (p) => {
      const started = Date.now()
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 4000)
        const res = await fetch(p.healthUrl || p.url, { signal: ctrl.signal, redirect: 'follow' })
        clearTimeout(t)
        return { key: p.key, ok: res.status < 500, ms: Date.now() - started }
      } catch {
        return { key: p.key, ok: false, ms: Date.now() - started }
      }
    }),
  )
  healthCache = { at: Date.now(), data: checks }
  return checks
}

// ---------- KPIs ----------

export async function getHubKpis() {
  const [tickets, events, contacts, delivered] = await Promise.all([
    query(`SELECT count(*)::int AS n FROM tickets WHERE status NOT IN ('closed')`),
    query(`SELECT count(*)::int AS n FROM events WHERE COALESCE(approval_status, 'approved') = 'approved' AND start_time BETWEEN NOW() AND NOW() + interval '7 days'`).catch(
      () => ({ rows: [{ n: null }] }),
    ),
    query(`SELECT count(*)::int AS n FROM marketing_contacts`),
    query(`SELECT count(*)::int AS n FROM newsletter_campaign_recipients WHERE status IN ('sent','delivered')`),
  ])

  let openOpportunities: number | null = null
  try {
    const tok = process.env.TWENTY_API_KEY
    if (tok) {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 4000)
      const res = await fetch(
        'https://abc-twenty.izcgmb.easypanel.host/rest/opportunities?limit=1',
        { headers: { Authorization: `Bearer ${tok}` }, signal: ctrl.signal },
      )
      clearTimeout(t)
      if (res.ok) {
        const d = await res.json()
        openOpportunities = d.totalCount ?? null
      }
    }
  } catch {
    /* CRM count is best-effort */
  }

  return {
    openTickets: tickets.rows[0]?.n ?? null,
    eventsNext7Days: events.rows[0]?.n ?? null,
    marketingContacts: contacts.rows[0]?.n ?? null,
    emailsDelivered: delivered.rows[0]?.n ?? null,
    opportunities: openOpportunities,
  }
}

// ---------- tokens + status feed ----------

export async function ensureHubTables() {
  await query(`CREATE TABLE IF NOT EXISTS hub_access_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token TEXT UNIQUE NOT NULL,
    person_name TEXT NOT NULL,
    person_email TEXT NOT NULL,
    logins JSONB NOT NULL DEFAULT '[]',
    view_count INT NOT NULL DEFAULT 0,
    last_viewed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)
  await query(`ALTER TABLE hub_access_tokens ADD COLUMN IF NOT EXISTS classification TEXT NOT NULL DEFAULT 'leadership'`)
  await query(`CREATE TABLE IF NOT EXISTS hub_status_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_key TEXT NOT NULL,
    title TEXT NOT NULL,
    detail TEXT,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`)
}

export async function getHubAccess(token: string) {
  await ensureHubTables()
  const res = await query(
    `UPDATE hub_access_tokens
     SET view_count = view_count + 1, last_viewed_at = NOW()
     WHERE token = $1 AND revoked_at IS NULL
     RETURNING person_name, person_email, logins, classification`,
    [token],
  )
  return res.rows[0] || null
}

export async function getStatusEntries(limit = 12) {
  await ensureHubTables()
  const res = await query(
    `SELECT platform_key, title, detail, entry_date
     FROM hub_status_entries ORDER BY entry_date DESC, created_at DESC LIMIT $1`,
    [limit],
  )
  return res.rows
}
