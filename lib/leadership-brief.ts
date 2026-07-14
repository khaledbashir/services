/**
 * Leadership brief — keeps Jireh, Joe, and Jerry current on what shipped,
 * without anyone writing an update.
 *
 * The push hook already records every shipped commit into `service_requests`
 * (source='auto-push'). Those rows are engineering shorthand, so this module
 * turns them into something a COO reads: outcome first, no tooling, no repo
 * names, no commit-speak. Published to the Leadership hub's "What's new" feed
 * and summarised in a weekly digest.
 *
 * Two hard rules are enforced in code, not left to the model:
 *   1. No vendor/stack name ever reaches a leadership surface.
 *   2. Anything the model can't state as a business outcome is dropped, not
 *      guessed at — a missing update beats a wrong one.
 */

import { query } from '@/lib/db'

const AI_BASE_URL = process.env.AI_BASE_URL || 'https://ollama.com/v1'
const AI_API_KEY = process.env.AI_API_KEY || ''
const BRIEF_MODEL = process.env.LEADERSHIP_BRIEF_MODEL || 'kimi-k2.6'

/**
 * Names that must never appear in front of leadership. If a generated line
 * contains one, the line is rejected outright rather than patched — a leaked
 * vendor name is how the "why are we paying for open source?" conversation
 * starts.
 */
const FORBIDDEN = [
  'twenty', 'nocodb', 'baserow', 'airtable', 'wrike', 'anythingllm', 'openclaw', 'claw',
  'boyka', 'scout', 'hermes', 'elevenlabs', 'convai', 'ollama', 'anthropic', 'openai',
  'gpt', 'claude', 'gemini', 'kimi', 'supabase', 'postgres', 'mysql', 'sqlite',
  'hetzner', 'vps', 'easypanel', 'docker', 'vercel', 'netlify', 'next.js', 'nextjs',
  'react', 'tailwind', 'fumadocs', 'salesforce', 'github', 'git ', 'commit', 'repo',
  'sendgrid', 'zapier', 'cron', 'inbox-zero', 'libredesk', 'minio', 'ftp', 'sftp',
  'api', 'endpoint', 'database', 'schema', 'deploy', 'branch', 'typescript', 'sql',
]

function containsForbidden(text: string): boolean {
  const lower = ` ${text.toLowerCase()} `
  return FORBIDDEN.some((term) => lower.includes(term))
}

/** Which platform card an item belongs to on the hub. */
function platformKeyFor(repo: string | null, area: string | null): string {
  if (repo === 'rag2') return 'proposals'
  if (area === 'operations-tables') return 'ops'
  if (area === 'marketing') return 'marketing'
  if (area === 'proposal-engine') return 'proposals'
  if (area === 'project-schedule' || area === 'projects') return 'projects'
  if (repo === 'anc-kb') return 'docs'
  return 'services'
}

export type ShippedItem = {
  id: string
  summary: string
  repo: string | null
  area: string | null
  shippedAt: string
}

export type BriefEntry = {
  sourceIds: string[]
  platformKey: string
  title: string
  detail: string
}

/** Shipped work that hasn't been published to the leadership feed yet. */
export async function getUnpublishedShips(sinceDays = 14): Promise<ShippedItem[]> {
  await ensureBriefColumns()
  const result = await query(
    `SELECT id, summary, repo, area, shipped_at
     FROM service_requests
     WHERE source = 'auto-push'
       AND status = 'shipped'
       AND shipped_at > NOW() - ($1 || ' days')::interval
       AND brief_published_at IS NULL
     ORDER BY shipped_at ASC`,
    [String(sinceDays)]
  )
  return result.rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    summary: String(row.summary || ''),
    repo: (row.repo as string) || null,
    area: (row.area as string) || null,
    shippedAt: new Date(row.shipped_at as string).toISOString(),
  }))
}

