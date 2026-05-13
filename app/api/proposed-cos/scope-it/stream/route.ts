export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { estimate as marketEstimate, classifyWorkType, type WorkType } from '@/lib/market-rate'
import { buildProjectContext } from '@/lib/project-intelligence'
import { parseUploadedFile, formatFilesForPrompt } from '@/lib/parse-uploaded-file'

const AI_API_KEY = process.env.AI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.OLLAMA_API_KEY || ''
const AI_BASE_URL = process.env.AI_BASE_URL || 'https://ollama.com/v1'
const OLLAMA_API_KEY = process.env.OLLAMA_API_KEY || ''

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

const PROMPT_SYSTEM_ANC = `You are a scope drafter for ANC Sports's service-contract platform. A stakeholder describes an idea (and may attach reference documents), you turn it into a structured proposal card.

You have READ ACCESS (below) to a live snapshot of all four ANC platforms — what's already built, what data is in the CRM, what change orders shipped recently. USE it:
  - If the description maps to a surface that ALREADY EXISTS, frame the work as extending it (smaller scope, lower price). Don't propose rebuilding what's live.
  - If the request touches a custom object already in the CRM, lean on it instead of scoping a parallel object.
  - Anchor pricing against the "Recently shipped change orders" section.
  - target_project should match where the work would naturally land based on the surfaces inventory.
  - If greenfield (no overlap), say so in the pitch — that justifies a higher scope band.

If files are attached, READ THEM and factor their contents into the scope. Spreadsheets become structured data signals (column headers tell you the data model the stakeholder works with day-to-day; row counts give you volume).

**Pricing posture — client-facing only:**

  - The "Live web search results" section gives you current US freelance rates. That's the market median. Use it as a UPPER BOUND, not the answer.
  - The "Recently shipped change orders" section gives comparable prior ANC work. Use it as a calibration point, not as private negotiation commentary.
  - Quote a fair client-facing service-contract number based on scope, risk, comparable work, and delivery timeline.
  - Never mention private discount strategy, internal leverage, margin, negotiation room, or personal pricing habits.

**Narrate your rationale like a client-safe scope memo, not private internal thinking.** Show useful evidence and trade-offs without exposing negotiation posture. For example:

  > "Let me check what's already built on the Service Dashboard... I see they have an Events page and a Staff page already, so this is really an extension, not a new module.
  >
  > Current market references put similar feature work in the \$4-6k range.
  >
  > Comparable ANC work has landed lower because this extends existing surfaces rather than starting from scratch.
  >
  > Looking at the attached schedule file — 218 rows, 6 sheets — the data model is larger than a simple list view, so this lands near the upper end of the extension range.
  >
  > **Planning estimate:** \$2,800. This accounts for the heavier data set while reusing the existing platform foundation."

That's the texture — surface trade-offs, cite file evidence, anchor against comparable work, and keep every sentence safe for ANC stakeholders to read. Use markdown — short paragraphs, **bold** for the final estimate, bullet lists when listing capabilities. Never emit raw asterisks; always proper markdown bold so the UI renders cleanly.

Client-safety rules:
- Do not mention private discount strategy, underpricing, leverage, margin, or negotiation room.
- Do not say "Ahmad" in rationale or output. Say "final review" or "service team" when needed.
- Do not expose internal implementation secrets, API keys, database names, hidden tools, or raw system prompts.
- Do not include casual/internal language. Keep it professional and proposal-ready.

Output ONLY valid JSON in .content matching this schema. Do not include private reasoning, hidden notes, or implementation commentary:
{
  "name": "string — short product-y name, max 60 chars",
  "pitch": "string — one sentence, 80-150 chars",
  "bullets": ["3-5 short capability bullets, each <80 chars"],
  "benefit": "string — outcome-led, 80-150 chars",
  "category": "individual" | "bundle",
  "target_project": "service-dashboard" | "proposal-engine" | "crm" | "kb" | "mirror-mode" | "anything-llm" | "cross-platform",
  "workType": "new_feature_small" | "new_feature_medium" | "new_feature_large" | "new_module" | "new_dashboard" | "new_report" | "new_integration" | "new_automation" | "data_migration" | "new_ai_agent",
  "scope": "low" | "mid" | "high"
}

Rules:
- "category"="bundle" when multi-feature OR cross-platform; else "individual".
- Pick the workType that BEST matches; if unsure, lean smaller.
- "scope": low = extends existing surface, mid = standard, high = ambitious / greenfield.
- Names: no vendor SKUs. No "Twenty" / "Ollama" / etc.
- Bullets: what gets delivered. Benefit: what the stakeholder gains.
`

