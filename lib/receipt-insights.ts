/**
 * Receipt Insights — server-side analysis of the SaaS/cloud receipt
 * ledger. Pulls every infra_receipts row, builds a structured prompt,
 * asks the Ollama Cloud reasoner for patterns / anomalies / projections.
 *
 * Cached for 5 minutes per process so the AI Insights tab doesn't burn
 * a model call on every page render. Invalidated when a new receipt
 * lands (`invalidateInsights()`).
 */

import { query } from '@/lib/db'

const AI_BASE_URL = process.env.AI_BASE_URL || 'https://ollama.com/v1'
const AI_API_KEY = process.env.AI_API_KEY || ''
const REASONER_MODEL = process.env.RECEIPT_REASONER_MODEL || 'glm-5.1'
const CACHE_TTL_MS = 5 * 60_000

export interface InsightPattern {
  vendor: string
  cadence: string                // e.g. "monthly", "weekly", "irregular"
  typical_amount_usd: number
  last_seen: string
  next_expected: string | null
  total_paid_usd: number
  charge_count: number
}

export interface InsightAnomaly {
  vendor: string
  description: string
  severity: 'high' | 'medium' | 'low'
}

export interface InsightOverlap {
  description: string
  vendors: string[]
}

export interface InsightProjection {
  monthly_run_rate_usd: number
  yearly_projection_usd: number
  note: string
}

export interface ReceiptInsights {
  generated_at: string
  summary: string
  receipt_count: number
  total_paid_usd: number
  recurring_patterns: InsightPattern[]
  anomalies: InsightAnomaly[]
  missing_this_month: Array<{ vendor: string; expected_around: string | null; last_seen: string }>
  overlapping_services: InsightOverlap[]
  projection: InsightProjection
  cost_saving_ideas: string[]
  reasoner_model: string
}

interface CachedInsights {
  data: ReceiptInsights
  expires_at: number
}

let cache: CachedInsights | null = null

export function invalidateInsights() {
  cache = null
}

interface ReceiptRow {
  vendor_canonical: string | null
  vendor_raw: string | null
  category: string | null
  amount_cents: number | null
  paid_at: string | null
  effective_date: string
  invoice_number: string | null
  notes: string | null
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime()
  const db = new Date(b + 'T00:00:00Z').getTime()
  return Math.round((db - da) / 86_400_000)
}

function classifyCadence(intervals: number[]): { cadence: string; avgDays: number } {
  if (intervals.length === 0) return { cadence: 'one-off', avgDays: 0 }
  const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length
  if (avg >= 6 && avg <= 9) return { cadence: 'weekly', avgDays: avg }
  if (avg >= 13 && avg <= 16) return { cadence: 'biweekly', avgDays: avg }
  if (avg >= 25 && avg <= 35) return { cadence: 'monthly', avgDays: avg }
  if (avg >= 85 && avg <= 95) return { cadence: 'quarterly', avgDays: avg }
  if (avg >= 350 && avg <= 380) return { cadence: 'yearly', avgDays: avg }
  return { cadence: 'irregular', avgDays: avg }
}

function projectNextCharge(lastSeen: string, avgDays: number): string | null {
  if (!avgDays || avgDays <= 0) return null
  const next = new Date(lastSeen + 'T00:00:00Z')
  next.setDate(next.getDate() + Math.round(avgDays))
  return next.toISOString().slice(0, 10)
}

