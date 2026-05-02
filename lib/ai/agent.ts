import { query } from '@/lib/db'
import type { AgentRole, AgentChannel } from '@/lib/ai/types'
import { invokeSkill, toolDefinitions } from '@/lib/ai/registry'

export interface ProviderConfig {
  name: string
  baseUrl: string
  apiKey: string
  model: string
  /** Model ids the user can pick from this provider in the UI. */
  availableModels?: string[]
  /** Human-readable label for the UI. */
  label?: string
  /**
   * Surface this provider near the top of UI dropdowns. Used for
   * voice-tuned / curated providers (Mercury, MiMo) so they aren't
   * buried under the long AI_PROVIDERS_JSON list.
   */
  featured?: boolean
}

function providerPriority(p: ProviderConfig): number {
  const text = `${p.name} ${p.model}`.toLowerCase()
  if (text.includes('kimi-k2.6')) return 0
  if (text.includes('kimi')) return 1
  if (text.includes('gpt') || text.includes('openai')) return 2
  return 3
}

/**
 * Auto-discovered providers driven by env vars. Add a new provider here by
 * checking for its API key and pushing a ProviderConfig entry — no JSON
 * env wrangling needed. UI sees these via /api/ai/providers and the voice
 * agent settings dropdown.
 */
function autoDiscoveredProviders(): ProviderConfig[] {
  const out: ProviderConfig[] = []

  if (process.env.INCEPTION_API_KEY) {
    // Mercury — diffusion-based reasoning model, voice-tuned.
    // Special body params (reasoning_effort, realtime) are added in
    // buildRequestBody() when model name contains "mercury".
    out.push({
      name: 'inception-mercury',
      label: '⚡ Inception Mercury (recommended for voice)',
      baseUrl: 'https://api.inceptionlabs.ai/v1',
      apiKey: process.env.INCEPTION_API_KEY,
      model: process.env.INCEPTION_MODEL || 'mercury-2',
      availableModels: ['mercury-2'],
      featured: true,
    })
  }

  if (process.env.MIMO_API_KEY) {
    // MiMo's chat models — same key as TTS, OpenAI-compatible /v1 surface.
    // We list only the chat-capable models; the TTS-only ones are filtered
    // by their model id (mimo-v2.5-tts*) in the dropdown.
    out.push({
      name: 'mimo',
      label: 'MiMo (Xiaomi)',
      baseUrl: process.env.MIMO_BASE_URL || 'https://token-plan-sgp.xiaomimimo.com/v1',
      apiKey: process.env.MIMO_API_KEY,
      model: process.env.MIMO_CHAT_MODEL || 'mimo-v2.5-pro',
      availableModels: ['mimo-v2.5-pro', 'mimo-v2.5', 'mimo-v2-pro', 'mimo-v2-omni'],
      featured: true,
    })
  }

  return out
}

export function loadProviders(): ProviderConfig[] {
  const collected: ProviderConfig[] = []

  const raw = process.env.AI_PROVIDERS_JSON || ''
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as ProviderConfig[]
      collected.push(...parsed.filter(p => p?.baseUrl && p?.apiKey && p?.model))
    } catch {}
  }

  // Single-provider fallback (legacy AI_API_KEY/BASE_URL/MODEL).
  if (collected.length === 0 && process.env.AI_API_KEY) {
    collected.push({
      name: 'default',
      baseUrl: process.env.AI_BASE_URL || 'https://api.openai.com/v1',
      apiKey: process.env.AI_API_KEY,
      model: process.env.AI_MODEL || 'gpt-4.1-mini',
    })
  }

  // Auto-discovered providers (Mercury, MiMo, etc) layered on top of
  // whatever the ops team configured manually. De-dupe by name.
  for (const p of autoDiscoveredProviders()) {
    if (!collected.some(c => c.name === p.name)) collected.push(p)
  }

  return collected.sort((a, b) => providerPriority(a) - providerPriority(b))
}

