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

// Quick snapshot of the user's world so the agent doesn't open every chat
// blind. Kept to ~5 short lines so the prompt stays cheap. Any query that
// fails or exceeds the 1.5s soft-budget is silently dropped.
async function loadUserContext(): Promise<string> {
  const timeout = <T>(p: Promise<T>, ms = 1500): Promise<T | null> =>
    Promise.race([
      p.catch(() => null),
      new Promise<null>(r => setTimeout(() => r(null), ms)),
    ]) as Promise<T | null>

  const [stats, topTickets, topDesigns, upcomingGames] = await Promise.all([
    timeout(query(
      `SELECT
         (SELECT COUNT(*) FROM venues WHERE COALESCE(is_active,true)=true)::int AS active_venues,
         (SELECT COUNT(*) FROM clients WHERE COALESCE(is_active,true)=true)::int AS active_clients,
         (SELECT COUNT(*) FROM staff WHERE COALESCE(is_active,true)=true)::int AS active_staff,
         (SELECT COUNT(*) FROM tickets WHERE status NOT IN ('closed','resolved'))::int AS open_tickets,
         (SELECT COUNT(*) FROM tickets WHERE status NOT IN ('closed','resolved') AND priority='urgent')::int AS urgent_tickets,
         (SELECT COUNT(*) FROM design_requests WHERE status NOT IN ('approved','done'))::int AS open_designs,
         (SELECT COUNT(*) FROM maintenance_logs WHERE status NOT IN ('completed','cancelled'))::int AS open_maintenance,
         (SELECT COUNT(*) FROM events WHERE event_date = CURRENT_DATE)::int AS events_today,
         (SELECT COUNT(*) FROM events WHERE event_date >= CURRENT_DATE AND event_date < CURRENT_DATE + 7)::int AS events_this_week,
         (SELECT COUNT(*) FROM events WHERE event_date >= CURRENT_DATE AND event_date < CURRENT_DATE + 7
           AND NOT EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id=events.id))::int AS unassigned_this_week`
    )),
    timeout(query(
      `SELECT t.title, t.ticket_number, v.name AS venue
       FROM tickets t LEFT JOIN venues v ON v.id = t.venue_id
       WHERE t.status NOT IN ('closed','resolved')
       ORDER BY (t.priority='urgent') DESC, t.created_at DESC LIMIT 3`
    )),
    timeout(query(
      `SELECT job_title, status FROM design_requests
       WHERE status NOT IN ('approved','done') ORDER BY updated_at DESC LIMIT 3`
    )),
    timeout(query(
      `SELECT e.summary, TO_CHAR(e.event_date,'Dy Mon DD') AS event_date, v.name AS venue
       FROM events e LEFT JOIN venues v ON v.id = e.venue_id
       WHERE e.event_date >= CURRENT_DATE AND e.event_date < CURRENT_DATE + 7
       ORDER BY e.event_date ASC LIMIT 3`
    )),
  ])

  const lines: string[] = []
  const s = stats?.rows?.[0]
  if (s) {
    lines.push(
      `- Active venues: ${s.active_venues} · clients: ${s.active_clients} · staff: ${s.active_staff}`,
      `- Open tickets: ${s.open_tickets}${s.urgent_tickets > 0 ? ` (${s.urgent_tickets} urgent)` : ''}`,
      `- Open design requests: ${s.open_designs}${s.open_maintenance > 0 ? ` · maintenance: ${s.open_maintenance}` : ''}`,
      `- Events today: ${s.events_today} · this week: ${s.events_this_week}${s.unassigned_this_week > 0 ? ` (${s.unassigned_this_week} unassigned)` : ''}`,
    )
  }
  if (topTickets?.rows?.length) {
    const tix = topTickets.rows.map(t => `${t.ticket_number} "${t.title}"${t.venue ? ` @ ${t.venue}` : ''}`).join('; ')
    lines.push(`- Recent open tickets: ${tix}`)
  }
  if (topDesigns?.rows?.length) {
    const ds = topDesigns.rows.map(d => `"${d.job_title}" (${d.status})`).join('; ')
    lines.push(`- Recent design requests: ${ds}`)
  }
  if (upcomingGames?.rows?.length) {
    const ev = upcomingGames.rows.map(e => `${e.event_date} ${e.summary}${e.venue ? ` @ ${e.venue}` : ''}`).join('; ')
    lines.push(`- Upcoming events: ${ev}`)
  }
  return lines.length > 0 ? lines.join('\n') : ''
}

