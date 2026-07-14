import { query } from '@/lib/db'

/**
 * Leadership Platform Hub — registry, live health, KPIs, and personal access.
 * Served through unguessable personal tokens (same trust model as proof-share links).
 */

export type HubPlatform = {
  key: string
  name: string
  category: string
  description: string
  capabilities: string[]
  url: string
  healthUrl?: string
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
]

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
    query(`SELECT count(*)::int AS n FROM events WHERE start_time BETWEEN NOW() AND NOW() + interval '7 days'`).catch(
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
     RETURNING person_name, person_email, logins`,
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
