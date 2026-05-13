// Service-contract request triage + estimator.
//
// Classifies an incoming request (Slack paste, email, ticket comment, etc.)
// as FIX vs NEW, identifies the relevant platform area, and produces a
// realistic time estimate from REAL data — past shipped service_requests
// rows first, git-log of matching commits as a backstop, deterministic
// baselines as last resort. No model calls; no guessing.
//
// Wired into:
//   - app/api/service-triage             (HTTP)
//   - lib/ai/skills/triage-request.ts    (OpenClaw + in-dashboard AI)
//   - /root/.claude/skills/anc-request-triage  (Claude Code)

import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { query } from '@/lib/db'
import { estimate as marketEstimate, classifyWorkType } from '@/lib/market-rate'

export type Classification = 'FIX' | 'NEW' | 'MIXED'
export type ConfidenceBucket = 'HIGH' | 'MEDIUM' | 'LOW'

export interface TriageInput {
  raw_text: string
  source?: string                 // 'slack' | 'email' | 'manual' | ...
  source_url?: string
  requester?: string
  created_by?: string             // staff UUID
  inbox?: boolean                 // captured-but-unapproved candidate; doesn't count anywhere until approved
}

export interface TriageOutput {
  id: string
  received_at: string
  classification: Classification
  confidence: ConfidenceBucket
  confidence_score: number        // 0-10
  classification_basis: string
  repo: string | null
  area: string | null
  keywords: string[]
  retainer_covered: boolean
  estimate: {
    hours_low: number | null
    hours_high: number | null
    hours_point: number | null    // a single-number "best guess" if needed
    sample_size: number
    source: 'db_priors' | 'git_log' | 'baseline' | 'unknown'
    basis: string
  }
  summary: string
  next_action: string             // 1-line guidance for the operator
  stakeholder_message: string     // paste-ready mini-report Ahmad sends back to the requester
}

// ---------- Classification ----------

const FIX_SIGNALS = [
  'broken', 'not working', "doesn't work", 'doesnt work', 'stopped working',
  'fix', 'bug', 'issue', 'issues', 'error', 'errors', 'regression',
  "doesn't", "didn't", 'wrong', 'off by', 'missing', 'gone',
  'blank', 'empty', '404', '500', 'crash', 'crashed', 'crashing',
  'stuck', 'frozen', 'hangs', 'fails', 'failing', 'failed',
  'should be', 'used to', 'no longer', 'instead of',
  'why is', 'why does', "why doesn't", 'unexpected',
]

const NEW_SIGNALS = [
  'add ', 'add a', 'add the', 'new feature', 'new module', 'new page',
  'create ', 'create a', 'create the', 'build ', 'build a', 'build me',
  'want ', 'want a', 'want to', 'need ', 'need a', 'need to',
  'would like', "i'd like", 'can we have', 'can we add',
  'integrat', 'automate', 'automation', 'migrate', 'migration',
  'report for', 'dashboard for', 'module for',
  'feature request', 'enhancement', 'support for',
  'when ', 'every time', 'whenever ',  // "when X happens, do Y" = automation
]

function countMatches(text: string, signals: string[]): { count: number; hits: string[] } {
  const lower = text.toLowerCase()
  const hits: string[] = []
  for (const s of signals) {
    if (lower.includes(s)) hits.push(s.trim())
  }
  return { count: hits.length, hits }
}

function classify(text: string): {
  classification: Classification
  confidence: ConfidenceBucket
  confidence_score: number
  basis: string
} {
  const fix = countMatches(text, FIX_SIGNALS)
  const newish = countMatches(text, NEW_SIGNALS)

  let classification: Classification
  if (fix.count >= 2 && newish.count <= 1) classification = 'FIX'
  else if (newish.count >= 2 && fix.count <= 1) classification = 'NEW'
  else if (fix.count > 0 && newish.count > 0) classification = 'MIXED'
  else if (fix.count > 0) classification = 'FIX'
  else if (newish.count > 0) classification = 'NEW'
  else classification = 'NEW' // default to NEW when nothing matches — safer for retainer math

  const dominant = Math.max(fix.count, newish.count)
  const score = Math.min(10, dominant * 2 + (Math.abs(fix.count - newish.count) >= 2 ? 3 : 0))
  const confidence: ConfidenceBucket = score >= 8 ? 'HIGH' : score >= 5 ? 'MEDIUM' : 'LOW'

  const basisParts: string[] = []
  if (fix.hits.length) basisParts.push(`FIX signals: ${fix.hits.slice(0, 4).join(', ')}`)
  if (newish.hits.length) basisParts.push(`NEW signals: ${newish.hits.slice(0, 4).join(', ')}`)
  if (!basisParts.length) basisParts.push('No strong signals — defaulted to NEW so it goes through fixed-price quote review.')

  return { classification, confidence, confidence_score: score, basis: basisParts.join(' · ') }
}