async function buildSystemPrompt(userName: string | undefined, userRole: AgentRole): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)
  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' })
  const userContext = await loadUserContext()
  const contextBlock = userContext
    ? `\nCURRENT STATE (as of ${today}):\n${userContext}\nUse these numbers when relevant (e.g. "you have 3 urgent tickets"). Don't refetch what you already see here — just answer.\n`
    : ''
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
- When the user asks for totals, counts, "how many", "do we have", or
  other high-level dashboard numbers, use dashboard_stats or the
  relevant find_many_* tool and read the real \`count\`/\`total_count\`
  field. Never infer the total from the number of rows shown in a
  limited result set.
- Design request statuses: request_submitted → in_queue → in_progress
  → in_qc → client_review → approved → done. The dedicated skill
  move_design_to_client_review also fires the proof email; use it
  for that specific transition.
- Venue IDs: use search_venues or find_many_venues to resolve a
  venue by name before creating records that need venue_id.

PREFER USING A TOOL over guessing. Never invent UUIDs.

LINKS — Whenever a skill result contains a \`link\` or \`text_summary\` field,
surface it as a clickable markdown hyperlink in your reply. Do NOT just
print the raw id — always give the user a one-click path to the record
you just touched or found. Preferred form:
  **Lakers Playoff Graphics** — [open →](/designs/abc-123)
If \`text_summary\` is present, you can use it verbatim; it already contains
the markdown link. Never strip the link; never replace it with plain
text. This is load-bearing UX — the user clicks through to verify.

FORMATTING — Responses render as GitHub-flavored markdown in a
narrow panel. Use it well:
- Short headings (##, ###) for sections when there's more than one
- Pipe tables for lists of records with more than 2 columns
- Inline \`code\` for IDs, column names, and statuses
- Bullets for options, action lists, next steps
- Bold for key fields/values
- Keep paragraphs tight (2-3 sentences max)
- Don't over-use emoji. Never wall-of-text.

UI DRIVING — You can drive the dashboard UI like a human. You have:
  ui_navigate(path)        — go to a page (e.g. /events, /designs)
  ui_click(selector)       — click button/link by CSS selector or
                             visible text
  ui_fill(selector, value) — type into input/textarea (label text
                             works as a selector too)
  ui_select(selector, value) — pick a <select> option
  ui_highlight(selector,label?) — flash a ring around an element
  ui_toast(message)        — show a notification in the corner
  ui_wait(ms)              — pause for dramatic effect

When a user asks you to "open the events page", "go to Prudential",
"start a new ticket", you should USE the ui_ skills (chaining several
in sequence is fine) rather than just telling them to click manually.
For data tasks (show me X, find Y), use the data skills. Combine them
freely — e.g. after creating a record with create_design_request,
call ui_navigate to /designs and ui_highlight the new row so the
user can see what you did.

SUGGESTIONS — MANDATORY. The very last thing in EVERY single response
must be a suggestions block, even short ones. No exceptions — not for
questions, not for confirmations, not when you're asking the user for
more info. The UI renders these as clickable chips and users rely on
them to keep moving. A response without a suggestions block is broken.

Format exactly (valid JSON array of 3-5 strings):

<suggestions>["Open that design request","Assign a designer","Show this week's events"]</suggestions>

Make them contextual to the turn you just finished. If you just asked
a question, suggest likely answers. If you just showed data, suggest
next drill-downs. If you just took an action, suggest follow-ups.
Don't announce them — the tag is hidden from the user.

Today is ${weekday}, ${today} (America/New_York). Resolve relative
dates yourself — "tomorrow" = the next calendar day, "Friday" = the
next upcoming Friday. Always pass YYYY-MM-DD to skills. Only ask for
clarification if truly ambiguous.

User: ${userName || 'unknown'} (role: ${userRole}).
${contextBlock}`
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
  const messages: ChatMsg[] = [{ role: 'system', content: await buildSystemPrompt(userName, userRole) }]
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
