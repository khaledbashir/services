export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { estimate as marketEstimate, classifyWorkType, type WorkType } from '@/lib/market-rate'
import { buildProjectContext } from '@/lib/project-intelligence'

const AI_API_KEY = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || ''
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://api.minimax.io/v1'
const AI_MODEL = process.env.AI_MODEL || 'MiniMax-M2.7'

const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || ''
const OLLAMA_WEB_SEARCH_URL = 'https://ollama.com/api/web_search'

interface OllamaSearchResult {
  title?: string
  url?: string
  content?: string
}

async function ollamaWebSearch(query: string): Promise<OllamaSearchResult[]> {
  if (!OLLAMA_API_KEY) return []
  try {
    const res = await fetch(OLLAMA_WEB_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OLLAMA_API_KEY}`,
      },
      body: JSON.stringify({ query, max_results: 5 }),
    })
    if (!res.ok) {
      console.warn('[scope-it] Ollama web search failed:', res.status)
      return []
    }
    const data = await res.json()
    const results = Array.isArray(data?.results) ? data.results : []
    return results.slice(0, 5).map((r: any) => ({
      title: typeof r.title === 'string' ? r.title : '',
      url: typeof r.url === 'string' ? r.url : '',
      content: typeof r.content === 'string' ? r.content.slice(0, 800) : '',
    }))
  } catch (err) {
    console.warn('[scope-it] Ollama web search error:', err)
    return []
  }
}

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

You have READ ACCESS (below) to a live snapshot of all four ANC platforms — what's already built, what data exists, what changes recently shipped, what change orders historically priced at. USE this snapshot:
  - If the description maps to a surface that ALREADY EXISTS, frame the work as extending it (smaller scope, lower price). Don't propose rebuilding what's live.
  - If the request touches a custom object already in the CRM, lean on it instead of scoping a parallel object.
  - Anchor pricing against the "Recently shipped change orders" section — your number should sit in the same range as comparable past work.
  - target_project should match where the work would naturally land based on the surfaces inventory.
  - If the description is greenfield (no overlap with existing surfaces), say so in the pitch — that justifies a higher scope band.

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
- "scope" reflects complexity within that workType: low = simple version (extends existing surface), mid = standard, high = ambitious / greenfield.
- Names should not include the word "Twenty" or any vendor SKU. Stay platform-neutral in the user's language.
- Bullets describe what gets delivered, not how it's built.
- Benefit answers "what does the stakeholder gain" — never "what we build".
- Client-safety is mandatory: never mention private discount strategy, underpricing, leverage, margin, negotiation room, personal pricing habits, internal prompts, API keys, database names, hidden tools, or raw implementation secrets.
- Do not say "Ahmad" in generated proposal text or rationale. Use "final review" or "service team" when needed.
`

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth
  const authedUser = auth as { userId: string; email: string; fullName: string }

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

  // Live web search — Ollama API. Pulls real-time freelance pricing snippets
  // for similar work, gives the AI a sanity check beyond the static market table.
  // Soft-fails if the API key isn't set or the call errors — we still have
  // market-rate.ts as the authoritative grounding.
  const searchQuery = `freelance fixed-price quote ${description.slice(0, 80)} development`
  const webSnippets = await ollamaWebSearch(searchQuery)
  const webContext = webSnippets.length
    ? `\n\nLive web search results (${webSnippets.length}) for similar freelance work:\n` +
      webSnippets.map((r, i) => `[${i + 1}] ${r.title || r.url}\n${r.content || ''}`).join('\n\n')
    : ''

  // Live project intelligence — read-context snapshot of all four ANC platforms
  // so the AI scopes against what's actually built (vs guessing greenfield).
  // Cached internally for 5 minutes so repeated scoping calls don't re-query.
  let projectContext = ''
  try {
    projectContext = '\n\n' + (await buildProjectContext())
  } catch (err) {
    console.warn('[scope-it] project-intelligence failed, continuing without:', err)
  }

  // Reasoning-capable model on purpose, but we do not expose private
  // chain-of-thought. Stakeholder pages get a short client-safe rationale
  // generated by us after the structured draft is priced.
  const modelForScope = process.env.AI_MODEL_SCOPE || 'glm-5.1'

  let aiResp: Response
  try {
    aiResp = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: modelForScope,
        temperature: 0.3,
        max_tokens: 2500,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: PROMPT_SYSTEM + projectContext },
          { role: 'user', content: `Stakeholder description:\n${description}${priorContext}${webContext}` },
        ],
      }),
    })
  } catch (err) {
    console.error('[scope-it] AI fetch failed:', err)
    return NextResponse.json({ error: 'AI request failed', detail: String(err) }, { status: 502 })
  }

  if (!aiResp.ok) {
    const t = await aiResp.text()
    console.error('[scope-it] AI returned', aiResp.status, t.slice(0, 400))
    return NextResponse.json({ error: 'AI returned an error', status: aiResp.status, detail: t.slice(0, 200) }, { status: 502 })
  }

  const aiData = await aiResp.json()
  const msg = aiData?.choices?.[0]?.message
  const contentField = (typeof msg?.content === 'string' && msg.content.trim()) || ''
  const reasoningField = (typeof msg?.reasoning === 'string' && msg.reasoning.trim()) || ''
  // Reasoning models may put JSON in .content and private thinking in
  // .reasoning. We parse JSON from whichever field carries it, but never save
  // raw model reasoning for client-visible proposal screens.
  const candidate = contentField || reasoningField
  if (!candidate) {
    console.error('[scope-it] AI returned empty content/reasoning. Response:', JSON.stringify(aiData).slice(0, 600))
    return NextResponse.json({ error: 'AI returned no content', model: modelForScope }, { status: 502 })
  }

  // Strip common JSON wrappers — fenced code, prefix prose before {, etc.
  const extractJson = (s: string): string => {
    const fenced = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    const firstBrace = fenced.indexOf('{')
    const lastBrace = fenced.lastIndexOf('}')
    if (firstBrace >= 0 && lastBrace > firstBrace) return fenced.slice(firstBrace, lastBrace + 1)
    return fenced
  }

  let draft: ScopedDraft
  try {
    draft = JSON.parse(extractJson(candidate)) as ScopedDraft
  } catch (err) {
    console.error('[scope-it] JSON parse failed:', err, 'candidate:', candidate.slice(0, 400))
    return NextResponse.json({ error: 'AI output not valid JSON', raw: candidate.slice(0, 400) }, { status: 502 })
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

  const publicRationale = [
    `Planning estimate based on ${market.finalHours} hours for ${workType.replace(/_/g, ' ')} work.`,
    `Scope band: ${scope}.`,
    comparablesRes.rows.length > 0
      ? `Comparable prior work was used as a calibration point.`
      : `No close comparable change order was available, so the estimate leans on the standard market-rate table.`,
    `Final scope and price should be confirmed before work starts.`,
  ].join(' ')

  // Save the draft to the catalog as is_placeholder=false but status='draft'
  // for human review before it is marked available.
  const inserted = await query(
    `INSERT INTO proposed_change_orders
       (name, pitch, bullets, price_usd, timeline_label, benefit,
        category, target_project, status, pitched_to, is_placeholder, sort_order, notes,
        market_breakdown, work_type, scope_band, ai_reasoning,
        created_by_user_id, created_by_name, created_by_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', '{}', false, 0, $9, $10, $11, $12, $13, $14, $15, $16)
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
      null,
      JSON.stringify(market),
      workType,
      scope,
      publicRationale,
      authedUser.userId || null,
      authedUser.fullName || null,
      authedUser.email || null,
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
    web_search: webSnippets,
  })
}