// ---------- Repo + area ----------

interface AreaRule {
  repo: string
  area: string
  keywords: string[]
  // If any keyword matches, this area scores by the number of matches.
}

const AREA_RULES: AreaRule[] = [
  // anc-services platform
  { repo: 'anc-services', area: 'tickets', keywords: ['ticket', 'tickets', 'voicemail', 'support', 'merge ticket', 'priority', 'venue ticket'] },
  { repo: 'anc-services', area: 'design-requests', keywords: ['design request', 'design hub', 'design queue', 'designer', 'design contractor', 'design log', 'priority flag', 'CG design', 'graphics request'] },
  { repo: 'anc-services', area: 'venues', keywords: ['venue', 'venues', 'arena', 'stadium', 'rocket arena', 'prudential', 'TD Garden'] },
  { repo: 'anc-services', area: 'events', keywords: ['event', 'events', 'game', 'games', 'event discovery', 'feed', 'event date'] },
  { repo: 'anc-services', area: 'walkthroughs', keywords: ['walkthrough', 'walkthroughs', 'walk-through', 'pre-game check'] },
  { repo: 'anc-services', area: 'maintenance', keywords: ['maintenance', 'maintenance log', 'rma', 'parts', 'inventory'] },
  { repo: 'anc-services', area: 'staff', keywords: ['staff', 'technician', 'shift', 'check-in', 'checkin', 'assignment', 'unassigned'] },
  { repo: 'anc-services', area: 'reports', keywords: ['report', 'reports', 'dashboard widget', 'designs by client', 'hours budget', 'hours spent', 'budget'] },
  { repo: 'anc-services', area: 'operations-tables', keywords: ['operations', 'ops table', 'baserow', 'nocodb', 'noco', 'native airtable', 'data grid'] },
  { repo: 'anc-services', area: 'auth', keywords: ['login', 'sign in', 'signin', 'password', 'role', 'rbac', 'permission'] },
  { repo: 'anc-services', area: 'slack-bot', keywords: ['slack notification', 'slack bot', 'slack ping', 'slack message', '@anc', 'openclaw'] },

  // rag2 / proposal engine
  { repo: 'rag2', area: 'proposal-engine', keywords: ['proposal', 'proposal engine', 'estimate', 'estimator', 'sow', 'cost sheet', 'mirror mode', 'rfp', 'mirror'] },
  { repo: 'rag2', area: 'product-catalog', keywords: ['product catalog', 'led product', 'spec sheet', 'led panel'] },
  { repo: 'rag2', area: 'copilot', keywords: ['copilot', 'proposal copilot', 'chat assistant'] },

  // CRM (Twenty)
  { repo: 'twenty-crm', area: 'crm', keywords: ['crm', 'opportunity', 'opportunities', 'twenty', 'pipeline', 'account', 'company', 'lead', 'deal'] },
  { repo: 'twenty-crm', area: 'crm-views', keywords: ['view', 'kanban', 'crm dashboard', 'jireh', 'natalia', 'salesforce'] },
  { repo: 'twenty-crm', area: 'crm-skills', keywords: ['scout skill', 'twenty skill', 'agent skill', 'ai agent crm'] },

  // Operator docs site
  { repo: 'anc-kb', area: 'docs', keywords: ['docs', 'documentation', 'docs.ancsports', 'knowledge base', 'docs ai', 'docs assistant', 'fumadocs'] },
]

