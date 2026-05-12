/**
 * Receipt Reasoner — runs over the OCR'd text + extracted fields with a
 * smart reasoning model to (1) canonicalize the vendor name, (2) bucket
 * the category, and (3) decide whether this looks recurring vs one-off
 * given the historical pool the caller passes in.
 *
 * Default model: kimi-k2.6 on Ollama Cloud (good instruction-following,
 * fast, cheap). Swap via env: `RECEIPT_REASONER_MODEL=glm-5.1` etc.
 */

import type { ExtractedReceipt } from '@/lib/receipt-extractor'

export type ReceiptCategory =
  | 'ai'
  | 'cloud'
  | 'domain'
  | 'dev_tool'
  | 'comms'
  | 'storage'
  | 'monitoring'
  | 'other'

export interface ReceiptInsight {
  vendor_canonical: string
  category: ReceiptCategory
  is_recurring_signal: boolean
  recurring_basis: string | null   // e.g. "matches monthly OpenAI charges 2026-02..2026-04"
  reasoner_model: string
}

interface HistoryRow {
  vendor_canonical: string | null
  category: string | null
  paid_at: string | null
  amount_cents: number | null
}

const AI_BASE_URL = process.env.AI_BASE_URL || 'https://ollama.com/v1'
const AI_API_KEY = process.env.AI_API_KEY || ''
const REASONER_MODEL = process.env.RECEIPT_REASONER_MODEL || 'kimi-k2.6'

const CATEGORY_HEURISTICS: Array<{ pattern: RegExp; category: ReceiptCategory }> = [
  { pattern: /openai|anthropic|claude|mistral|cohere|together\.ai|fireworks|ollama|deepseek|kimi|moonshot|replicate|huggingface|elevenlabs|deepgram|assemblyai/i, category: 'ai' },
  { pattern: /google cloud|aws|amazon web services|cloudflare|hetzner|digital ocean|digitalocean|vercel|netlify|fly\.io|render|railway|easypanel|linode|vultr|ovh/i, category: 'cloud' },
  { pattern: /namecheap|godaddy|porkbun|cloudflare registrar|google domains|dynadot|name\.com/i, category: 'domain' },
  { pattern: /github|gitlab|bitbucket|augment|cursor|jetbrains|copilot|sourcegraph|sentry|linear|figma|notion|miro|warp/i, category: 'dev_tool' },
  { pattern: /slack|discord|zoom|twilio|sendgrid|postmark|mailgun|resend|loops|intercom/i, category: 'comms' },
  { pattern: /datadog|newrelic|grafana|honeycomb|logtail|axiom|posthog|mixpanel|amplitude/i, category: 'monitoring' },
  { pattern: /backblaze|wasabi|dropbox|google drive|onedrive|box\.com|aws s3/i, category: 'storage' },
]

function heuristicCategory(vendor: string): ReceiptCategory {
  for (const { pattern, category } of CATEGORY_HEURISTICS) {
    if (pattern.test(vendor)) return category
  }
  return 'other'
}

