import { query } from '@/lib/db'
import type { AgentRole } from '@/lib/ai/types'
import { invokeSkill, toolDefinitions } from '@/lib/ai/registry'

interface ProviderConfig { name: string; baseUrl: string; apiKey: string; model: string }

function loadProviders(): ProviderConfig[] {
  const raw = process.env.AI_PROVIDERS_JSON || ''
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as ProviderConfig[]
      const valid = parsed.filter(p => p?.baseUrl && p?.apiKey && p?.model)
      if (valid.length > 0) return valid
    } catch {}
  }
  const apiKey = process.env.AI_API_KEY || ''
  const baseUrl = process.env.AI_BASE_URL || 'https://api.openai.com/v1'
  const model = process.env.AI_MODEL || 'gpt-4.1-mini'
  return apiKey ? [{ name: 'default', baseUrl, apiKey, model }] : []
}

const PROVIDERS = loadProviders()
let cursor = 0
function pickProvider(): ProviderConfig {
  if (PROVIDERS.length === 0) throw new Error('No AI providers configured')
  const p = PROVIDERS[cursor % PROVIDERS.length]
  cursor++
  return p
}

interface ChatMsg {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
  name?: string
}

function sanitizeForProvider(messages: ChatMsg[]): ChatMsg[] {
  // Gemini's OpenAI-compat endpoint rejects content: null on assistant
  // tool-call turns. Coerce nulls to empty strings — OpenAI/Kimi/GLM all
  // still accept the empty string shape. Strip empty tool_calls arrays too.
  return messages.map((m) => {
    const out: ChatMsg = { ...m, content: m.content == null ? '' : m.content }
    if (out.tool_calls && out.tool_calls.length === 0) delete out.tool_calls
    return out
  })
}