function detectArea(text: string): { repo: string | null; area: string | null; keywords: string[] } {
  const lower = text.toLowerCase()
  let best: AreaRule | null = null
  let bestScore = 0
  let bestHits: string[] = []
  for (const rule of AREA_RULES) {
    const hits = rule.keywords.filter(k => lower.includes(k.toLowerCase()))
    if (hits.length > bestScore) {
      best = rule
      bestScore = hits.length
      bestHits = hits
    }
  }
  if (!best) return { repo: null, area: null, keywords: [] }
  return { repo: best.repo, area: best.area, keywords: bestHits }
}

// ---------- Estimation ----------

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

interface GitSample {
  matching_commits: number
  median_gap_hours: number | null
  recent_commits: Array<{ sha: string; subject: string; ts: number }>
}

const REPO_PATHS: Record<string, string> = {
  'anc-services': '/root/anc-services',
  'rag2': '/root/rag2',
  'anc-kb': '/root/anc-kb',
  'twenty-crm': '/root/twenty-crm',
}

function sampleGitLog(repo: string, keywords: string[]): GitSample {
  const path = REPO_PATHS[repo]
  if (!path || !existsSync(path)) {
    return { matching_commits: 0, median_gap_hours: null, recent_commits: [] }
  }
  let raw: string
  try {
    raw = execFileSync(
      'git',
      ['-C', path, 'log', '--pretty=format:%at|%H|%s', '--since=180.days', '-n', '500'],
      { encoding: 'utf8', timeout: 4000 },
    )
  } catch {
    return { matching_commits: 0, median_gap_hours: null, recent_commits: [] }
  }
  const lines = raw.split('\n').filter(Boolean)
  const lowered = keywords.map(k => k.toLowerCase()).filter(Boolean)
  if (lowered.length === 0) return { matching_commits: 0, median_gap_hours: null, recent_commits: [] }

  const matches = lines
    .map(l => {
      const [ts, sha, ...rest] = l.split('|')
      const subject = rest.join('|')
      return { ts: Number(ts), sha, subject }
    })
    .filter(c => {
      const s = c.subject.toLowerCase()
      return lowered.some(k => s.includes(k))
    })
    .sort((a, b) => a.ts - b.ts)

  if (matches.length < 2) {
    return { matching_commits: matches.length, median_gap_hours: null, recent_commits: matches.slice(-5).reverse() }
  }
  // Group commits into work sessions: gap > 6h breaks the session.
  const SESSION_GAP_S = 6 * 3600
  const sessions: number[][] = [[matches[0].ts]]
  for (let i = 1; i < matches.length; i++) {
    const gap = matches[i].ts - matches[i - 1].ts
    if (gap > SESSION_GAP_S) sessions.push([matches[i].ts])
    else sessions[sessions.length - 1].push(matches[i].ts)
  }
  // Session duration = (max - min) + 0.5h cushion for the first commit.
  // Single-commit sessions = 0.5h baseline (typical small fix).
  const sessionHours = sessions.map(s => {
    if (s.length === 1) return 0.5
    return (s[s.length - 1] - s[0]) / 3600 + 0.5
  })
  const sortedHours = [...sessionHours].sort((a, b) => a - b)
  const median = quantile(sortedHours, 0.5)
  return {
    matching_commits: matches.length,
    median_gap_hours: Math.round(median * 10) / 10,
    recent_commits: matches.slice(-5).reverse(),
  }
}

// Deterministic last-resort baselines, derived from observed historical
// patterns. Tweaked monthly as the service_requests table fills in.
const BASELINE_FIX: Record<string, [number, number]> = {
  // [low, high] in hours
  'anc-services/tickets': [0.5, 2],
  'anc-services/design-requests': [0.5, 2.5],
  'anc-services/venues': [0.5, 3],
  'anc-services/events': [1, 4],
  'anc-services/walkthroughs': [0.5, 2],
  'anc-services/maintenance': [0.5, 2],
  'anc-services/staff': [0.5, 2.5],
  'anc-services/reports': [1, 3],
  'anc-services/operations-tables': [1, 4],
  'anc-services/auth': [0.5, 2],
  'anc-services/slack-bot': [0.5, 2],
  'rag2/proposal-engine': [1, 4],
  'rag2/product-catalog': [1, 3],
  'rag2/copilot': [1, 3],
  'twenty-crm/crm': [0.5, 2],
  'twenty-crm/crm-views': [0.5, 2],
  'twenty-crm/crm-skills': [1, 3],
  'anc-kb/docs': [0.5, 2],
  '_default': [1, 3],
}

