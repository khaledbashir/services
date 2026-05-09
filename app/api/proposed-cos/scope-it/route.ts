export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { estimate as marketEstimate, classifyWorkType, type WorkType } from '@/lib/market-rate'

const AI_API_KEY = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || ''
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.minimax.io/v1'
const AI_MODEL = process.env.AI_MODEL || 'MiniMax-M2.7'

interface ScopedDraft {
  name: string
  pitch: string
  bullets: string[]
  benefit: string
  category: 'individual' | 'bundle'
  target_project: string
  workType: WorkType
  scope: 'low' | 'mid' | 'high'
}

const PROMPT_SYSTEM = `You are a scope drafter for ANC Sports's service-contract platform. A stakeholder describes an idea, and you turn it into a structured proposal card.

Output ONLY valid JSON matching this schema (no markdown, no commentary):
{
  "name": "string — short product-y name, max 60 chars",
  "pitch": "string — one sentence the stakeholder reads first, 80-150 chars",
  "bullets": ["3-5 short capability bullets, each <80 chars"],
  "benefit": "string — the win for the stakeholder, outcome-led, 80-150 chars",
  "category": "individual" or "bundle",
  "target_project": one of: "service-dashboard" | "proposal-engine" | "crm" | "kb" | "mirror-mode" | "anything-llm" | "cross-platform",
  "workType": one of: "new_feature_small" | "new_feature_medium" | "new_feature_large" | "new_module" | "new_dashboard" | "new_report" | "new_integration" | "new_automation" | "data_migration" | "new_ai_agent",
  "scope": "low" | "mid" | "high"
}

Rules:
- "category" is "bundle" when it's multi-feature OR cross-platform; otherwise "individual".
- Pick the workType that BEST matches what's described. If unsure, lean smaller.
- "scope" reflects complexity within that workType: low = simple version, mid = standard, high = ambitious.
- Names should not include the word "Twenty" or any vendor SKU. Stay platform-neutral in the user's language.
- Bullets describe what gets delivered, not how it's built.
- Benefit answers "what does the stakeholder gain" — never "what we build".
`

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({}))
  const description = String(body.description || '').trim()
  const refineFromId = typeof body.refine_from === 'string' ? body.refine_from : null

  if (!description) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }
  if (!AI_API_KEY) {
    return NextResponse.json({ error: 'AI not configured' }, { status: 500 })
  }

  // If refining an existing draft, prepend its current state as context.
  let priorContext = ''
  if (refineFromId) {
    const r = await query(`SELECT name, pitch, bullets, price_usd, timeline_label, benefit, category, target_project FROM proposed_change_orders WHERE id = $1`, [refineFromId])
    if (r.rows.length > 0) {
      const p = r.rows[0]
      priorContext = `\n\nPrior draft of this proposal:\n${JSON.stringify(p, null, 2)}\n\nThe stakeholder feedback below refines this prior draft.`
    }
  }

  let aiResp: Response
  try {
    aiResp = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature: 0.3,
        max_tokens: 700,
        messages: [
          { role: 'system', content: PROMPT_SYSTEM },
          { role: 'user', content: `Stakeholder description:\n${description}${priorContext}` },
        ],
      }),
    })
  } catch (err) {
    console.error('[scope-it] AI fetch failed:', err)
    return NextResponse.json({ error: 'AI request failed' }, { status: 502 })
  }

  if (!aiResp.ok) {
    const t = await aiResp.text()
    console.error('[scope-it] AI returned', aiResp.status, t.slice(0, 200))
    return NextResponse.json({ error: 'AI returned an error' }, { status: 502 })
  }

  const aiData = await aiResp.json()
  const raw = aiData?.choices?.[0]?.message?.content
  if (!raw || typeof raw !== 'string') {
    return NextResponse.json({ error: 'AI returned no content' }, { status: 502 })
  }

  let draft: ScopedDraft
  try {
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
    draft = JSON.parse(cleaned) as ScopedDraft
  } catch (err) {
    console.error('[scope-it] JSON parse failed:', err, 'raw:', raw.slice(0, 300))
    return NextResponse.json({ error: 'AI output not valid JSON', raw }, { status: 502 })
  }

  // Ground the price + timeline in the market-pricing chain so the AI can't
  // randomly underprice. The AI picks workType + scope; market-rate.ts owns
  // the actual numbers.
  let workType = draft.workType
  let scope = draft.scope
  if (!workType || !scope) {
    const heuristic = classifyWorkType(description)
    workType = workType || heuristic.workType
    scope = scope || heuristic.scope
  }
  const market = marketEstimate(workType, scope)

  // Pull comparable past work — change orders of the same workType that
  // already shipped or were paid. Gives the stakeholder real history to
  // anchor against, not just AI's guess.
  const comparablesRes = await query(
    `SELECT summary, COALESCE(paid_amount, quote_amount, estimated_usd, 0)::float8 AS usd, shipped_at
       FROM service_requests
      WHERE retainer_covered = false
        AND status IN ('shipped', 'paid')
        AND source <> 'auto-push'
      ORDER BY received_at DESC
      LIMIT 6`,
  ).catch(() => ({ rows: [] }))

  // Save the draft to the catalog as is_placeholder=false but status='draft'
  // (so Ahmad reviews before it hits "available"). Tag the source in notes.
  const inserted = await query(
    `INSERT INTO proposed_change_orders
       (name, pitch, bullets, price_usd, timeline_label, benefit,
        category, target_project, status, pitched_to, is_placeholder, sort_order, notes,
        market_breakdown, work_type, scope_band)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', '{}', false, 0, $9, $10, $11, $12)
     RETURNING *`,
    [
      (draft.name || '').slice(0, 200),
      (draft.pitch || '').slice(0, 500),
      Array.isArray(draft.bullets) ? draft.bullets.map((b) => String(b).slice(0, 200)) : [],
      market.finalUSD,
      `${market.finalHours}h${market.finalHours >= 40 ? ` (~${Math.ceil(market.finalHours / 40)} weeks)` : ''}`,
      (draft.benefit || '').slice(0, 500),
      draft.category === 'bundle' ? 'bundle' : 'individual',
      draft.target_project || null,
      `AI-generated from description on ${new Date().toISOString().slice(0, 10)}.\n\nOriginal description:\n${description.slice(0, 1500)}`,
      JSON.stringify(market),
      workType,
      scope,
    ],
  )

  return NextResponse.json({
    ok: true,
    draft: inserted.rows[0],
    market_breakdown: market,
    comparables: comparablesRes.rows.map((r: any) => ({
      summary: r.summary,
      usd: Number(r.usd) || 0,
      shipped_at: r.shipped_at,
    })),
  })
}
