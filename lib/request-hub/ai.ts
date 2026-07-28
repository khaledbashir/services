// Request Hub — AI assistance. Every function returns *suggestions* that a
// human applies or edits; nothing here writes to a request directly.
// Hard rules: never invent feasibility, effort, cost, deadlines, or technical
// facts — anything not present in the input material must be listed as an
// assumption or unknown, and every rating carries its reason.

import { loadProviders } from '@/lib/ai/agent'
import { query } from '@/lib/db'
import type { HubConfig } from './config'

function extractJson<T>(text: string): T | null {
  const raw = String(text || '').trim()
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenced?.[1] || raw.match(/\{[\s\S]*\}/)?.[0] || raw
  try {
    return JSON.parse(candidate) as T
  } catch {
    return null
  }
}

async function runHubAi<T>(system: string, user: string, maxTokens = 2500): Promise<T | null> {
  const providers = loadProviders()
  for (const provider of providers) {
    try {
      const res = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0.2,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: AbortSignal.timeout(120000),
      })
      if (!res.ok) continue
      const data = await res.json()
      const content = data.choices?.[0]?.message?.content
      const parsed = typeof content === 'string' ? extractJson<T>(content) : null
      if (parsed) return parsed
    } catch (err) {
      console.warn(`[request-hub] AI provider ${provider.name} failed:`, err)
    }
  }
  return null
}

function requestMaterial(req: {
  type?: string
  title?: string | null
  summary?: string | null
  answers?: Record<string, unknown> | null
  deadline?: string | null
  deadline_reason?: string | null
  constraints_note?: string | null
  venue_name?: string | null
}): string {
  const answers = Object.entries(req.answers || {})
    .filter(([, v]) => v != null && String(v).trim() !== '')
    .map(([k, v]) => `- ${k}: ${String(v)}`)
    .join('\n')
  return [
    `Type: ${req.type || 'unknown'}`,
    req.title ? `Title: ${req.title}` : null,
    req.summary ? `Summary: ${req.summary}` : null,
    req.deadline ? `Stated deadline: ${req.deadline}${req.deadline_reason ? ` (reason: ${req.deadline_reason})` : ''}` : null,
    req.constraints_note ? `Must not change: ${req.constraints_note}` : null,
    req.venue_name ? `Venue: ${req.venue_name}` : null,
    'Intake answers:',
    answers || '- (none)',
  ]
    .filter(Boolean)
    .join('\n')
}

// ---------------------------------------------------------------------------
// Intake assist: title, summary, classification, missing info, questions
// ---------------------------------------------------------------------------

export interface IntakeAssist {
  title: string
  summary: string
  classification: { type: string; reason: string; confidence: 'low' | 'medium' | 'high' }
  missing_info: string[]
  clarifying_questions: string[]
}

export async function assistIntake(
  req: Parameters<typeof requestMaterial>[0],
  config: HubConfig
): Promise<IntakeAssist | null> {
  const typeKeys = config.types.map((t) => `"${t.key}" (${t.label})`).join(', ')
  const system = [
    'You help triage internal requests for ANC, a sports-venue technology and media company.',
    'Return strict JSON with keys: title (max 80 chars, plain, specific), summary (2-3 sentences, neutral, no hype),',
    `classification ({type: one of ${typeKeys}, reason, confidence: low|medium|high}),`,
    'missing_info (array of short strings naming information a reviewer would need but the requester did not provide),',
    'clarifying_questions (array of at most 4 plain questions to send the requester, ordered by importance).',
    'Use only what the requester wrote. Never invent systems, dates, or facts. If the material is thin, say so via missing_info.',
  ].join('\n')
  return runHubAi<IntakeAssist>(system, requestMaterial(req), 1500)
}

// ---------------------------------------------------------------------------
// Feasibility brief
// ---------------------------------------------------------------------------

export interface FeasibilityBrief {
  facts: string[]
  assumptions: string[]
  unknowns: string[]
  proposed_scope: string
  dependencies: string[]
  risks: string[]
  feasibility: { rating: string; reason: string }
  effort: { bucket: string; reason: string }
  duration: string
  business_value: { rating: string; reason: string }
  confidence: { rating: string; reason: string }
  recommendation: { action: string; reason: string }
  suggested_reviewer: string
}

