import { query } from '@/lib/db'

/**
 * Project intelligence — a structured live snapshot of what the four ANC
 * platforms actually have right now. Fed into the AI scope generator so
 * proposals are anchored against real architecture, real data, and real
 * recent work — not just the AI's assumptions.
 *
 * Cached for 5 minutes per request to keep the latency low without going
 * stale. Resilient to any source failing — missing data falls through with
 * a "(unavailable)" marker so the AI sees the gap instead of erroring out.
 */

interface CustomObjectInventory {
  name: string
  record_count: number
}

interface ShippedItem {
  summary: string
  area: string | null
  shipped_at: string | null
  usd: number | null
}

interface PlatformIntel {
  slug: string
  name: string
  description: string
  surfaces: string[] // route / feature inventory — curated; reflects what the user actually sees
  data_model?: CustomObjectInventory[] // CRM-only
}

const PLATFORMS: PlatformIntel[] = [
  {
    slug: 'service-dashboard',
    name: 'Service Dashboard',
    description: 'Daily ops platform for ANC venue technicians, managers, and admins. Tickets, events, technician scheduling, venue ops, Slack notifications, post-game reports, transparency dashboard.',
    surfaces: [
      'Ticketing (/tickets) — voicemail intake, image attachments, parent/child merging, Slack notifications, support + dev_ticket types, portal-based external submission',
      'Events (/events, /my-events) — game discovery from team feeds, ICS / RSS / iCal parsers, manual events, technician assignment with shift-template pre-fills',
      'Workflow (/workflow/[eventId]) — 3-stage technician flow: check-in, game-ready, post-game report (notes + incidents)',
      'Venues (/venues, /venues/[id]) — full venue records, briefing, distribution emails, season tags, design contractors',
      'Staff (/staff, /staff/[id]) — technicians, schedules, shift assignments, RBAC roles (admin/manager/technician)',
      'Reports (/reports) — designs-by-client, hours budgets per client, inline time-entry log, monthly print-to-PDF',
      'Operations tables (/operations) — native airtable-clone grid + drawer for the 8 operational bases',
      'Service log + transparency (/service-log, /transparency) — request triage, retainer meter, change orders, warranty timers',
      'Inbox / morning brief (/inbox) — captured Slack candidates + stale items + pending approvals + last 36h ships',
      'Walkthroughs (/walkthroughs) — pre-game venue check forms, NocoDB-backed',
      'Portal (/portal/[token]) — public token-based external submission for venue managers',
      'Microsoft SSO entry (/api/auth/microsoft) — feeds the apps.ancsports.net hub',
    ],
  },
  {
    slug: 'proposal-engine',
    name: 'Proposal Engine',
    description: 'Sales platform for ANC reps. Estimator, RFP analyzer, Mirror Mode (exact-spreadsheet reproduction), cost sheets, SOW + PDF generator, product catalog, Copilot chat assistant.',
    surfaces: [
      'Estimator + RFP analyzer — extracts requirements, classifies workType, market-grounded pricing chain (US median → outsourcing → contract rate → relationship)',
      'Mirror Mode — pixel-exact reproduction of stakeholder Excel templates with no math, no UI inference (Natalia Kovaleva\'s sign-off bar)',
      'Cost sheets + SOW generator — fixed-price proposals with deterministic page-break PDF',
      'Product catalog — LED panel matching engine with fallback catalog and admin product management',
      'Copilot — dual-brain chat assistant for proposal building, intent parsing, action execution, multi-AI provider routing',
      'CRM-reports — weekly/monthly Closed Won email digest to Jireh\'s 22-person distribution list, dashboard-tile-for-tile parity',
    ],
  },
  {
    slug: 'crm',
    name: 'CRM (Twenty)',
    description: 'Account / opportunity / dashboard / view / custom-field / AI-agent platform for ANC sales. Replacing Salesforce. Migrated 33 users, 23K Wrike tasks, 28K timelogs, 315 venues.',
    surfaces: [
      'Companies, opportunities, design requests with priority flag + CG fields',
      'Custom dashboards — 2026 Won & Forecast by Business Unit, per-BU widgets, AE rollups',
      'Twenty Scout AI agent skills — every Scout skill is mirrored to the @ANC OpenClaw Slack bot',
      'M&S Bundle A custom objects: mediaPlacement (917 records), nielsenVerification (171), sponsorTeamContract (26)',
      'Time entries linked to design requests, hours budgets per client + contract dates',
    ],
    // data_model populated live from Twenty workspace
  },
  {
    slug: 'kb',
    name: 'Operator Docs (kb)',
    description: 'Documentation site at docs.ancsports.net (Fumadocs + Next.js + Ollama Cloud AI). Built-in AI assistant covering all four platforms. Auto-publishes meaningful events from Hermes.',
    surfaces: [
      'docs.ancsports.net — Fumadocs MDX content for every operator workflow',
      'Built-in AI assistant — RAG-style Q&A over the docs corpus',
      'Auto-publishing pipeline — Hermes detects meaningful events (stakeholder asks, deliveries, decisions, drama, money) and writes dated entries',
      '8 KB sections: people, conversations, requests (open/shipped), decisions, drama, business, projects, reference',
    ],
  },
]

interface ProjectContextOptions {
  /** When true, include the recent commit log per repo (git log). Adds latency. */
  includeGitLog?: boolean
  /** When true, include the live Twenty custom-object inventory. Adds DB hit. */
  includeTwentyInventory?: boolean
}

