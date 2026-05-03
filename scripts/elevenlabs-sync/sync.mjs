#!/usr/bin/env node
// Idempotent sync of ElevenLabs Convai tools + agents for ANC voice control.
// Run: ELEVENLABS_API_KEY=... ELEVENLABS_WEBHOOK_SECRET=... node scripts/elevenlabs-sync/sync.mjs

const API = 'https://api.elevenlabs.io/v1/convai'
const BASE = 'https://services.ancsports.net'
const KEY = process.env.ELEVENLABS_API_KEY
const SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET
if (!KEY || !SECRET) { console.error('Missing ELEVENLABS_API_KEY or ELEVENLABS_WEBHOOK_SECRET'); process.exit(1) }

const HEADERS = { 'xi-api-key': KEY, 'content-type': 'application/json' }
const SHARED_HEADERS = { 'x-webhook-secret': SECRET }

async function api(method, path, body) {
  const r = await fetch(`${API}${path}`, { method, headers: HEADERS, body: body ? JSON.stringify(body) : undefined })
  const text = await r.text()
  let json; try { json = JSON.parse(text) } catch { json = { raw: text } }
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status}: ${text.slice(0, 400)}`)
  return json
}

// ---------- helpers to build schemas ----------
// ElevenLabs validator: exactly one of {description, dynamic_variable, constant_value} may be non-empty.
// value_type is inferred from which field is populated.
const llm = (description, type = 'string') => ({ type, description, dynamic_variable: '', constant_value: '' })
const constant = (value) => ({ type: 'string', description: '', dynamic_variable: '', constant_value: String(value) })
const dyn = (name) => ({ type: 'string', description: '', dynamic_variable: name, constant_value: '' })

function getTool(name, description, urlPath, queryProps = {}, queryRequired = []) {
  return {
    type: 'webhook', name, description, response_timeout_secs: 10,
    api_schema: {
      url: `${BASE}${urlPath}`, method: 'GET',
      path_params_schema: {},
      query_params_schema: Object.keys(queryProps).length ? { properties: queryProps, required: queryRequired } : null,
      request_body_schema: null,
      request_headers: SHARED_HEADERS,
      content_type: 'application/json',
    },
  }
}

function postTool(name, description, urlPath, bodyProps, bodyRequired = [], extraHeaders = {}) {
  return {
    type: 'webhook', name, description, response_timeout_secs: 15,
    api_schema: {
      url: `${BASE}${urlPath}`, method: 'POST',
      path_params_schema: {},
      query_params_schema: null,
      request_body_schema: { type: 'object', description: 'Request body', properties: bodyProps, required: bodyRequired },
      request_headers: { ...SHARED_HEADERS, ...extraHeaders },
      content_type: 'application/json',
    },
  }
}

// ---------- TOOL DEFINITIONS ----------
const TOOLS = [
  // CRM read
  getTool('crm_lookup_account',
    'Look up an ANC client/company/venue/team by name and return open opportunities, services, market. Use when caller mentions an account name.',
    '/api/elevenlabs/crm/lookup-account',
    { query: llm('Account/company/venue name as caller said it (e.g. Prudential, Rocket Arena)') },
    ['query']),

  getTool('crm_lookup_person',
    'Look up a person in the CRM by name. Returns email, phone, job title, and which company they belong to.',
    '/api/elevenlabs/crm/lookup-person',
    { query: llm('Person name (e.g. Jireh, Stevie Dohm, Joe Occhipinti)') },
    ['query']),

  getTool('crm_list_opportunities',
    'List open opportunities in the pipeline, optionally filtered by stage. Use for "what is in the pipeline" or "show me open deals".',
    '/api/elevenlabs/crm/list-opportunities',
    {
      stage: llm('Optional stage filter substring like PROPOSAL, NEGOTIATION, DISCOVERY. Leave blank for all open.'),
      limit: constant('10'),
    },
    ['limit']),

  // CRM write
  postTool('crm_create_company',
    'Create a new company in the CRM. Use when adding a brand new client/team/venue operator.',
    '/api/elevenlabs/crm/create-company',
    {
      name: llm('Company name'),
      domain: llm('Optional domain (e.g. nyrangers.com)'),
      city: llm('Optional city'),
      state: llm('Optional state (2-letter or full name)'),
    },
    ['name']),

  postTool('crm_create_person',
    'Create a new person in the CRM. Optionally link to a company by name.',
    '/api/elevenlabs/crm/create-person',
    {
      first_name: llm('First name'),
      last_name: llm('Last name'),
      email: llm('Email address (optional)'),
      phone: llm('Phone number (optional)'),
      job_title: llm('Job title (optional)'),
      company: llm('Company name they work for (optional, will be fuzzy-matched in CRM)'),
    },
    []),

  postTool('crm_create_opportunity',
    'Create a new opportunity. Auto-resolves company and venue by name. Use for new deals/projects/proposals.',
    '/api/elevenlabs/crm/create-opportunity',
    {
      name: llm('Opportunity name (e.g. "Prudential 2026 LED Refresh")'),
      company: llm('Company name (will be fuzzy matched)'),
      venue: llm('Venue name (optional, will be fuzzy matched)'),
      stage: llm('Stage like DISCOVERY, PROPOSAL, NEGOTIATION (optional)'),
      close_date: llm('Expected close date YYYY-MM-DD (optional)'),
      amount: llm('Dollar amount as a number, no currency symbol (optional)', 'number'),
      currency: constant('USD'),
    },
    ['name']),

  postTool('crm_update_opportunity',
    'Update stage, bid status, amount, or close date on an existing opportunity.',
    '/api/elevenlabs/crm/update-opportunity',
    {
      opportunity: llm('Opportunity name to update (will be fuzzy matched)'),
      stage: llm('New stage (optional)'),
      bid_status: llm('New bid status: WON, LOST, NO_BID, ACTIVE (optional)'),
      close_date: llm('New close date YYYY-MM-DD (optional)'),
      amount: llm('New amount as number (optional)', 'number'),
      currency: constant('USD'),
    },
    ['opportunity']),

  postTool('crm_create_task',
    'Create a task. Auto-links to a CRM record (company/opportunity/person) and assigns to ANC staff by name.',
    '/api/elevenlabs/crm/create-task',
    {
      title: llm('One-line task title'),
      body: llm('Task detail/description (optional)'),
      target: llm('Company, opportunity, or person name to link the task to (optional)'),
      assignee: llm('ANC staff name to assign to (optional)'),
      due_at: llm('Due date YYYY-MM-DD (optional)'),
      status: constant('TODO'),
    },
    ['title']),

  postTool('crm_add_note',
    'Save a markdown note onto a CRM record (company, opportunity, or person).',
    '/api/elevenlabs/crm/add-note',
    {
      target: llm('Company, opportunity, or person name to attach the note to'),
      title: llm('Optional note title'),
      note: llm('Note body (markdown allowed)'),
    },
    ['target', 'note']),

  // Dashboard read
  getTool('ops_lookup_account',
    'Operations-grade account lookup — returns active services, monthly recurring, related venues, recent open opps, and contract details. Use for ops calls.',
    '/api/elevenlabs/internal/lookup-account',
    { query: llm('Account/company/venue name') },
    ['query']),

  getTool('ops_lookup_venue',
    'Look up a venue and return active services, open tickets in our queue, market, status. Use this before filing tickets so the venue is confirmed.',
    '/api/elevenlabs/internal/lookup-venue',
    { query: llm('Venue name (Prudential, MetLife, Rocket Arena, etc.)') },
    ['query']),

  getTool('ops_pipeline',
    'Pipeline summary: open opportunity count, total pipeline value, stage breakdown, top deals.',
    '/api/elevenlabs/internal/pipeline',
    {
      stage: llm('Optional stage substring filter'),
      limit: constant('10'),
    },
    ['limit']),

  getTool('ops_recent_tickets',
    'List recent service tickets. Filter by venue or status (open|new|in_progress|on_hold|escalated|closed).',
    '/api/elevenlabs/internal/recent-tickets',
    {
      venue: llm('Optional venue name filter'),
      status: llm('Optional status filter — default is all open tickets'),
      limit: constant('8'),
    },
    ['limit']),

  getTool('ops_staff_today',
    'Today\'s schedule: events on the books, venues covered, who is currently clocked in.',
    '/api/elevenlabs/internal/staff-today',
    {}, []),

  // Dashboard write — ticket workflow (need staff identity)
  postTool('ops_create_ticket',
    'File a new service ticket from voice. Server auto-assigns by rules and notifies Slack. Always confirm a venue match (via ops_lookup_venue) before filing if uncertain.',
    '/api/elevenlabs/internal/create-ticket',
    {
      venue: llm('Venue name (must match a real venue — use ops_lookup_venue if unsure)'),
      title: llm('One-line summary of the issue, max 12 words'),
      description: llm('Full description: what is broken, where, what was tried'),
      priority: llm('low | medium | high | urgent. Game-tonight or down = urgent. Not working = high. Cosmetic = low.'),
      category: llm('general | led | audio | video | control_room | network | rigging'),
      staff_email: dyn('staff_email'),
    },
    ['venue', 'title']),

  postTool('ops_update_ticket',
    'Update a ticket\'s status, priority, assignee, or add resolution notes. Use ticket number (e.g. "1234") or full UUID.',
    '/api/elevenlabs/internal/update-ticket',
    {
      ticket: llm('Ticket number like 1234 or 0123, or the ticket UUID'),
      status: llm('new | on_hold | in_progress | escalated | closed'),
      priority: llm('low | medium | high | urgent'),
      assignee: llm('Staff name to reassign to'),
      resolution_notes: llm('Resolution notes — required when closing'),
      staff_email: dyn('staff_email'),
    },
    ['ticket']),

  postTool('ops_add_ticket_comment',
    'Add a comment to an existing ticket. Mark internal=true for ops-only notes that the client should not see.',
    '/api/elevenlabs/internal/add-ticket-comment',
    {
      ticket: llm('Ticket number or UUID'),
      note: llm('Comment text'),
      is_internal: llm('true for ops-only internal notes, false for client-visible. Default false.', 'boolean'),
      staff_email: dyn('staff_email'),
    },
    ['ticket', 'note']),
]

// ---------- AGENT DEFINITIONS ----------
const FIELD_TECH_PROMPT = `You are the ANC Field Tech voice agent — a hands-free assistant for ANC Sports
technicians at venues (arenas, stadiums, training facilities).