const BASELINE_NEW: Record<string, [number, number]> = {
  'anc-services/tickets': [4, 12],
  'anc-services/design-requests': [4, 16],
  'anc-services/venues': [4, 16],
  'anc-services/events': [6, 20],
  'anc-services/walkthroughs': [4, 12],
  'anc-services/maintenance': [4, 12],
  'anc-services/staff': [4, 12],
  'anc-services/reports': [3, 10],
  'anc-services/operations-tables': [8, 30],
  'anc-services/auth': [4, 12],
  'anc-services/slack-bot': [3, 8],
  'rag2/proposal-engine': [8, 30],
  'rag2/product-catalog': [4, 16],
  'rag2/copilot': [6, 20],
  'twenty-crm/crm': [3, 12],
  'twenty-crm/crm-views': [2, 6],
  'twenty-crm/crm-skills': [4, 12],
  'anc-kb/docs': [2, 8],
  '_default': [4, 16],
}

async function estimate(
  classification: Classification,
  repo: string | null,
  area: string | null,
  keywords: string[],
): Promise<TriageOutput['estimate']> {
  const key = repo && area ? `${repo}/${area}` : '_default'

  // 1. DB priors
  if (repo && area) {
    const r = await query(
      `SELECT actual_hours FROM service_requests
       WHERE classification = $1 AND repo = $2 AND area = $3
         AND status = 'shipped' AND actual_hours IS NOT NULL
       ORDER BY shipped_at DESC LIMIT 30`,
      [classification, repo, area],
    )
    if (r.rows.length >= 3) {
      const hours = r.rows.map(row => Number(row.actual_hours)).filter(n => Number.isFinite(n) && n > 0).sort((a, b) => a - b)
      if (hours.length >= 3) {
        const low = quantile(hours, 0.25)
        const median = quantile(hours, 0.5)
        const high = quantile(hours, 0.75)
        return {
          hours_low: Math.round(low * 10) / 10,
          hours_high: Math.round(high * 10) / 10,
          hours_point: Math.round(median * 10) / 10,
          sample_size: hours.length,
          source: 'db_priors',
          basis: `P25–P75 of ${hours.length} past ${classification} requests in ${key} (median ${Math.round(median * 10) / 10}h, range ${hours[0]}–${hours[hours.length - 1]}h).`,
        }
      }
    }
  }

  // 2. Git log of similar commits (FIX only — git history is mostly fixes/iterations)
  if (classification === 'FIX' && repo && keywords.length > 0) {
    const sample = sampleGitLog(repo, keywords)
    if (sample.matching_commits >= 2 && sample.median_gap_hours) {
      // Use the median session length as the point estimate, with ±50% range.
      const point = sample.median_gap_hours
      return {
        hours_low: Math.max(0.25, Math.round(point * 0.5 * 10) / 10),
        hours_high: Math.round(point * 1.5 * 10) / 10,
        hours_point: point,
        sample_size: sample.matching_commits,
        source: 'git_log',
        basis: `Median session length across ${sample.matching_commits} matching commits in ${repo} (last 180 days). Recent: ${sample.recent_commits.slice(0, 3).map(c => c.sha.slice(0, 7)).join(', ')}.`,
      }
    }
  }

  // 3. Deterministic baseline
  const table = classification === 'NEW' ? BASELINE_NEW : BASELINE_FIX
  const [low, high] = table[key] || table['_default']
  return {
    hours_low: low,
    hours_high: high,
    hours_point: Math.round((low + high) / 2 * 10) / 10,
    sample_size: 0,
    source: 'baseline',
    basis: `No prior data for ${key} yet — using observed-history baseline. Estimate will tighten as the request log fills in.`,
  }
}

// ---------- Stakeholder mini-report ----------