let cachedSnapshot: { at: number; markdown: string } | null = null
const CACHE_TTL_MS = 5 * 60 * 1000

export async function buildProjectContext(opts: ProjectContextOptions = {}): Promise<string> {
  const includeGitLog = opts.includeGitLog !== false
  const includeTwenty = opts.includeTwentyInventory !== false

  if (cachedSnapshot && Date.now() - cachedSnapshot.at < CACHE_TTL_MS) {
    return cachedSnapshot.markdown
  }

  const lines: string[] = []
  lines.push('# Live snapshot of ANC platforms (read context for scoping)')
  lines.push('')
  lines.push('Use this snapshot when sizing a proposal. Re-using existing surfaces is cheaper than building new ones.')
  lines.push('Reference what is already live so scope reflects reality, not assumed greenfield.')
  lines.push('')

  // Platform inventory (curated)
  for (const p of PLATFORMS) {
    lines.push(`## ${p.name} (project: ${p.slug})`)
    lines.push(p.description)
    lines.push('')
    lines.push('Live surfaces:')
    for (const s of p.surfaces) lines.push(`  - ${s}`)
    lines.push('')
  }

  // Recently shipped change orders — gives the AI a sense of what kind of CO ANC actually buys
  try {
    const recent = await query(
      `SELECT summary, project, COALESCE(paid_amount, quote_amount, estimated_usd, 0)::float8 AS usd, shipped_at
         FROM service_requests
        WHERE retainer_covered = false
          AND status IN ('shipped', 'paid')
          AND source <> 'auto-push'
          AND shipped_at IS NOT NULL
        ORDER BY shipped_at DESC
        LIMIT 8`,
    )
    if (recent.rows.length > 0) {
      lines.push('## Recently shipped change orders (anchor pricing here)')
      for (const r of recent.rows) {
        const usd = Number(r.usd || 0)
        const usdLabel = usd >= 1000 ? `$${(usd / 1000).toFixed(usd % 1000 === 0 ? 0 : 1)}k` : usd > 0 ? `$${Math.round(usd)}` : 'unpriced'
        lines.push(`  - [${r.project || '?'}] ${(r.summary || '').slice(0, 140)} — ${usdLabel}`)
      }
      lines.push('')
    }
  } catch (err) {
    lines.push('  (recent CO history unavailable)')
    lines.push('')
  }

  // Active CRM custom objects + record counts (live from Twenty if available)
  if (includeTwenty) {
    try {
      const r = await fetchTwentyInventory()
      if (r.length > 0) {
        lines.push('## CRM custom objects already in production')
        for (const obj of r) {
          lines.push(`  - ${obj.name}: ${obj.record_count.toLocaleString('en-US')} records`)
        }
        lines.push('  Cost implication: re-using these objects = config-only work; building parallel objects = full rebuild.')
        lines.push('')
      }
    } catch {}
  }

  // Recent commits per repo (read-only intelligence)
  if (includeGitLog) {
    const repos = [
      { path: '/root/anc-services', label: 'service-dashboard' },
      { path: '/root/rag2', label: 'proposal-engine' },
      { path: '/root/anc-kb', label: 'kb' },
    ]
    const { execSync } = await import('child_process')
    lines.push('## Recent ship velocity (last 5 commits per repo)')
    for (const repo of repos) {
      try {
        const log = execSync(`git -C ${repo.path} log -5 --pretty=format:'  - %s' 2>/dev/null`, {
          encoding: 'utf8',
          timeout: 3000,
        }).trim()
        if (log) {
          lines.push(`### ${repo.label}`)
          lines.push(log)
          lines.push('')
        }
      } catch {}
    }
  }

  lines.push('---')
  lines.push('Snapshot built at ' + new Date().toISOString())

  const markdown = lines.join('\n')
  cachedSnapshot = { at: Date.now(), markdown }
  return markdown
}

async function fetchTwentyInventory(): Promise<CustomObjectInventory[]> {
  // Twenty's custom-object tables live in workspace_<id>.<_TableName>. We hit
  // the postgres container directly to count rows for the M&S objects we know
  // about + a few standard ones. Soft-fails if the container or schema isn't
  // reachable from this service.
  const SCHEMA = process.env.TWENTY_WORKSPACE_SCHEMA || 'workspace_cjspnkm8glh7iooo1gep8c1qo'
  const objectsToCount = ['_mediaPlacement', '_nielsenVerification', '_sponsorTeamContract', '_company', '_opportunity']
  const out: CustomObjectInventory[] = []
  try {
    const { execSync } = await import('child_process')
    for (const t of objectsToCount) {
      try {
        const cmd = `docker exec $(docker ps --format '{{.Names}}' | grep '^abc_twenty-db' | head -1) psql -U postgres -d abc -tA -c 'SELECT count(*) FROM "${SCHEMA}"."${t}"' 2>/dev/null`
        const result = execSync(cmd, { encoding: 'utf8', timeout: 4000 }).trim()
        const n = parseInt(result, 10)
        if (Number.isFinite(n)) {
          out.push({ name: t.replace(/^_/, ''), record_count: n })
        }
      } catch {}
    }
  } catch {}
  return out
}

/**
 * Test-only helper — clears the cache so a fresh snapshot is built.
 */
export function clearProjectContextCache() {
  cachedSnapshot = null
}