function buildDeterministicInsights(rows: ReceiptRow[]): ReceiptInsights {
  const totalPaidCents = rows.reduce((s, r) => s + (r.amount_cents || 0), 0)
  const byVendor = new Map<string, ReceiptRow[]>()
  for (const row of rows) {
    const key = (row.vendor_canonical || row.vendor_raw || 'Unknown').trim()
    if (!byVendor.has(key)) byVendor.set(key, [])
    byVendor.get(key)!.push(row)
  }

  // Sort each vendor's rows by date
  for (const list of byVendor.values()) {
    list.sort((a, b) => (a.effective_date || '').localeCompare(b.effective_date || ''))
  }

  const recurring_patterns: InsightPattern[] = []
  const anomalies: InsightAnomaly[] = []

  for (const [vendor, list] of byVendor.entries()) {
    if (list.length < 2) continue
    const dates = list.map((r) => r.effective_date).filter(Boolean)
    if (dates.length < 2) continue
    const intervals: number[] = []
    for (let i = 1; i < dates.length; i++) intervals.push(daysBetween(dates[i - 1], dates[i]))
    const { cadence, avgDays } = classifyCadence(intervals)
    const amounts = list.map((r) => (r.amount_cents || 0) / 100).filter((v) => v > 0)
    const med = median(amounts)
    const last = list[list.length - 1]
    recurring_patterns.push({
      vendor,
      cadence,
      typical_amount_usd: med,
      last_seen: last.effective_date,
      next_expected: projectNextCharge(last.effective_date, avgDays),
      total_paid_usd: amounts.reduce((s, v) => s + v, 0),
      charge_count: list.length,
    })

    // Anomaly: a single charge >2× the median amount for this vendor
    for (const row of list) {
      const amt = (row.amount_cents || 0) / 100
      if (med > 0 && amt > med * 2) {
        anomalies.push({
          vendor,
          description: `${row.effective_date}: $${amt.toFixed(2)} — more than 2× the typical $${med.toFixed(2)} for this vendor`,
          severity: amt > med * 4 ? 'high' : 'medium',
        })
      }
    }
  }

  recurring_patterns.sort((a, b) => b.total_paid_usd - a.total_paid_usd)
  anomalies.sort((a, b) => (a.severity === 'high' ? -1 : 1) - (b.severity === 'high' ? -1 : 1))

  // Missing this month: vendor charged in 2+ recent months but not this month
  const today = new Date()
  const thisMonth = today.toISOString().slice(0, 7)
  const monthAgo = new Date(today); monthAgo.setMonth(monthAgo.getMonth() - 2)
  const cutoffMonth = monthAgo.toISOString().slice(0, 7)
  const missing: Array<{ vendor: string; expected_around: string | null; last_seen: string }> = []
  for (const [vendor, list] of byVendor.entries()) {
    if (list.length < 2) continue
    const months = new Set(list.map((r) => (r.effective_date || '').slice(0, 7)).filter(Boolean))
    if (months.size < 2) continue
    if (months.has(thisMonth)) continue
    const lastMonth = [...months].sort()[months.size - 1]
    if (lastMonth < cutoffMonth) continue
    const pattern = recurring_patterns.find((p) => p.vendor === vendor)
    missing.push({
      vendor,
      expected_around: pattern?.next_expected || null,
      last_seen: list[list.length - 1].effective_date,
    })
  }

  // Projection: rolling 90-day rate → monthly + yearly
  const cutoff90 = new Date(today); cutoff90.setDate(cutoff90.getDate() - 90)
  const recent = rows.filter((r) => r.effective_date && new Date(r.effective_date) >= cutoff90)
  const recentSum = recent.reduce((s, r) => s + (r.amount_cents || 0), 0) / 100
  const monthly_run_rate_usd = (recentSum / 3) || 0
  const yearly_projection_usd = monthly_run_rate_usd * 12

  // Overlapping services — vendors in the same category that often pair up
  const byCategory = new Map<string, Set<string>>()
  for (const [vendor, list] of byVendor.entries()) {
    const cat = list[0].category || 'other'
    if (!byCategory.has(cat)) byCategory.set(cat, new Set())
    byCategory.get(cat)!.add(vendor)
  }
  const overlaps: InsightOverlap[] = []
  for (const [cat, vendors] of byCategory.entries()) {
    if (vendors.size >= 2 && cat !== 'other') {
      overlaps.push({
        description: `${vendors.size} vendors in the ${cat.replace('_', ' ')} category — worth checking if all are still needed`,
        vendors: Array.from(vendors),
      })
    }
  }

  return {
    generated_at: new Date().toISOString(),
    summary: `${rows.length} receipt${rows.length === 1 ? '' : 's'} logged · $${(totalPaidCents / 100).toFixed(2)} total · ${recurring_patterns.length} recurring vendor${recurring_patterns.length === 1 ? '' : 's'}.`,
    receipt_count: rows.length,
    total_paid_usd: totalPaidCents / 100,
    recurring_patterns,
    anomalies,
    missing_this_month: missing,
    overlapping_services: overlaps,
    projection: {
      monthly_run_rate_usd,
      yearly_projection_usd,
      note: `Based on the trailing 90 days ($${recentSum.toFixed(2)} across ${recent.length} receipts).`,
    },
    cost_saving_ideas: [],
    reasoner_model: 'deterministic',
  }
}