// Paste-ready message Ahmad sends back to the requester. Stakeholder voice:
// terse, no internal names, configuration framing, no `>` blockquotes,
// asks for explicit approval. Format intentionally identical across the
// three classifications so requesters learn to read it fast.
function buildStakeholderMessage(
  classification: Classification,
  summary: string,
  estimate: TriageOutput['estimate'],
  retainer_covered: boolean,
): string {
  const range = `${estimate.hours_low}–${estimate.hours_high} hrs`
  const basis = estimate.source === 'db_priors'
    ? `based on ${estimate.sample_size} past similar requests (median ${estimate.hours_point} hr)`
    : estimate.source === 'git_log'
      ? `derived from ${estimate.sample_size} comparable past ship sessions (median ${estimate.hours_point} hr)`
      : `against the observed-history baseline for this area`
  const summaryLine = summary.length > 110 ? summary.slice(0, 107) + '...' : summary

  if (classification === 'FIX') {
    return [
      `On ${summaryLine.toLowerCase().replace(/\.$/, '')} — read it, here's the triage.`,
      ``,
      `Type: fix on already-shipped functionality`,
      `Coverage: under the service contract retainer (and inside the 30-day warranty if the affected feature shipped within the last month)`,
      `Estimate: ${range}, ${basis}`,
      `Plan: ship the fix today, deduct the actual hours from this month's 12-hr cap`,
      ``,
      `Approve to proceed, or push back if I'm reading it wrong.`,
    ].join('\n')
  }

  if (classification === 'NEW') {
    return [
      `On ${summaryLine.toLowerCase().replace(/\.$/, '')} — read it, here's the triage.`,
      ``,
      `Type: new build — outside what's already shipped`,
      `Coverage: outside the service contract retainer — change-order territory`,
      `Estimate: ${range}, ${basis}`,
      `Plan: scope doc tonight, fixed-price quote within 24 hrs, no work starts until the number is approved`,
      ``,
      `Approve the scope-doc path, or tell me to drop it.`,
    ].join('\n')
  }

  // MIXED
  return [
    `On ${summaryLine.toLowerCase().replace(/\.$/, '')} — read it, looks like a mix of fix and new build.`,
    ``,
    `Treating the whole request as new-scope until we split it — that keeps the retainer math clean.`,
    `Coverage: outside the service contract retainer until split — change-order territory`,
    `Estimate (rough, full scope): ${range}, ${basis}`,
    `Plan: scope doc tonight that splits the fix-piece (covered) from the new-piece (quoted), back to you in 24 hrs`,
    ``,
    `Approve the split path, or tell me which piece to drop.`,
  ].join('\n')
}

// ---------- Summary ----------

function summarize(text: string): string {
  // Deterministic 1-liner: first non-quoted line, trimmed to ~120 chars.
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('>'))
  const first = lines[0] || text.trim()
  return first.length > 140 ? first.slice(0, 137) + '...' : first
}

// ---------- Public API ----------

export async function triage(input: TriageInput): Promise<TriageOutput> {
  const text = (input.raw_text || '').trim()
  if (!text) throw new Error('raw_text is required')

  const cls = classify(text)
  const area = detectArea(text)
  const retainer_covered = cls.classification === 'FIX' // NEW + MIXED both go to fixed-price quote
  const est = await estimate(cls.classification, area.repo, area.area, area.keywords)
  const summary = summarize(text)

  // For NEW / MIXED classifications, also produce a market-grounded
  // breakdown (US median → outsourcing → contract rate → friendly cushion).
  // FIX work is retainer-covered so no $ quote is generated.
  let marketBreakdown: ReturnType<typeof marketEstimate> | null = null
  let estimatedUSD: number | null = null
  let estimatedHoursForStorage: number | null = est.hours_point
  if (!retainer_covered) {
    const wt = classifyWorkType(text)
    marketBreakdown = marketEstimate(wt.workType, wt.scope)
    estimatedUSD = marketBreakdown.finalUSD
    // Prefer the market-grounded hours over priors-based when we have it,
    // since the market chain reflects scope+efficiency rather than just
    // historical cycle-time.
    estimatedHoursForStorage = marketBreakdown.finalHours
  }

  const project = deriveProject({ repo: area.repo, area: area.area, source: input.source || 'manual', text })

  const r = await query(
    `INSERT INTO service_requests
       (source, source_url, requester, raw_text, summary,
        classification, classification_confidence, classification_basis,
        repo, area, keywords,
        estimated_hours, estimate_basis, retainer_covered,
        status, created_by, market_breakdown, estimated_usd, project, inbox)
     VALUES ($1, $2, $3, $4, $5,
             $6, $7, $8,
             $9, $10, $11,
             $12, $13, $14,
             'open', $15, $16, $17, $18, $19)
     RETURNING id, received_at`,
    [
      input.source || 'manual',
      input.source_url || null,
      input.requester || null,
      text,
      summary,
      cls.classification,
      cls.confidence_score,
      cls.basis,
      area.repo,
      area.area,
      area.keywords,
      estimatedHoursForStorage,
      est.basis,
      retainer_covered,
      input.created_by || null,
      marketBreakdown ? JSON.stringify(marketBreakdown) : null,
      estimatedUSD,
      project,
      Boolean(input.inbox),
    ],
  )
  const row = r.rows[0]

  const next_action = retainer_covered
    ? `Goes against the 12-hr retainer. Estimated ${est.hours_low}–${est.hours_high}h (${est.source === 'db_priors' ? `n=${est.sample_size}` : est.source}). Fix and ship.`
    : `Out of retainer scope — ${cls.classification === 'NEW' ? 'new build' : 'mixed'}. Send fixed-price quote within 24h. Rough estimate ${est.hours_low}–${est.hours_high}h (${est.source}).`

  const stakeholder_message = buildStakeholderMessage(cls.classification, summary, est, retainer_covered)

  return {
    id: row.id,
    received_at: row.received_at instanceof Date ? row.received_at.toISOString() : String(row.received_at),
    classification: cls.classification,
    confidence: cls.confidence,
    confidence_score: cls.confidence_score,
    classification_basis: cls.basis,
    repo: area.repo,
    area: area.area,
    keywords: area.keywords,
    retainer_covered,
    estimate: est,
    summary,
    next_action,
    stakeholder_message,
  }
}

