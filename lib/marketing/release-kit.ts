/**
 * Release Kit — drop in a press release or a page of notes, get back everything
 * needed to announce it: the gaps in the source, the story in ANC's voice, the
 * social set, the partner email, ad copy inside publisher character caps, and an
 * internal note.
 *
 * Two rules are load-bearing and enforced on the way out, not just in the prompt:
 *   1. Nothing is invented. Every claim has to trace to the supplied text, and
 *      anything missing is reported as a gap instead of being filled in.
 *   2. Publisher character caps are hard. Ad copy is measured and flagged.
 */
import { loadProviders, type ProviderConfig } from '@/lib/ai/agent'
import { ANC_BRAND_VOICE } from '@/lib/signal/voice'

export type ReleaseGap = {
  severity: 'blocker' | 'check'
  title: string
  detail: string
  quote?: string
}

export type ReleaseKit = {
  title: string
  summary: string
  facts: string[]
  gaps: ReleaseGap[]
  story: { headline: string; dek: string; paragraphs: string[] }
  social: { linkedinCompany: string; linkedinExec: string; shortForm: string }
  email: { subject: string; previewText: string; body: string }
  adCopy: { sponsor: string; headline: string; body: string; cta: string }
  internalNote: string
  suggestedAudience: string
}

/** Publisher caps (SBJ digital spec). Spaces count. */
export const AD_LIMITS = { sponsor: 25, headline: 95, body: 255, cta: 25 } as const

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

const SCHEMA_HINT = `{
  "title": "short internal name for this announcement",
  "summary": "one sentence on what is being announced",
  "facts": ["every concrete fact from the source: numbers, dates, names, titles"],
  "gaps": [{"severity":"blocker|check","title":"...","detail":"...","quote":"the exact text from the source, if any"}],
  "story": {"headline":"...","dek":"one or two sentences","paragraphs":["...","...","..."]},
  "social": {"linkedinCompany":"...","linkedinExec":"...","shortForm":"..."},
  "email": {"subject":"...","previewText":"...","body":"..."},
  "adCopy": {"sponsor":"<=25 chars","headline":"<=95 chars","body":"<=255 chars","cta":"<=25 chars"},
  "internalNote": "short note to staff",
  "suggestedAudience": "which mailing list this should go to"
}`

function buildPrompt(sourceText: string, orgContext: string) {
  return `You are preparing an announcement kit for ANC, a sports and entertainment venue technology company.

${orgContext}

RULES — these override everything else:
- Use ONLY facts present in the SOURCE below. Never invent a number, date, name, title, quote or statistic.
- If something important is missing, incomplete, contradictory or still a placeholder, do NOT fill it in.
  Report it in "gaps" and quote the offending text. Placeholders like "July XX", "[Name]", "TBD",
  broken sentences, and empty contact blocks are exactly what "gaps" is for.
- Mark a gap "blocker" if the announcement should not go out with it unresolved; "check" if it just
  needs confirming.
- Quotes from named people may be reused verbatim from the source. Never write a new quote for a real person.
- Plain, confident, specific language. No marketing filler, no exclamation marks, no em-dash pile-ups.
- Ad copy MUST respect these hard character limits including spaces:
  sponsor ${AD_LIMITS.sponsor}, headline ${AD_LIMITS.headline}, body ${AD_LIMITS.body}, cta ${AD_LIMITS.cta}.
- "linkedinExec" is written in the first person for a senior leader to post from their own account.
- Write for a reader who does not know the industry. No internal tool names, no vendor names.

Return ONE JSON object and nothing else, in exactly this shape:
${SCHEMA_HINT}

SOURCE:
"""
${sourceText.slice(0, 24_000)}
"""`
}

function providerRequestBody(provider: ProviderConfig, messages: ChatMessage[]) {
  const isMercury = provider.name === 'inception-mercury' || provider.model.toLowerCase().includes('mercury')
  const body: Record<string, unknown> = {
    model: provider.model,
    messages,
    temperature: 0.5,
    // Reasoning models spend the budget thinking and then return an empty
    // message if it is tight — keep the ceiling high enough to survive that.
    max_tokens: 16000,
  }
  if (isMercury) {
    body.reasoning_effort = process.env.MERCURY_REASONING_EFFORT || 'medium'
    body.realtime = true
  }
  return body
}

/**
 * Models routinely emit literal newlines inside JSON strings when the value is a
 * multi-paragraph email or story, which is invalid JSON. Walk the text and escape
 * control characters that appear inside a string literal, leaving structure alone.
 */