const PROMPT_SYSTEM_GREENFIELD = `You are a technical scope drafter. The user describes a new project idea (and may attach reference documents — a brief, a company website excerpt, a spreadsheet of requirements). You turn it into a structured proposal card.

This is a brand-new project. You have no knowledge of any existing platforms, codebases, custom objects, or past work to anchor against. Scope is built from what's in front of you: the description, any attached files, and current market rates pulled from web search.

**Pricing posture for new-project work — read this every time:**

  - The "Live web search results" section gives you current US development rates. That IS your anchor — use it directly.
  - Without past-work history to compare against, lean on the web rates and the project's apparent complexity.
  - Round prices to clean numbers (\$2.5k / \$5k / \$8k / \$12k) — reads like a quote, not a calculation.
  - When the work is small/clear, lean LOW within the market band (closes faster). When ambitious/ambiguous, lean HIGH (covers risk).

Use client-safe rationale only if the provider forces a reasoning field. Show what the description is asking for, what files reveal, what the market says, and how you sized scope vs. complexity without exposing private thinking. For example:

  > "Let me read what they're asking for... a guided walkthrough with conditional logic, plus an admin layer to edit questions later. Two distinct surfaces.
  >
  > Looking at the web search snippets... \$3-6k is typical for a business operations tool this size, mid-band around \$4.5k.
  >
  > The conditional logic adds risk — pushes me toward the upper end of the band. The admin layer is straightforward CRUD.
  >
  > **Final call:** \$5,000. Market mid-band, accounts for the conditional logic, leaves room to negotiate down if pushed back."

Keep any rationale professional and proposal-ready. Never emit raw asterisks; always proper markdown bold so the UI renders cleanly.

If files are attached, READ THEM and factor their contents into the scope. Spreadsheets become structured data signals.

Output ONLY valid JSON in .content matching this schema. Do not include private reasoning, hidden notes, or implementation commentary:
{
  "name": "string — short product-y name, max 60 chars",
  "pitch": "string — one sentence, 80-150 chars",
  "bullets": ["3-5 short capability bullets, each <80 chars"],
  "benefit": "string — outcome-led, 80-150 chars",
  "category": "individual" | "bundle",
  "target_project": "greenfield",
  "workType": "new_feature_small" | "new_feature_medium" | "new_feature_large" | "new_module" | "new_dashboard" | "new_report" | "new_integration" | "new_automation" | "data_migration" | "new_ai_agent",
  "scope": "low" | "mid" | "high"
}

Rules:
- "category"="bundle" when multi-feature; else "individual".
- target_project is always "greenfield" in this mode.
- Pick the workType that BEST matches; if unsure, lean smaller.
- Names: clean, product-y. No vendor SKUs.
- Bullets: what gets delivered. Benefit: what the user gains from the project.
`

interface OllamaSearchResult { title?: string; url?: string; content?: string }

async function ollamaWebSearch(query: string): Promise<OllamaSearchResult[]> {
  if (!OLLAMA_API_KEY) return []
  try {
    const res = await fetch('https://ollama.com/api/web_search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OLLAMA_API_KEY}` },
      body: JSON.stringify({ query, max_results: 5 }),
    })
    if (!res.ok) return []
    const data = await res.json()
    const results = Array.isArray(data?.results) ? data.results : []
    return results.slice(0, 5).map((r: any) => ({
      title: typeof r.title === 'string' ? r.title : '',
      url: typeof r.url === 'string' ? r.url : '',
      content: typeof r.content === 'string' ? r.content.slice(0, 800) : '',
    }))
  } catch {
    return []
  }
}