export async function draftFeasibilityBrief(
  req: Parameters<typeof requestMaterial>[0] & { request_number?: string | null },
  config: HubConfig,
  extraContext?: string
): Promise<FeasibilityBrief | null> {
  const feas = config.rubric.feasibility.map((l) => `"${l.key}" = ${l.label}: ${l.description}`).join('\n')
  const eff = config.rubric.effort.map((l) => `"${l.key}" = ${l.label}`).join('\n')
  const val = config.rubric.businessValue.map((l) => `"${l.key}" = ${l.label}: ${l.description}`).join('\n')
  const conf = config.rubric.confidence.map((l) => `"${l.key}" = ${l.label}: ${l.description}`).join('\n')

  const system = [
    'You draft a first-pass feasibility brief for an internal request at ANC (sports-venue technology and media).',
    'A human assessor will edit everything you produce. Be honest and conservative.',
    '',
    'HARD RULES:',
    '- "facts" may ONLY contain statements taken directly from the request material or the provided context. Quote or closely paraphrase; never add outside knowledge as fact.',
    '- Anything you infer goes in "assumptions". Anything you cannot know goes in "unknowns".',
    '- Never invent costs, dates, system names, or technical details.',
    '- If the material is too thin to rate something, pick the most conservative rating and say why in the reason.',
    '',
    `Feasibility ratings (use the quoted key):\n${feas}`,
    `Effort buckets (use the quoted key):\n${eff}`,
    `Business value ratings (use the quoted key):\n${val}`,
    `Confidence ratings (use the quoted key):\n${conf}`,
    '',
    'Return strict JSON: { facts: string[], assumptions: string[], unknowns: string[], proposed_scope: string,',
    'dependencies: string[], risks: string[], feasibility: {rating, reason}, effort: {bucket, reason},',
    'duration: string (plain calendar estimate like "about 2 weeks once started", or "unknown"),',
    'business_value: {rating, reason}, confidence: {rating, reason},',
    'recommendation: {action: one of approve|need_info|hold|decline, reason}, suggested_reviewer: string (role or team, not a name) }',
  ].join('\n')

  const user = [requestMaterial(req), extraContext ? `\nAdditional context:\n${extraContext}` : '']
    .join('\n')
  return runHubAi<FeasibilityBrief>(system, user, 3000)
}

// ---------------------------------------------------------------------------
// Duplicate detection — deterministic token overlap over recent requests.
// No AI here on purpose: dedupe should be explainable and cheap.
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(
  'a an the and or of to for in on with is are be can we our it this that from into new add make'.split(' ')
)

function tokens(text: string): Set<string> {
  return new Set(
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  )
}

export interface DuplicateCandidate {
  id: string
  request_number: string | null
  title: string | null
  status: string
  score: number
  overlap: string[]
}

export async function findDuplicateCandidates(
  text: string,
  excludeId?: string | null
): Promise<DuplicateCandidate[]> {
  const target = tokens(text)
  if (target.size === 0) return []
  const res = await query(
    `SELECT id, request_number, title, summary, status
     FROM request_hub_items
     WHERE status NOT IN ('draft', 'declined')
     ORDER BY updated_at DESC LIMIT 300`
  )
  const scored: DuplicateCandidate[] = []
  for (const row of res.rows) {
    if (excludeId && row.id === excludeId) continue
    const other = tokens(`${row.title || ''} ${row.summary || ''}`)
    if (other.size === 0) continue
    const overlap = Array.from(target).filter((t) => other.has(t))
    const score = overlap.length / Math.sqrt(target.size * other.size)
    if (overlap.length >= 2 && score >= 0.25) {
      scored.push({
        id: row.id,
        request_number: row.request_number,
        title: row.title,
        status: row.status,
        score: Math.round(score * 100) / 100,
        overlap: overlap.slice(0, 8),
      })
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 5)
}

// ---------------------------------------------------------------------------
// Slack thread summarization
// ---------------------------------------------------------------------------

export async function summarizeThread(
  messages: { author: string; text: string }[]
): Promise<{ summary: string; asks: string[] } | null> {
  if (messages.length === 0) return null
  const system = [
    'Summarize this internal Slack conversation for a request record.',
    'Return strict JSON: { summary: string (3-5 sentences, neutral, keep names), asks: string[] (concrete requests made in the thread) }.',
    'Only use what is in the messages. Do not speculate about intent beyond what was written.',
  ].join('\n')
  const user = messages.map((m) => `${m.author}: ${m.text}`).join('\n').slice(0, 24000)
  return runHubAi<{ summary: string; asks: string[] }>(system, user, 1200)
}