function escapeControlCharsInStrings(json: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (const ch of json) {
    if (escaped) { out += ch; escaped = false; continue }
    if (ch === '\\') { out += ch; escaped = true; continue }
    if (ch === '"') { inString = !inString; out += ch; continue }
    if (inString) {
      if (ch === '\n') { out += '\\n'; continue }
      if (ch === '\r') { out += '\\r'; continue }
      if (ch === '\t') { out += '\\t'; continue }
      if (ch < ' ') continue          // drop any other stray control byte
    }
    out += ch
  }
  return out
}

function extractJson(text: string): unknown {
  const trimmed = text.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const source = fenced?.[1]?.trim() || trimmed
  const start = source.indexOf('{')
  const end = source.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('The model did not return JSON')
  const body = source.slice(start, end + 1)
  try {
    return JSON.parse(body)
  } catch {
    return JSON.parse(escapeControlCharsInStrings(body))
  }
}

async function callModel(prompt: string): Promise<{ text: string; provider: string; model: string }> {
  const providers = loadProviders()
  if (!providers.length) throw new Error('No AI provider is configured')
  const messages: ChatMessage[] = [
    { role: 'system', content: ANC_BRAND_VOICE },
    { role: 'user', content: prompt },
  ]
  let lastError = ''

  for (const provider of providers) {
    try {
      const res = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
        body: JSON.stringify(providerRequestBody(provider, messages)),
        signal: AbortSignal.timeout(180_000),
      })
      const raw = await res.text()
      if (!res.ok) {
        lastError = `${provider.name} ${res.status}: ${raw.slice(0, 200)}`
        continue
      }
      const data = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> }
      const text = data.choices?.[0]?.message?.content?.trim()
      if (!text) {
        lastError = `${provider.name}: empty response (raise max_tokens for reasoning models)`
        continue
      }
      return { text, provider: provider.name, model: provider.model }
    } catch (err) {
      lastError = `${provider.name}: ${err instanceof Error ? err.message : String(err)}`
    }
  }
  throw new Error(lastError || 'No AI provider responded')
}

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v.trim() : fallback)
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(x => str(x)).filter(Boolean) : []

function normalizeGaps(v: unknown): ReleaseGap[] {
  if (!Array.isArray(v)) return []
  return v.map((raw): ReleaseGap => {
    const g = (raw ?? {}) as Record<string, unknown>
    return {
      severity: str(g.severity) === 'blocker' ? 'blocker' : 'check',
      title: str(g.title),
      detail: str(g.detail),
      quote: str(g.quote) || undefined,
    }
  }).filter(g => g.title || g.detail)
}

/** Ad fields are hard-capped by the publisher — trim rather than ship an overrun. */
function capAdCopy(v: unknown) {
  const a = (v ?? {}) as Record<string, unknown>
  const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, '').trim())
  return {
    sponsor: clip(str(a.sponsor) || 'ANC', AD_LIMITS.sponsor),
    headline: clip(str(a.headline), AD_LIMITS.headline),
    body: clip(str(a.body), AD_LIMITS.body),
    cta: clip(str(a.cta) || 'Learn more', AD_LIMITS.cta),
  }
}

function normalize(parsed: unknown): ReleaseKit {
  const r = (parsed ?? {}) as Record<string, unknown>
  const story = (r.story ?? {}) as Record<string, unknown>
  const social = (r.social ?? {}) as Record<string, unknown>
  const email = (r.email ?? {}) as Record<string, unknown>
  return {
    title: str(r.title) || 'Untitled announcement',
    summary: str(r.summary),
    facts: list(r.facts),
    gaps: normalizeGaps(r.gaps),
    story: {
      headline: str(story.headline),
      dek: str(story.dek),
      paragraphs: list(story.paragraphs),
    },
    social: {
      linkedinCompany: str(social.linkedinCompany),
      linkedinExec: str(social.linkedinExec),
      shortForm: str(social.shortForm),
    },
    email: {
      subject: str(email.subject),
      previewText: str(email.previewText),
      body: str(email.body),
    },
    adCopy: capAdCopy(r.adCopy),
    internalNote: str(r.internalNote),
    suggestedAudience: str(r.suggestedAudience),
  }
}

export async function generateReleaseKit(sourceText: string, orgContext = ''): Promise<{
  kit: ReleaseKit
  provider: string
  model: string
}> {
  const trimmed = sourceText.trim()
  if (trimmed.length < 80) {
    throw new Error('Add a bit more — paste the notes or the release, or upload the document.')
  }
  const { text, provider, model } = await callModel(buildPrompt(trimmed, orgContext))
  return { kit: normalize(extractJson(text)), provider, model }
}