function canonicalizeFallback(vendor: string | null): string {
  if (!vendor) return 'Unknown'
  return vendor
    .replace(/\b(LLC|Inc\.?|OpCo|Corp\.?|Co\.|Ltd\.?|LP|GmbH|S\.A\.|B\.V\.)\b/gi, '')
    .replace(/[,.]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Unknown'
}

function recurringFromHistory(canonical: string, history: HistoryRow[]): { recurring: boolean; basis: string | null } {
  const matches = history.filter((row) => row.vendor_canonical && row.vendor_canonical.toLowerCase() === canonical.toLowerCase() && row.paid_at)
  if (matches.length < 2) return { recurring: false, basis: null }
  const months = new Set(matches.map((row) => row.paid_at!.slice(0, 7)))
  if (months.size >= 2) {
    const sorted = Array.from(months).sort()
    return { recurring: true, basis: `Charged in ${sorted.length} prior months (${sorted[0]} → ${sorted[sorted.length - 1]})` }
  }
  return { recurring: false, basis: null }
}

export async function reasonAboutReceipt(opts: {
  extracted: ExtractedReceipt
  history: HistoryRow[]
}): Promise<ReceiptInsight> {
  const { extracted, history } = opts
  const vendorRaw = extracted.vendor || ''

  // Fall back to deterministic heuristics if no AI key is set so the
  // upload still works on a dev box without Ollama configured.
  if (!AI_API_KEY) {
    const canonical = canonicalizeFallback(vendorRaw)
    const { recurring, basis } = recurringFromHistory(canonical, history)
    return {
      vendor_canonical: canonical,
      category: heuristicCategory(vendorRaw + ' ' + canonical),
      is_recurring_signal: recurring,
      recurring_basis: basis,
      reasoner_model: 'heuristic',
    }
  }

  const historyDigest = history
    .slice(0, 80)
    .map((row) => `- ${row.vendor_canonical || '?'} | ${row.category || '?'} | ${row.paid_at || '?'} | ${row.amount_cents !== null ? '$' + (row.amount_cents / 100).toFixed(2) : '?'}`)
    .join('\n') || '(no prior receipts yet)'

  const allowedCategories: ReceiptCategory[] = ['ai', 'cloud', 'domain', 'dev_tool', 'comms', 'storage', 'monitoring', 'other']

  const prompt = `You are normalizing a SaaS / cloud receipt for an internal expense ledger.

Raw vendor (from OCR): ${vendorRaw || '(unknown)'}
Amount: ${extracted.amount_cents !== null ? '$' + (extracted.amount_cents / 100).toFixed(2) + ' ' + extracted.currency : 'unknown'}
Paid on: ${extracted.paid_at || 'unknown'}
Invoice number: ${extracted.invoice_number || 'unknown'}

Prior receipts (most recent first), pipe-separated:
${historyDigest}

OCR excerpt (first 1200 chars):
${extracted.raw_text.slice(0, 1200)}

Return ONLY a JSON object with these fields:
{
  "vendor_canonical": "<short clean vendor name, no LLC / Inc / OpCo>",
  "category": "<one of: ${allowedCategories.join(' | ')}>",
  "is_recurring_signal": <true|false — true if this vendor appears 2+ times in history OR the receipt itself reads as a subscription / period of service>,
  "recurring_basis": "<one short sentence on why, or null>"
}`

  try {
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_API_KEY}` },
      body: JSON.stringify({
        model: REASONER_MODEL,
        temperature: 0.1,
        max_tokens: 500,
        messages: [
          { role: 'system', content: 'You output strict JSON. No prose. No markdown fences.' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!res.ok) {
      throw new Error(`Reasoner HTTP ${res.status}`)
    }

    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const raw = (data.choices?.[0]?.message?.content || '').trim()
    const clean = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1')
      .trim()
    const match = clean.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Reasoner returned no JSON object')
    const parsed = JSON.parse(match[0]) as Partial<ReceiptInsight>

    const canonical = (typeof parsed.vendor_canonical === 'string' && parsed.vendor_canonical.trim())
      ? parsed.vendor_canonical.trim().slice(0, 80)
      : canonicalizeFallback(vendorRaw)
    const category = (allowedCategories as string[]).includes(parsed.category as string)
      ? (parsed.category as ReceiptCategory)
      : heuristicCategory(vendorRaw + ' ' + canonical)
    const historyVerdict = recurringFromHistory(canonical, history)
    const recurring = typeof parsed.is_recurring_signal === 'boolean'
      ? parsed.is_recurring_signal || historyVerdict.recurring
      : historyVerdict.recurring

    return {
      vendor_canonical: canonical,
      category,
      is_recurring_signal: recurring,
      recurring_basis: parsed.recurring_basis || historyVerdict.basis || null,
      reasoner_model: REASONER_MODEL,
    }
  } catch (err) {
    // Reasoner failed — fall back to deterministic heuristics so the
    // upload pipeline still produces a usable row.
    const canonical = canonicalizeFallback(vendorRaw)
    const { recurring, basis } = recurringFromHistory(canonical, history)
    return {
      vendor_canonical: canonical,
      category: heuristicCategory(vendorRaw + ' ' + canonical),
      is_recurring_signal: recurring,
      recurring_basis: basis,
      reasoner_model: 'heuristic-fallback',
    }
  }
}