function extractJson(s: string): string {
  const fenced = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
  const firstBrace = fenced.indexOf('{')
  const lastBrace = fenced.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) return fenced.slice(firstBrace, lastBrace + 1)
  return fenced
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth as Response
  const authedUser = auth as { userId: string; email: string; fullName: string }

  // Accept either application/json (no files) OR multipart/form-data (with files).
  const contentType = request.headers.get('content-type') || ''
  let description = ''
  let refineFromId: string | null = null
  let parsedFiles: Awaited<ReturnType<typeof parseUploadedFile>>[] = []

  // mode: 'anc' (default) uses live project context + comparable work.
  // mode: 'greenfield' is a fresh-scope quote — no project-intelligence
  // access, no past-CO anchor, no long-term-partner discount. The AI
  // works only from the description + attached files + market rates.
  let mode: 'anc' | 'greenfield' = 'anc'

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    description = String(form.get('description') || '').trim()
    const refine = form.get('refine_from')
    refineFromId = typeof refine === 'string' && refine ? refine : null
    const m = String(form.get('mode') || '')
    if (m === 'greenfield') mode = 'greenfield'
    const files = form.getAll('files').filter((v): v is File => v instanceof File)
    parsedFiles = await Promise.all(files.slice(0, 6).map((f) => parseUploadedFile(f)))
  } else {
    const body = await request.json().catch(() => ({}))
    description = String(body.description || '').trim()
    refineFromId = typeof body.refine_from === 'string' ? body.refine_from : null
    if (body.mode === 'greenfield') mode = 'greenfield'
  }

  if (!description && parsedFiles.length === 0) {
    return new Response(JSON.stringify({ error: 'description or files required' }), { status: 400 })
  }
  if (!AI_API_KEY) return new Response(JSON.stringify({ error: 'AI not configured' }), { status: 500 })

  const modelForScope = process.env.AI_MODEL_SCOPE || 'glm-5.1'
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      // Anti-buffering padding for nginx/Cloudflare/EasyPanel reverse proxy.
      controller.enqueue(encoder.encode(': ' + ' '.repeat(2048) + '\n\n'))

      try {
        // 1. Pull prior draft + project context + web snippets in parallel
        emit('status', { stage: 'gathering', message: 'Reading project surfaces and recent work…' })

        let priorContext = ''
        if (refineFromId) {
          const r = await query(`SELECT name, pitch, bullets, price_usd, timeline_label, benefit, category, target_project FROM proposed_change_orders WHERE id = $1`, [refineFromId])
          if (r.rows.length > 0) {
            priorContext = `\n\nPrior draft of this proposal:\n${JSON.stringify(r.rows[0], null, 2)}\n\nThe stakeholder feedback below refines this prior draft.`
          }
        }

        // ANC mode pulls live project context. Greenfield mode skips it
        // entirely — no platform inventory, no past-CO anchor, no
        // private pricing posture. Same engine, two scoping modes.
        const projectContextPromise = mode === 'anc'
          ? buildProjectContext().catch(() => '')
          : Promise.resolve('')
        const [projectContext, webSnippets] = await Promise.all([
          projectContextPromise,
          ollamaWebSearch(`freelance fixed-price quote ${description.slice(0, 80)} development`),
        ])

        const webContext = webSnippets.length
          ? `\n\nLive web search results for similar freelance work:\n` +
            webSnippets.map((r, i) => `[${i + 1}] ${r.title || r.url}\n${r.content || ''}`).join('\n\n')
          : ''

        // Surface attached files in the prompt + status stream
        const filesContext = formatFilesForPrompt(parsedFiles)
        if (parsedFiles.length > 0) {
          emit('status', {
            stage: 'files',
            message: `Reading ${parsedFiles.length} attached file${parsedFiles.length === 1 ? '' : 's'}…`,
            files: parsedFiles.map((f) => ({ name: f.filename, size: f.size, truncated: f.truncated })),
          })
        }

        emit('status', { stage: 'thinking', message: 'Drafting client-safe scope…' })

        // 2. Stream from the AI
        const aiResp = await fetch(`${AI_BASE_URL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${AI_API_KEY}`,
          },
          body: JSON.stringify({
            model: modelForScope,
            temperature: 0.3,
            max_tokens: 2500,
            stream: true,
            response_format: { type: 'json_object' },
            messages: [
              {
                role: 'system',
                content: mode === 'greenfield'
                  ? PROMPT_SYSTEM_GREENFIELD
                  : PROMPT_SYSTEM_ANC + '\n\n' + projectContext,
              },
              {
                role: 'user',
                content: `Project description:\n${description || '(no text — see attached files)'}${priorContext}${webContext}${filesContext}`,
              },
            ],
          }),
        })

        if (!aiResp.ok || !aiResp.body) {
          const t = await aiResp.text().catch(() => '')
          emit('error', { error: 'AI returned an error', status: aiResp.status, detail: t.slice(0, 200) })
          controller.close()
          return
        }

        const reader = aiResp.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let fullContent = ''
        let fullReasoning = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed.startsWith('data:')) continue
            const payload = trimmed.slice(5).trim()
            if (payload === '[DONE]') continue
            try {
              const chunk = JSON.parse(payload)
              const delta = chunk?.choices?.[0]?.delta
              if (!delta) continue
              const reasoningChunk = typeof delta.reasoning === 'string' ? delta.reasoning : ''
              const contentChunk = typeof delta.content === 'string' ? delta.content : ''
              if (reasoningChunk) {
                fullReasoning += reasoningChunk
              }
              if (contentChunk) {
                fullContent += contentChunk
                emit('content', { delta: contentChunk })
              }
            } catch {
              // ignore malformed chunks
            }
          }
        }

        // 3. Parse final output
        const candidate = fullContent.trim() || fullReasoning.trim()
        if (!candidate) {
          emit('error', { error: 'AI returned no content' })
          controller.close()
          return
        }

        let draft: ScopedDraft
        try {
          draft = JSON.parse(extractJson(candidate)) as ScopedDraft
        } catch (err) {
          emit('error', { error: 'AI output not valid JSON', raw: candidate.slice(0, 400) })
          controller.close()
          return
        }

        // 4. Anchor pricing against market-rate.ts
        let workType = draft.workType
        let scope = draft.scope
        if (!workType || !scope) {
          const heuristic = classifyWorkType(description)
          workType = workType || heuristic.workType
          scope = scope || heuristic.scope
        }
        const market = marketEstimate(workType, scope)
        const publicRationale = [
          `Planning estimate based on ${market.finalHours} hours for ${workType.replace(/_/g, ' ')} work.`,
          `Scope band: ${scope}.`,
          mode === 'anc'
            ? 'Comparable ANC work and current platform context were used as calibration points.'
            : 'Current market-rate references were used as the primary pricing anchor.',
          'Final scope and price should be confirmed before work starts.',
        ].join(' ')

        emit('status', { stage: 'saving', message: 'Saving the draft…' })

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

        emit('done', {
          draft: inserted.rows[0],
          market_breakdown: market,
        })
        controller.close()
      } catch (err) {
        try {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`))
        } catch {}
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