async function callLlm(messages: ChatMsg[], tools: unknown[], preferredProvider?: string, attempt = 0): Promise<ChatMsg> {
  const provider = preferredProvider && attempt === 0
    ? PROVIDERS.find(p => p.name === preferredProvider) || pickProvider()
    : pickProvider()
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify({
      model: provider.model,
      messages: sanitizeForProvider(messages),
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      temperature: 0.2,
      max_tokens: 4000,
    }),
    signal: AbortSignal.timeout(90000),
  })
  if (!res.ok) {
    const body = await res.text()
    // Roll to the next provider on any non-2xx. Providers disagree about
    // edge-cases (Gemini 400 on null content, MiniMax 1302 rate limit,
    // Ollama 503). Cycling gives us resilience without guessing which
    // provider hates which input shape.
    if (attempt < PROVIDERS.length - 1) return callLlm(messages, tools, preferredProvider, attempt + 1)
    throw new Error(`AI API ${provider.name} ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = await res.json() as { choices?: Array<{ message?: ChatMsg }> }
  const msg = data.choices?.[0]?.message
  if (!msg) throw new Error('Empty AI response')
  return msg
}

function buildSystemPrompt(userName: string | undefined, userRole: AgentRole): string {
  const today = new Date().toISOString().slice(0, 10)
  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' })
  return `You are the ANC Services in-dashboard assistant.
You help ANC staff manage events, venues, tickets, maintenance, design
requests, creative workflows, parts, RMAs, and more across the services
platform.

TOOLING — You have full CRUD access to every dashboard table through
tools of the form find_many_<plural>, find_one_<singular>,
create_<singular>, update_<singular>, delete_<singular>. Any field
including status can be changed via update_<singular> — for example
to move a design request from "request_submitted" to "in_queue",
call update_design_request with {id, status: "in_queue"}. Do NOT
refuse a reasonable request by claiming a tool doesn't exist before
actually looking — search the tool list first.

WORKFLOW TIPS:
- When a user refers to a record by name or title (e.g. "the Celtics
  request", "task test 2"), first run find_many_* to resolve the id.
- When asked to "move X to <status>", use update_<singular>. Don't
  ask the user for the id if they gave you a title — look it up.
- Design request statuses: request_submitted → in_queue → in_progress
  → in_qc → client_review → approved → done. The dedicated skill
  move_design_to_client_review also fires the proof email; use it
  for that specific transition.
- Venue IDs: use search_venues or find_many_venues to resolve a
  venue by name before creating records that need venue_id.

PREFER USING A TOOL over guessing. Never invent UUIDs.

FORMATTING — Responses render as GitHub-flavored markdown in a
narrow panel. Use it well:
- Short headings (##, ###) for sections when there's more than one
- Pipe tables for lists of records with more than 2 columns
- Inline \`code\` for IDs, column names, and statuses
- Bullets for options, action lists, next steps
- Bold for key fields/values
- Keep paragraphs tight (2-3 sentences max)
- Don't over-use emoji. Never wall-of-text.

Today is ${weekday}, ${today} (America/New_York). Resolve relative
dates yourself — "tomorrow" = the next calendar day, "Friday" = the
next upcoming Friday. Always pass YYYY-MM-DD to skills. Only ask for
clarification if truly ambiguous.

User: ${userName || 'unknown'} (role: ${userRole}).`
}

export interface StreamEvent {
  type: 'text' | 'tool_call' | 'tool_result' | 'done' | 'error'
  data: unknown
}

export async function runChat(params: {
  chatId: string
  userId: string
  userRole: AgentRole
  userName?: string
  userMessage: string
  preferredProvider?: string
  emit: (event: StreamEvent) => void
}): Promise<void> {
  const { chatId, userId, userRole, userName, userMessage, preferredProvider, emit } = params

  // Persist user message
  await query(
    `INSERT INTO ai_messages (chat_id, role, content) VALUES ($1, 'user', $2)`,
    [chatId, userMessage]
  )

  // Bump chat updated_at + auto-title first message
  await query(
    `UPDATE ai_chats SET updated_at = NOW(),
       title = CASE WHEN title = 'New chat' THEN LEFT($2, 60) ELSE title END
     WHERE id = $1`,
    [chatId, userMessage]
  )

  // Load full conversation history for context
  const history = await query(
    `SELECT role, content, tool_calls, tool_call_id, tool_name
     FROM ai_messages WHERE chat_id = $1 ORDER BY created_at ASC`,
    [chatId]
  )

  const tools = await toolDefinitions(userRole)

  // Build messages array
  const messages: ChatMsg[] = [{ role: 'system', content: buildSystemPrompt(userName, userRole) }]
  for (const row of history.rows) {
    if (row.role === 'assistant') {
      messages.push({
        role: 'assistant',
        content: row.content,
        tool_calls: row.tool_calls || undefined,
      })
    } else if (row.role === 'tool') {
      messages.push({
        role: 'tool',
        content: row.content,
        tool_call_id: row.tool_call_id,
        name: row.tool_name,
      })
    } else if (row.role === 'user') {
      messages.push({ role: 'user', content: row.content })
    }
  }

  try {
    // Tool loop: keep calling until the assistant returns a message with no tool_calls.
    const MAX_ITERS = 6
    for (let i = 0; i < MAX_ITERS; i++) {
      const reply = await callLlm(messages, tools, preferredProvider)
      messages.push(reply)

      // Persist assistant turn
      await query(
        `INSERT INTO ai_messages (chat_id, role, content, tool_calls) VALUES ($1, 'assistant', $2, $3)`,
        [chatId, reply.content || null, reply.tool_calls ? JSON.stringify(reply.tool_calls) : null]
      )

      // Stream assistant text if any
      if (reply.content) emit({ type: 'text', data: reply.content })

      if (!reply.tool_calls || reply.tool_calls.length === 0) break

      // Run tools
      for (const call of reply.tool_calls) {
        emit({ type: 'tool_call', data: { id: call.id, name: call.function.name, args: call.function.arguments } })
        const result = await invokeSkill(call.function.name, call.function.arguments, { userId, userRole, userName })
        emit({ type: 'tool_result', data: { id: call.id, name: call.function.name, result } })
        // Persist tool response
        await query(
          `INSERT INTO ai_messages (chat_id, role, content, tool_call_id, tool_name) VALUES ($1, 'tool', $2, $3, $4)`,
          [chatId, result, call.id, call.function.name]
        )
        messages.push({ role: 'tool', content: result, tool_call_id: call.id, name: call.function.name })
      }
    }

    emit({ type: 'done', data: null })
  } catch (err) {
    emit({ type: 'error', data: err instanceof Error ? err.message : String(err) })
    await query(
      `INSERT INTO ai_messages (chat_id, role, content) VALUES ($1, 'assistant', $2)`,
      [chatId, `⚠️ ${err instanceof Error ? err.message : String(err)}`]
    )
  }
}