/**
 * Request body shaping per provider/model. Mercury needs reasoning_effort
 * and realtime; everything else gets the standard OpenAI-compat shape.
 */
function buildRequestBody(
  provider: ProviderConfig,
  model: string,
  messages: ChatMsg[],
  tools: unknown[]
): Record<string, unknown> {
  const lc = model.toLowerCase()
  const isMercury = lc.includes('mercury') || provider.name === 'inception-mercury'

  const base: Record<string, unknown> = {
    model,
    messages: sanitizeForProvider(messages),
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? 'auto' : undefined,
    temperature: isMercury ? 0.6 : 0.2,
    max_tokens: isMercury ? 8192 : 4000,
  }

  if (isMercury) {
    base.reasoning_effort = process.env.MERCURY_REASONING_EFFORT || 'medium'
    base.realtime = true
  }

  return base
}

const PROVIDERS = loadProviders()
let cursor = 0
function pickProvider(): ProviderConfig {
  if (PROVIDERS.length === 0) {
    // This fires when AI_API_KEY / AI_PROVIDERS_JSON aren't set on the server.
    // The message bubbles up directly to the chat panel, so it's worded for
    // the end user rather than for a developer reading logs.
    throw new Error('AI assistant is not configured yet. An admin needs to add API credentials on the server before the chat can run. Ping #services-dashboard if this persists.')
  }
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

export interface PageContextField {
  selector: string
  label?: string
  type?: string
  value?: string
  empty?: boolean
}

export interface PageContext {
  current_path?: string
  page_title?: string
  visible_fields?: PageContextField[]
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

async function callLlm(
  messages: ChatMsg[],
  tools: unknown[],
  preferredProvider?: string,
  preferredModel?: string,
  attempt = 0
): Promise<ChatMsg> {
  const provider = preferredProvider && attempt === 0
    ? PROVIDERS.find(p => p.name === preferredProvider) || pickProvider()
    : pickProvider()
  // Per-agent model override wins; fallback to the provider's default.
  // Only honor on the first attempt — if we roll to a backup provider
  // because the preferred one failed, use that provider's own default.
  const model = (preferredModel && attempt === 0) ? preferredModel : provider.model
  const res = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
    body: JSON.stringify(buildRequestBody(provider, model, messages, tools)),
    signal: AbortSignal.timeout(90000),
  })
  if (!res.ok) {
    const body = await res.text()
    // Roll to the next provider on any non-2xx. Providers disagree about
    // edge-cases (Gemini 400 on null content, MiniMax 1302 rate limit,
    // Ollama 503). Cycling gives us resilience without guessing which
    // provider hates which input shape.
    if (attempt < PROVIDERS.length - 1) return callLlm(messages, tools, preferredProvider, preferredModel, attempt + 1)
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
         (SELECT COUNT(*) FROM tickets WHERE status NOT IN ('closed','resolved') AND priority IN ('high','critical'))::int AS urgent_tickets,
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
       ORDER BY (t.priority='critical') DESC, (t.priority='high') DESC, t.created_at DESC LIMIT 3`
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

function buildPageContextBlock(pageContext?: PageContext): string {
  const path = pageContext?.current_path?.trim()
  const title = pageContext?.page_title?.trim()
  const fields = (pageContext?.visible_fields || [])
    .map((field) => {
      const selector = field.selector?.trim()
      if (!selector) return null
      const parts = [selector]
      if (field.label?.trim()) parts.push(`label: ${field.label.trim()}`)
      if (field.type?.trim()) parts.push(`type: ${field.type.trim()}`)
      if (typeof field.empty === 'boolean') parts.push(`empty: ${field.empty ? 'yes' : 'no'}`)
      if (field.value?.trim()) parts.push(`current: ${field.value.trim()}`)
      return `- ${parts.join(' · ')}`
    })
    .filter(Boolean) as string[]

  // /operations renders a cross-origin iframe of NocoDB at ops.ancsports.net.
  // Browser security blocks the parent window from inspecting iframe DOM —
  // visible_fields will always be empty here, and ui_fill / ui_click /
  // ui_highlight CANNOT reach into NocoDB cells. The right tool path is
  // the ops_* skills which act on the workspace via NocoDB's REST API.
  // Without this branch the model improvises "I don't have vision
  // capabilities" and refuses to act, instead of routing to ops_*.
  const isOps = !!path && (path === '/operations' || path.startsWith('/operations/'))

  if (!path && !title && fields.length === 0) return ''

  const lines = ['\nCURRENT PAGE CONTEXT:']
  if (path) lines.push(`- Path: ${path}`)
  if (title) lines.push(`- Title: ${title}`)

  if (isOps) {
    lines.push(
      '- The user is on the Operations workspace — an embedded iframe of the',
      '  NocoDB ops workspace at ops.ancsports.net.',
      '- TWO sets of tools work here, pick by intent:',
      '    A) ops_* skills (REST API) — use for read/write of records,',
      '       bulk operations, schema introspection, counts. Faster, no',
      '       UI animation. Workflow: ops_list_tables → ops_table_schema',
      '       (before create/update) → ops_query_table / ops_count_records',
      '       → ops_create_records / ops_update_records / ops_delete_records.',
      '       After any write, ask the user to refresh so the iframe re-queries.',
      '    B) ui_click / ui_fill / ui_highlight — these now ALSO reach into',
      '       the NocoDB iframe via a postMessage bridge. The iframe will',
      '       animate the AI cursor, ring-flash the target, and dispatch the',
      '       click/fill inside NocoDB. Use these when the user says "show',
      '       me where" / "click here" / "open the X tab" / "fill this in" —',
      '       anything where the visible cursor motion is the value.',
      '       Selectors can be CSS, [data-testid=...], or visible text on a',
      '       button/menu-item (e.g. ui_click "Submit New Event" finds the',
      '       form view by its tab name).',
      '    Rule of thumb: bulk data → ops_*. Visible/teaching demo → ui_*.',
      '- Do NOT say "I can\'t see the page" or "I have no vision capabilities."',
      '  You have both API access and a UI bridge into the iframe.',
      '- Bases in this workspace include: WMATA Inventory, ANC Service -',
      '  WMATA, ANC Service - South, ANC Advertising, Inventory Tracking,',
      '  WinStar World Casino, New York, ANC Test Sandbox.'
    )
  } else if (fields.length > 0) {
    lines.push('- Visible editable fields:')
    lines.push(...fields.slice(0, 20))
    lines.push(
      '- Treat this as the live UI state right now.',
      '- If the user says "fill", "populate", or "autofill" on an existing detail/edit page, use ui_fill_form or ui_fill/ui_select on these visible fields first.',
      '- Do NOT call create_* unless the user explicitly asks for a brand-new record.'
    )
  } else {
    lines.push(
      '- Treat this as the live UI state right now.',
      '- If the user says "fill", "populate", or "autofill" on an existing detail/edit page, use ui_fill_form or ui_fill/ui_select on these visible fields first.',
      '- Do NOT call create_* unless the user explicitly asks for a brand-new record.'
    )
  }
  return `${lines.join('\n')}\n`
}

export interface AgentOverrides {
  name?: string
  description?: string | null
  systemPrompt?: string | null
  kbText?: string | null
  greeting?: string | null
  /**
   * Per-agent tool allowlist.
   *  null/undefined → all skills available (default)
   *  [] empty array → NO tools (agent can only talk)
   *  [name, ...] → only those names (intersected with role allowlist)
   */
  allowedTools?: string[] | null
}

async function buildSystemPrompt(
  userName: string | undefined,
  userRole: AgentRole,
  pageContext?: PageContext,
  channel: AgentChannel = 'web',
  agentOverrides?: AgentOverrides
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10)
  const weekday = new Date().toLocaleDateString('en-US', { weekday: 'long', timeZone: 'America/New_York' })
  const userContext = await loadUserContext()
  const contextBlock = userContext
    ? `\nCURRENT STATE (as of ${today}):\n${userContext}\nUse these numbers when relevant (e.g. "you have 3 urgent tickets"). Don't refetch what you already see here — just answer.\n`
    : ''
  const pageContextBlock = buildPageContextBlock(pageContext)
  if (channel === 'voice') {
    const persona = agentOverrides?.name
      ? `You are "${agentOverrides.name}", a voice assistant built on the ANC Services platform.`
      : `You are the ANC Services voice assistant — internal only, talking to a logged-in staff member.`
    const customPrompt = agentOverrides?.systemPrompt?.trim()
    const customKb = agentOverrides?.kbText?.trim()
    const overridesBlock = [
      customPrompt ? `\nAGENT INSTRUCTIONS:\n${customPrompt}` : '',
      customKb ? `\nAGENT KNOWLEDGE BASE — read and remember:\n${customKb}` : '',
    ].join('')

    return `${persona}

Speaking style:
- Speak like a calm, direct ops colleague over the phone.
- Short answers. Two or three sentences max unless the user explicitly asks for detail.
- No markdown, no asterisks, no bullet points, no code blocks, no emoji, no <suggestions> tags. Plain spoken English.
- No headings or lists — your text is read aloud.
- Money: speak amounts naturally ("about forty-seven thousand dollars", not "$47,000").
- Dates: spoken form ("May fifth", not "5/5").
- Numbers under 100: spell them out when natural.

Tool use:
- You have full read and write access to the ANC services platform via tools (find, create, update, delete on every table). Use them.
- Resolve names to IDs by searching first — never invent IDs.
- For ticket actions, prefer create_ticket / update_ticket. For venue/account context, prefer find_many_venues / find_many_clients.
- After you act, confirm what you did out loud in one short sentence ("Ticket two-four-six-three created for Prudential Center, priority high"). Do not list every field.
- If a tool fails or you need clarification, ask ONE short follow-up question — don't dump options.

Internal mode:
- This is staff-only, so you may discuss internal financial details, contract values, and status without redacting.
- Never read out a long URL. If you opened or created something, say it's "saved" or "in the dashboard" and stop.

User: ${userName || 'staff member'} (role: ${userRole}).
Today is ${weekday}, ${today} (America/New_York). Resolve relative dates yourself.
${overridesBlock}${contextBlock}`
  }

  const identityBlock = channel === 'slack'
    ? `You are Ahmad AI Assistant.
You are Ahmad's Slack assistant. Speak like a direct, useful personal operator for Ahmad, not like a generic ANC product bot. Help with Slack recaps, canvases, operations questions, and actions across the ANC services platform when relevant.
`
    : `You are the ANC Services in-dashboard assistant.
You help ANC staff manage events, venues, tickets, maintenance, design
requests, creative workflows, parts, RMAs, and more across the services
platform.
`
  const suggestionsBlock = channel === 'slack'
    ? `SUGGESTIONS — Do NOT output any <suggestions> block, hidden chips, XML-like tags, or UI-only helper markup in Slack. End with normal plain text only.`
    : `SUGGESTIONS — MANDATORY. The very last thing in EVERY single response
must be a suggestions block, even short ones. No exceptions — not for
questions, not for confirmations, not when you're asking the user for
more info. The UI renders these as clickable chips and users rely on
them to keep moving. A response without a suggestions block is broken.

Format exactly (valid JSON array of 3-5 strings):

<suggestions>["Open that design request","Assign a designer","Show this week's events"]</suggestions>

Make them contextual to the turn you just finished. If you just asked
a question, suggest likely answers. If you just showed data, suggest
next drill-downs. If you just took an action, suggest follow-ups.
Don't announce them — the tag is hidden from the user.`
  return `${identityBlock}

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
NARROW side panel (~360px wide). Use it well:
- Prefer bullets over tables. The panel is too narrow for wide tables;
  3+ column tables wrap and look broken.
- If you must use a table, use PIPE syntax exactly:
  \`| Col A | Col B |\\n| --- | --- |\\n| v1 | v2 |\`
  Do NOT fake tables with spaces or tabs — react-markdown won't render
  them and the output will look like raw text.
- Never output anything that looks like:
  \`Field    Value\`
  \`Client Name    Test Client\`
  \`Client Email    testclient@example.com\`
  Convert that into bullets or a real pipe table instead.
- Short headings (##, ###) only when there's more than one section
- Inline \`code\` for IDs, column names, and statuses
- Bold for key fields/values
- Keep paragraphs tight (2-3 sentences max)
- Don't over-use emoji. Never wall-of-text.

UI DRIVING — You can drive the dashboard UI like a human. You have:
  ui_navigate(path)        — go to a page (e.g. /events, /designs)
  ui_click(selector)       — click button/link by CSS selector or
                             visible text
  ui_fill_form(assignments, only_if_empty?) — fill many fields in one pass
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

When the user is already on an existing record page like /designs/[id],
assume they mean THAT PAGE unless they explicitly say "create a new one"
or "make another". Editing/filling the current form beats creating a
separate record.

"FILL IT" / "FILL THE FORM" / "POPULATE / USE EXAMPLE DATA" — when the
user says any of these on a form page without specifying values, DO NOT
stop to ask what to put in each field. Generate plausible placeholder
data on the spot and prefer a single ui_fill_form call for the CURRENT
PAGE. If the user says "fill every blank", preserve any field marked
empty: no and fill only fields marked empty: yes by passing
only_if_empty: true. Never overwrite existing values unless the user
explicitly asks to replace or update them. Then report what you filled in
one short summary.
Never replace this with create_design_request unless the user explicitly
asked for a brand-new request. Examples of fine placeholders:
  - Client name: a real-sounding NBA/NHL team name (Lakers, Celtics)
  - Client email: client@example.com
  - Company name: the team's parent org (e.g. "LA Lakers")
  - Venue: pick a plausible real arena (Crypto.com Arena, TD Garden)
  - Due date: 2 weeks from today (compute it)
  - Boards: "Courtside LED, Scorebug, Ribbon"
  - Sizes: "1920x1080, 384x64 ribbon"
  - Hours estimated: 6
  - Notes: one sentence of design direction
Only ask for clarification if the form requires a value we can't
reasonably guess (e.g. a specific tricode the user mentioned earlier).
Prefer filling and letting the user edit over asking and stalling.

ACTION DISCIPLINE:
- Do not tell the user to click/save/move/send something unless you
  actually executed the ui action in this turn.
- Keep imperative follow-ups inside the hidden suggestions block, not in
  the visible body text.

${suggestionsBlock}

Today is ${weekday}, ${today} (America/New_York). Resolve relative
dates yourself — "tomorrow" = the next calendar day, "Friday" = the
next upcoming Friday. Always pass YYYY-MM-DD to skills. Only ask for
clarification if truly ambiguous.

User: ${userName || 'unknown'} (role: ${userRole}).
${contextBlock}${pageContextBlock}`
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
  pageContext?: PageContext
  preferredProvider?: string
  preferredModel?: string
  channel?: AgentChannel
  agentOverrides?: AgentOverrides
  emit: (event: StreamEvent) => void
}): Promise<void> {
  const { chatId, userId, userRole, userName, userMessage, pageContext, preferredProvider, preferredModel, channel = 'web', agentOverrides, emit } = params

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

  const allTools = await toolDefinitions(userRole)
  const allowed = agentOverrides?.allowedTools
  const tools = allowed === null || allowed === undefined
    ? allTools
    : allTools.filter(t => allowed.includes(t.function.name))

  // Build messages array
  const messages: ChatMsg[] = [{ role: 'system', content: await buildSystemPrompt(userName, userRole, pageContext, channel, agentOverrides) }]
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
      const reply = await callLlm(messages, tools, preferredProvider, preferredModel)
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
        const result = await invokeSkill(call.function.name, call.function.arguments, { userId, userRole, userName, channel })
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