export async function ensureBriefColumns() {
  await query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS brief_published_at TIMESTAMPTZ`)
}

/**
 * Turn a batch of shipped items into leadership-facing entries. Items that
 * describe the same capability are merged, and pure plumbing is dropped.
 */
export async function summariseForLeadership(items: ShippedItem[]): Promise<BriefEntry[]> {
  if (items.length === 0) return []
  if (!AI_API_KEY) {
    console.warn('[leadership-brief] AI_API_KEY missing — skipping summarisation')
    return []
  }

  const numbered = items
    .map((item, i) => `${i + 1}. [${item.area || 'platform'}] ${item.summary}`)
    .join('\n')

  const prompt = `You write the "what's new" feed a sports-technology company's executives (COO, President) read. They are NOT technical.

Below is a list of work that shipped on ANC's internal platforms, written in engineering shorthand.

Rewrite it as executive-facing entries.

RULES — these are absolute:
- Describe the OUTCOME for the business or the team, never the implementation.
- NEVER mention any software product, vendor, framework, database, language, or infrastructure. No tool names of any kind.
- Never say: code, commit, repository, deploy, API, database, schema, endpoint, bug fix, refactor.
- Say "the platform", "the CRM", "the service dashboard", "the proposal tools", "the marketing hub" — nothing more specific.
- Merge related items into one entry. Drop anything that is pure internal plumbing with no business meaning.
- Title: max 8 words, plain English, no punctuation at the end.
- Detail: ONE sentence, max 30 words, stating what people can now do or what got better.
- Tone: calm, factual, confident. No hype, no exclamation marks.

Work that shipped:
${numbered}

Return ONLY a JSON array, no prose, no markdown fences:
[{"items":[1,3],"title":"...","detail":"..."}]
where "items" lists the numbers from above that the entry covers.`

  try {
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_API_KEY}` },
      body: JSON.stringify({
        model: BRIEF_MODEL,
        temperature: 0.2,
        max_tokens: 1200,
        messages: [
          { role: 'system', content: 'You output strict JSON. No prose. No markdown fences.' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(90_000),
    })
    if (!res.ok) throw new Error(`brief HTTP ${res.status}`)

    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const raw = (data.choices?.[0]?.message?.content || '').trim().replace(/^```(?:json)?|```$/g, '')
    const parsed = JSON.parse(raw) as Array<{ items?: number[]; title?: string; detail?: string }>

    const entries: BriefEntry[] = []
    for (const candidate of parsed) {
      const title = String(candidate.title || '').trim()
      const detail = String(candidate.detail || '').trim()
      const indexes = Array.isArray(candidate.items) ? candidate.items : []
      if (!title || !detail || indexes.length === 0) continue

      // Rule 1, enforced here rather than trusted to the model.
      if (containsForbidden(title) || containsForbidden(detail)) {
        console.warn('[leadership-brief] dropped entry containing a forbidden term:', title)
        continue
      }

      const sources = indexes
        .map((n) => items[n - 1])
        .filter((item): item is ShippedItem => Boolean(item))
      if (sources.length === 0) continue

      entries.push({
        sourceIds: sources.map((s) => s.id),
        platformKey: platformKeyFor(sources[0].repo, sources[0].area),
        title,
        detail,
      })
    }
    return entries
  } catch (err) {
    console.error('[leadership-brief] summarisation failed:', err)
    return []
  }
}

/** Publish entries to the hub feed and mark their source rows as published. */
export async function publishEntries(entries: BriefEntry[]): Promise<number> {
  let published = 0
  for (const entry of entries) {
    await query(
      `INSERT INTO hub_status_entries (platform_key, title, detail)
       VALUES ($1, $2, $3)`,
      [entry.platformKey, entry.title, entry.detail]
    )
    await query(
      `UPDATE service_requests SET brief_published_at = NOW() WHERE id = ANY($1::uuid[])`,
      [entry.sourceIds]
    )
    published += 1
  }
  return published
}

/** Anything the model merged away or dropped still gets marked, so it isn't retried forever. */
export async function markConsumed(items: ShippedItem[]): Promise<void> {
  if (items.length === 0) return
  await query(
    `UPDATE service_requests SET brief_published_at = NOW()
     WHERE id = ANY($1::uuid[]) AND brief_published_at IS NULL`,
    [items.map((i) => i.id)]
  )
}

/** The week's entries, for the digest. */
export async function getWeekEntries(days = 7) {
  const result = await query(
    `SELECT platform_key, title, detail, entry_date
     FROM hub_status_entries
     WHERE created_at > NOW() - ($1 || ' days')::interval
     ORDER BY created_at ASC`,
    [String(days)]
  )
  return result.rows as Array<{
    platform_key: string
    title: string
    detail: string | null
    entry_date: string
  }>
}