// Map a request to one of the project boards rendered on /service-log.
// Stable contract — see PROJECTS in app/service-log/change-orders/page.tsx and
// the Phase 1 multi-project kanban memo.
export function deriveProject(args: {
  repo?: string | null
  area?: string | null
  source?: string | null
  text?: string | null
}): string {
  const repo = (args.repo || '').toLowerCase()
  const area = (args.area || '').toLowerCase()
  const source = (args.source || '').toLowerCase()
  const text = (args.text || '').toLowerCase()
  if (source === 'auto-push') return 'internal'
  if (area === 'crm' || area === 'crm-views' || area === 'crm-skills' || area === 'crm-reports' || repo === 'twenty-crm') return 'crm'
  if (repo === 'anc-kb' || area === 'docs') return 'kb'
  if (area === 'mirror-mode' || (repo === 'rag2' && /\bmirror\b/.test(text))) return 'mirror-mode'
  if (area === 'proposal-engine' || area === 'product-catalog' || area === 'copilot' || repo === 'rag2') return 'proposal-engine'
  if (area.includes('anything') || area.includes('llm')) return 'anything-llm'
  if (repo === 'anc-services') return 'service-dashboard'
  return 'service-dashboard'
}

// Mark a request as in-progress (sets started_at now if not already set).
export async function markStarted(id: string): Promise<void> {
  await query(
    `UPDATE service_requests
     SET status = 'in_progress',
         started_at = COALESCE(started_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [id],
  )
}

// Mark a request as shipped. actual_hours is required; commit sha optional.
// Triggers retainer-cap alert checks after the update so 90%/100% emails
// fire automatically when a retainer-covered fix tips us past a threshold.
export async function markShipped(
  id: string,
  args: { actual_hours: number; shipped_commit_sha?: string; notes?: string },
): Promise<void> {
  await query(
    `UPDATE service_requests
     SET status = 'shipped',
         shipped_at = NOW(),
         actual_hours = $2,
         shipped_commit_sha = $3,
         notes = COALESCE($4, notes),
         updated_at = NOW()
     WHERE id = $1`,
    [id, args.actual_hours, args.shipped_commit_sha || null, args.notes || null],
  )
  // Fire-and-forget — never block ship on alert plumbing
  ;(async () => {
    try {
      const { checkAndFireRetainerAlerts } = await import('./retainer-alerts')
      await checkAndFireRetainerAlerts()
    } catch (err) {
      console.error('[markShipped] retainer alert check failed:', err)
    }
  })()
}

// Mark NEW request as quoted (separate from retainer).
export async function markQuoted(id: string, args: { quote_amount?: number; notes?: string }): Promise<void> {
  await query(
    `UPDATE service_requests
     SET status = 'quoted',
         quote_amount = COALESCE($3::numeric, quote_amount),
         estimated_usd = COALESCE($3::numeric, estimated_usd),
         notes = CASE WHEN $2::text IS NOT NULL THEN $2::text ELSE notes END,
         updated_at = NOW()
     WHERE id = $1`,
    [id, args.notes || null, args.quote_amount || null],
  )
}

// Mark a quoted change order as approved by the stakeholder.
export async function markApproved(id: string): Promise<void> {
  await query(
    `UPDATE service_requests
     SET status = 'approved',
         approved_at = COALESCE(approved_at, NOW()),
         updated_at = NOW()
     WHERE id = $1`,
    [id],
  )
}

// Mark a shipped change order as paid. paid_amount defaults to quote_amount/estimated_usd.
export async function markPaid(id: string, args: { paid_amount?: number; notes?: string }): Promise<void> {
  await query(
    `UPDATE service_requests
     SET status = 'paid',
         paid_at = NOW(),
         paid_amount = COALESCE($2::numeric, paid_amount, quote_amount, estimated_usd),
         notes = CASE WHEN $3::text IS NOT NULL THEN $3::text ELSE notes END,
         updated_at = NOW()
     WHERE id = $1`,
    [id, args.paid_amount || null, args.notes || null],
  )
}

// Move a change order back one stage. Used when something gets reverted (quote
// rejected, payment bounced, etc.). Order: open → quoted → approved → in_progress → shipped → paid.
export async function revertStage(id: string): Promise<void> {
  await query(
    `UPDATE service_requests
     SET status = CASE status
         WHEN 'paid' THEN 'shipped'
         WHEN 'shipped' THEN 'in_progress'
         WHEN 'in_progress' THEN 'approved'
         WHEN 'approved' THEN 'quoted'
         WHEN 'quoted' THEN 'open'
         ELSE status
       END,
       paid_at = CASE WHEN status = 'paid' THEN NULL ELSE paid_at END,
       shipped_at = CASE WHEN status = 'shipped' THEN NULL ELSE shipped_at END,
       approved_at = CASE WHEN status = 'approved' THEN NULL ELSE approved_at END,
       updated_at = NOW()
     WHERE id = $1`,
    [id],
  )
}

// Hours-this-month vs 12-hr cap.
//
// Retainer math = service-contract bucket only:
//   • classification = FIX        (NEW/MIXED are change orders, separate quote)
//   • retainer_covered = true     (explicit opt-in flag, set by triage)
//   • bucket IN ('service_contract', NULL)   (excludes warranty/change_order/not_billable)
//   • source <> 'auto-push' UNLESS bucket_confirmed = true (auto-push rows
//     stay invisible to the meter until Ahmad approves them via the inbox)
//   • status = 'shipped' with shipped_at this month
//
// hours_used uses actual_hours (real billed time), NOT estimates. Auto-push
// rows have actual_hours = NULL until a human confirms in the inbox.
export async function hoursThisMonth(): Promise<{
  month: string
  hours_used: number
  hours_estimated_open: number
  cap_hours: number
  overage_hours: number
}> {
  const r = await query(
    `SELECT
       COALESCE(SUM(CASE
         WHEN status='shipped'
          AND shipped_at >= DATE_TRUNC('month', NOW())
         THEN actual_hours ELSE 0 END), 0)::float8 AS used,
       COALESCE(SUM(CASE
         WHEN status IN ('open','in_progress')
         THEN estimated_hours ELSE 0 END), 0)::float8 AS open_est
     FROM service_requests
     WHERE classification = 'FIX'
       AND retainer_covered = true
       AND COALESCE(bucket, 'service_contract') = 'service_contract'
       AND COALESCE(bucket_confirmed, false) = true`,
  )
  const used = Number(r.rows[0].used)
  const openEst = Number(r.rows[0].open_est)
  const cap = 12
  return {
    month: new Date().toISOString().slice(0, 7),
    hours_used: Math.round(used * 10) / 10,
    hours_estimated_open: Math.round(openEst * 10) / 10,
    cap_hours: cap,
    overage_hours: Math.max(0, Math.round((used - cap) * 10) / 10),
  }
}