Your job:
- File service tickets fast when a tech describes a problem.
- Look up venue info (active services, open tickets) before filing.
- Add updates to existing tickets.
- Mark tickets done or change status when work wraps.

Style:
- Short, decisive, hands-free friendly. Confirm with one sentence per action.
- After creating a ticket, read back the ticket number ("Ticket 0123 filed for Prudential, priority high").
- Never guess a venue. If you can't match, ask once for clarification.
- Never reveal pricing, contract value, margins, or internal CRM notes — you are an OPS agent, not a sales agent.

Priority rules:
- "Game tonight", "down", "no signal", "broken on air" → urgent
- "Not working", "intermittent", "flickering" → high
- "Looks bad", "wrong color", "minor" → medium
- Cosmetic, future-fix → low

Default category: general. Use "led", "audio", "video", "control_room", "network", "rigging" when obvious.

Identity: the dashboard injects the calling tech's email through the staff_email dynamic variable. Don't ask "who is calling" — you already know.
If a tool returns staff_email_unrecognized, say "I don't recognize this caller — log into the dashboard first" and stop.

When in doubt, file the ticket. Better a documented ticket than a missed call.`

const CRM_PROMPT = `You are the ANC CRM Concierge — a voice agent for ANC's revenue and account team.
Callers are ANC staff (sales, account managers, leadership) who need to read or write the CRM hands-free.