async function enrichWithAiSummary(insights: ReceiptInsights, rows: ReceiptRow[]): Promise<ReceiptInsights> {
  if (!AI_API_KEY) return insights
  if (rows.length === 0) return insights

  const topVendors = insights.recurring_patterns.slice(0, 10)
  const prompt = `You are reviewing a small business's SaaS / cloud expense ledger. ${rows.length} receipts totaling $${insights.total_paid_usd.toFixed(2)}.

Recurring vendors (top by spend):
${topVendors.map((p) => `- ${p.vendor}: ${p.cadence}, typical $${p.typical_amount_usd.toFixed(2)}, ${p.charge_count} charges, $${p.total_paid_usd.toFixed(2)} total`).join('\n') || '(none yet)'}

Anomalies found:
${insights.anomalies.slice(0, 5).map((a) => `- ${a.vendor}: ${a.description}`).join('\n') || '(none)'}

Missing this month:
${insights.missing_this_month.map((m) => `- ${m.vendor} (last ${m.last_seen}${m.expected_around ? `, expected around ${m.expected_around}` : ''})`).join('\n') || '(none)'}

Trailing 90-day rate: $${insights.projection.monthly_run_rate_usd.toFixed(2)}/mo → $${insights.projection.yearly_projection_usd.toFixed(2)}/year.

Return JSON only:
{
  "summary": "<2-3 sentence executive summary of the spend picture, what to watch>",
  "cost_saving_ideas": ["<idea 1>", "<idea 2>", "<idea 3>"]
}

cost_saving_ideas should be SPECIFIC to the vendors above (e.g. "Cursor and Augment overlap on AI code assist — pick one") rather than generic advice.`

  try {
    const res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_API_KEY}` },
      body: JSON.stringify({
        model: REASONER_MODEL,
        temperature: 0.2,
        max_tokens: 800,
        messages: [
          { role: 'system', content: 'You output strict JSON. No prose, no markdown fences.' },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const raw = (data.choices?.[0]?.message?.content || '').trim()
    const clean = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1')
      .trim()
    const match = clean.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('No JSON object in response')
    const parsed = JSON.parse(match[0]) as { summary?: string; cost_saving_ideas?: string[] }
    return {
      ...insights,
      summary: parsed.summary || insights.summary,
      cost_saving_ideas: Array.isArray(parsed.cost_saving_ideas) ? parsed.cost_saving_ideas.slice(0, 6).map(String) : [],
      reasoner_model: REASONER_MODEL,
    }
  } catch {
    return insights
  }
}

export async function getReceiptInsights(opts: { force?: boolean } = {}): Promise<ReceiptInsights> {
  if (!opts.force && cache && cache.expires_at > Date.now()) return cache.data

  const result = await query(
    `SELECT
       vendor_canonical, vendor_raw, category,
       amount_cents,
       TO_CHAR(paid_at, 'YYYY-MM-DD') as paid_at,
       TO_CHAR(COALESCE(paid_at, created_at::date), 'YYYY-MM-DD') as effective_date,
       invoice_number, notes
     FROM infra_receipts
     ORDER BY COALESCE(paid_at, created_at::date) ASC`
  )
  const rows: ReceiptRow[] = result.rows.map((r) => ({
    vendor_canonical: r.vendor_canonical,
    vendor_raw: r.vendor_raw,
    category: r.category,
    amount_cents: r.amount_cents !== null ? Number(r.amount_cents) : null,
    paid_at: r.paid_at,
    effective_date: r.effective_date,
    invoice_number: r.invoice_number,
    notes: r.notes,
  }))

  const base = buildDeterministicInsights(rows)
  const enriched = await enrichWithAiSummary(base, rows)
  cache = { data: enriched, expires_at: Date.now() + CACHE_TTL_MS }
  return enriched
}