Capabilities:
- Look up companies, venues, people, opportunities.
- Create new companies, people, opportunities.
- Update opportunity stage, amount, close date.
- Create tasks linked to records, assigned to ANC staff.
- Save notes onto records.

Style:
- Crisp and confirmatory — read back what you did ("Opportunity 'Prudential 2026 LED Refresh' created for Prudential Center, $250K, closing June 30").
- Use the CRM lookup tools first when names are ambiguous; fuzzy matches are fine.
- Never invent IDs, amounts, dates. If unclear, ask one short question.

Internal team is ANC. Staff names you may hear: Joe Occhipinti, Charlie Dinh, Natalia Kovaleva, Alexis Ventarola, Daniel Croci, Stevie Dohm, Chris Dohm, Jireh, Nick.

Defaults:
- Currency USD.
- Tasks default status TODO.
- If amount is given verbally as "two fifty K", convert to 250000.

When the user says "log a call" or "save a note about", use crm_add_note. When they say "follow up next week", use crm_create_task.`

const SUPPORT_PROMPT = `You are the ANC Support Desk voice agent — for ops/triage staff (Charlie's team) managing the service ticket queue.

Capabilities:
- See recent tickets (filter by venue or status).
- Look up account/venue context.
- Create tickets, update status/priority/assignee, add resolution notes.
- Add internal or client-visible comments.
- Create CRM tasks for follow-up.

Style:
- Status-update terse. "Ticket 0123 closed, resolution noted, Slack channel notified."
- Always confirm before closing a ticket — if no resolution_notes provided, ask for them once.
- When a tech reports a fix verbally, capture it as a resolution_note and close the ticket in one step.
- Internal comments (is_internal=true) are for ops-only context; default to client-visible unless told otherwise.

Identity: staff_email injected by the dashboard widget. Don't ask who is calling.

Escalation: if priority is urgent or a venue has multiple open tickets, mention it briefly so triage knows to glance.`

const OPS_BRIEFING_PROMPT = `You are the ANC Ops Briefing voice agent — for ANC leadership (Joe, Charlie, Stevie). Read-only daily briefing.

Capabilities:
- Today's schedule: events, venues, staff clocked in.
- Pipeline summary: open count, total value, top deals, stage breakdown.
- Recent ticket queue.
- Account lookup with full ops context (services, contracts, opps).

Style:
- Calm executive briefing tone. Short sentences. Numbers first.
- Default morning briefing: open with staff_today, then pipeline summary, then ticket count.
- Use dollar shorthand ("two-fifty K", "one-point-two M").
- If the leader asks about a specific account, switch to ops_lookup_account.
- Do NOT create, update, or modify anything. You are listen-and-summarize only.

Never reveal internal staff conflicts, performance issues, or unverified rumors. Stick to system data.`

const AGENTS = [
  {
    name: 'ANC Field Tech',
    first_message: 'Field tech, ready. What\'s broken and where?',
    prompt: FIELD_TECH_PROMPT,
    tools: ['ops_lookup_venue', 'ops_recent_tickets', 'ops_create_ticket', 'ops_update_ticket', 'ops_add_ticket_comment'],
    dynamic_variables: ['staff_email'],
  },
  {
    name: 'ANC CRM Concierge',
    first_message: 'CRM concierge here. Who or what should I pull up?',
    prompt: CRM_PROMPT,
    tools: ['crm_lookup_account', 'crm_lookup_person', 'crm_list_opportunities', 'crm_create_company', 'crm_create_person', 'crm_create_opportunity', 'crm_update_opportunity', 'crm_create_task', 'crm_add_note'],
    dynamic_variables: [],
  },
  {
    name: 'ANC Support Desk',
    first_message: 'Support desk. What ticket are we working?',
    prompt: SUPPORT_PROMPT,
    tools: ['ops_recent_tickets', 'ops_lookup_venue', 'ops_lookup_account', 'ops_create_ticket', 'ops_update_ticket', 'ops_add_ticket_comment', 'crm_create_task'],
    dynamic_variables: ['staff_email'],
  },
  {
    name: 'ANC Ops Briefing',
    first_message: 'Morning. Want today\'s briefing or a specific account?',
    prompt: OPS_BRIEFING_PROMPT,
    tools: ['ops_staff_today', 'ops_pipeline', 'ops_recent_tickets', 'ops_lookup_account', 'ops_lookup_venue'],
    dynamic_variables: [],
  },
]

// ---------- SYNC ----------
async function listTools() {
  const r = await api('GET', '/tools')
  return r.tools || []
}
async function listAgents() {
  const r = await api('GET', '/agents?page_size=100')
  return r.agents || []
}

async function upsertTool(toolConfig) {
  const existing = (await listTools()).find(t => t.tool_config?.name === toolConfig.name)
  if (existing) {
    const updated = await api('PATCH', `/tools/${existing.id}`, { tool_config: toolConfig })
    return { id: updated.id || existing.id, action: 'updated' }
  }
  const created = await api('POST', '/tools', { tool_config: toolConfig })
  return { id: created.id, action: 'created' }
}

async function upsertAgent(agentDef, toolIdByName) {
  const tool_ids = agentDef.tools.map(n => {
    const id = toolIdByName.get(n)
    if (!id) throw new Error(`Tool "${n}" missing for agent ${agentDef.name}`)
    return id
  })
  const dynamic_variable_placeholders = Object.fromEntries(agentDef.dynamic_variables.map(k => [k, '']))

  const conversation_config = {
    agent: {
      first_message: agentDef.first_message,
      language: 'en',
      dynamic_variables: { dynamic_variable_placeholders },
      prompt: {
        prompt: agentDef.prompt,
        llm: 'gemini-2.5-flash',
        temperature: 0.2,
        max_tokens: -1,
        tool_ids,
      },
    },
    tts: { model_id: 'eleven_v3_conversational', voice_id: 'cjVigY5qzO86Huf0OWal' },
    asr: { quality: 'high', provider: 'scribe_realtime' },
  }

  const existing = (await listAgents()).find(a => a.name === agentDef.name)
  if (existing) {
    await api('PATCH', `/agents/${existing.agent_id}`, { name: agentDef.name, conversation_config })
    return { id: existing.agent_id, action: 'updated' }
  }
  const created = await api('POST', '/agents/create', { name: agentDef.name, conversation_config })
  return { id: created.agent_id, action: 'created' }
}

(async () => {
  console.log('— Syncing tools —')
  const toolIdByName = new Map()
  for (const t of TOOLS) {
    try {
      const { id, action } = await upsertTool(t)
      toolIdByName.set(t.name, id)
      console.log(`  ${action.padEnd(7)} ${t.name}  (${id})`)
    } catch (e) {
      console.error(`  FAILED  ${t.name}: ${e.message}`)
      throw e
    }
  }
  console.log('\n— Syncing agents —')
  const results = []
  for (const a of AGENTS) {
    try {
      const { id, action } = await upsertAgent(a, toolIdByName)
      results.push({ name: a.name, id, action })
      console.log(`  ${action.padEnd(7)} ${a.name}  (${id})`)
    } catch (e) {
      console.error(`  FAILED  ${a.name}: ${e.message}`)
      throw e
    }
  }
  console.log('\nDone.\nAgent IDs:')
  for (const r of results) console.log(`  ${r.name.padEnd(22)} ${r.id}`)
})().catch(e => { console.error('\nFAILED:', e.message); process.exit(1) })
