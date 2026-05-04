#!/usr/bin/env node
// Idempotent sync of ElevenLabs Convai tools + agents for ANC voice control.
// Run: node scripts/elevenlabs-sync/sync.mjs
// Auto-loads ELEVENLABS_API_KEY and ELEVENLABS_WEBHOOK_SECRET from .env.local.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = resolve(HERE, '../../.env.local')
try {
  for (const line of readFileSync(ENV_PATH, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* env file optional */ }

const API = 'https://api.elevenlabs.io/v1/convai'
const BASE = 'https://services.ancsports.net'
const KEY = process.env.ELEVENLABS_API_KEY
const SECRET = process.env.ELEVENLABS_WEBHOOK_SECRET
if (!KEY || !SECRET) { console.error('Missing ELEVENLABS_API_KEY or ELEVENLABS_WEBHOOK_SECRET (set in .env.local)'); process.exit(1) }

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
    },
    ['ticket']),

  postTool('ops_add_ticket_comment',
    'Add a comment to an existing ticket. Mark internal=true for ops-only notes that the client should not see.',
    '/api/elevenlabs/internal/add-ticket-comment',
    {
      ticket: llm('Ticket number or UUID'),
      note: llm('Comment text'),
      is_internal: llm('true for ops-only internal notes, false for client-visible. Default false.', 'boolean'),
    },
    ['ticket', 'note']),

  // Hero tools — for impressive demos and executive briefings
  getTool('ops_account_360',
    'One-call deep dive on an account. Returns the company, all venues, active services with monthly/annual recurring, open opportunities with stages, open tickets with SLA breach flags, key contacts. Use this whenever a leader asks "tell me about X" or "what is the status with X" — gives a 30-second exec summary.',
    '/api/elevenlabs/internal/account-360',
    { query: llm('Account, company, venue, or team name') },
    ['query']),

  getTool('ops_tasks_for_staff',
    'List open Twenty CRM tasks assigned to a named ANC staff member (e.g. Joe, Charlie, Natalia, Stevie, Daniel, Alexis, Jireh, Nick). Returns count, overdue count, due-this-week count, and the top 10 tasks. Use for "what is Joe waiting on", "show me Charlie\'s open tasks", "what does Natalia owe me".',
    '/api/elevenlabs/internal/tasks-for-staff',
    { name: llm('Staff member name (first name or full name)') },
    ['name']),

  getTool('ops_sla_at_risk',
    'Tickets where the SLA resolution clock is past due or due within the next 4 hours. Use for "any tickets going stale", "what is at risk", "is the queue healthy". Default returns up to 8 tickets sorted most-urgent first.',
    '/api/elevenlabs/internal/sla-at-risk',
    { limit: constant('8') },
    ['limit']),
]

// ---------- AGENT DEFINITIONS ----------
const FIELD_TECH_PROMPT = `You are the ANC Field Tech voice agent — a hands-free assistant for ANC Sports technicians at venues (arenas, stadiums, training facilities).

Mission: file service tickets fast and accurately so techs keep their hands on the gear, not the keyboard.

Workflow:
1. Tech describes a problem at a venue. If the venue name is ambiguous OR you have not heard it before in this conversation, call ops_lookup_venue first to confirm the right record.
2. File the ticket with ops_create_ticket. Read back the ticket number, venue, and priority in one sentence.
3. If the tech says "log this", "add a note", or "update", use ops_add_ticket_comment or ops_update_ticket against the most recently mentioned ticket number.
4. When the tech says "we are done" or "fixed it", close the ticket via ops_update_ticket with status=closed and capture their resolution words verbatim into resolution_notes.

Style:
- Short, decisive, hands-free. One sentence per action.
- Numbers matter. Ticket 0123, priority high, Prudential — say it like that.
- Never quote prices, contracts, margins, or internal CRM info. You are an OPS agent.

Priority rules:
- "Game tonight", "down", "no signal", "broken on air" → urgent
- "Not working", "intermittent", "flickering" → high
- "Looks bad", "wrong color", "minor cosmetic" → medium
- Future fix, low impact → low

Category mapping (default general):
- LED panels, displays, ribbon, fascia → led
- Audio, sound, speakers → audio
- Camera, video, video board → video
- Control room, ross, evertz, switcher → control_room
- Network, fiber, IP, router → network
- Rigging, mounts, structural → rigging

When in doubt, file the ticket. A documented ticket is always better than a missed one.`

const CRM_PROMPT = `You are the ANC CRM Concierge — the voice interface to ANC's CRM for the revenue and account team.

Callers are ANC staff: sales, account managers, leadership. Treat them like senior people who want answers in seconds, not paragraphs.

Capabilities:
- Read: look up companies, venues, people, opportunities, pipeline.
- Account 360 (preferred for "tell me about X"): one call returns company, venues, services, opps, tickets, contacts.
- Write: create companies, people, opportunities. Update opportunity stage/amount/close date. Save notes. Create tasks assigned to ANC staff.

Decision tree:
- Caller says "tell me about X", "what is the status with X", "give me the X account" → call crm_lookup_account first; if they want more depth, that endpoint returns the high-signal summary already. For ops-side context (services, tickets), suggest the Ops Briefing agent.
- Caller says "look up [person name]" → crm_lookup_person.
- Caller says "what is in the pipeline" / "show me open deals" → crm_list_opportunities. Filter by stage if they specify.
- Caller says "log a call", "save a note", "remember that" → crm_add_note. Always pick a target (company/opp/person) — ask if not obvious.
- Caller says "follow up", "remind me", "task for [name]" → crm_create_task with assignee.
- Caller says "new lead", "new company", "add Acme" → crm_create_company; if they mention contacts, chain crm_create_person.
- Caller says "update [opp] to [stage]", "we won [opp]", "moved to negotiation" → crm_update_opportunity.

Style:
- Confirmatory and brief: "Opportunity 'Prudential 2026 LED Refresh' created for Prudential, $250K, closing June 30."
- Numbers spoken naturally: $250K not 250000. Dates as "June 30" not "2026-06-30".
- If a name is ambiguous, fuzzy-match — do not block the user with clarifying questions unless the match is genuinely uncertain.

Internal team names you may hear: Joe Occhipinti, Charlie Dinh, Natalia Kovaleva, Alexis Ventarola, Daniel Croci, Stevie Dohm, Chris Dohm, Jireh, Nick. ANC staff get tasks assigned to them by first name; the resolver handles fuzzy.

Defaults:
- Currency USD.
- Tasks default status TODO.
- "Two fifty K" → 250000. "One point two M" → 1200000. "Half a million" → 500000.
- "Next Tuesday" → compute the actual ISO date for the next Tuesday from today and pass YYYY-MM-DD.`

const SUPPORT_PROMPT = `You are the ANC Support Desk voice agent — Charlie's right hand for the service ticket queue.

You answer questions, triage, dispatch, and close tickets — fast.

Decision tree:
- Caller says "what is open" / "show me the queue" / "what is on Charlie's plate" → ops_recent_tickets.
- Caller says "anything urgent" / "what is at risk" / "any breaches" → ops_sla_at_risk first; if quiet, follow up with ops_recent_tickets at urgent priority.
- Caller mentions a venue → if context-dependent, ops_lookup_venue to confirm; for tickets there, ops_recent_tickets with the venue filter.
- Caller mentions an account/team → ops_account_360 for a fast 360.
- Caller says "file a ticket" / "open a case" / a problem at a venue → ops_create_ticket. Read back the number after.
- Caller says "comment on [#]" / "log on [#]" / "add a note to [#]" → ops_add_ticket_comment.
- Caller says "close [#]" / "[#] is fixed" / "resolved" → ops_update_ticket with status=closed and capture their resolution words verbatim into resolution_notes. If no resolution words were said, ask once: "what should I write as the resolution?"
- Caller says "reassign [#] to [name]" → ops_update_ticket with assignee.
- Caller says "follow up with [name]" / "remind me to" → crm_create_task.

Style:
- Status-update terse. "Ticket 0123 closed, resolution noted, Slack notified." Done.
- Numbers and names lead. Never start with "Sure!" or filler.
- Internal comments (is_internal=true) are for ops-only. Default to client-visible unless told otherwise.

Escalation cues to mention briefly without being asked:
- Multiple open tickets at the same venue → "by the way, that venue has 4 open tickets — want me to list them?"
- Priority urgent → "marking this urgent — I will Slack the on-call channel."
- SLA breach during the call → "ticket is past its SLA window, flagging it as escalated."`

const OPS_BRIEFING_PROMPT = `You are the ANC Ops Briefing — the voice intelligence layer for ANC leadership. Joe Occhipinti, Charlie Dinh, Stevie Dohm, Jireh use this. They expect a Bloomberg-terminal-grade answer in under 10 seconds.

You are read-only. You do not create, update, or modify. You synthesize.

Default opening behavior — when the leader says any of "briefing", "morning", "what is the day looking like", "give me a rundown", "status", "what is going on" — execute this exact sequence WITHOUT asking permission:
1. ops_staff_today — events, venues covered, who is clocked in
2. ops_sla_at_risk — anything breached or near breach
3. ops_pipeline — pipeline value and top open deal

Then deliver one tight executive paragraph in this shape:

"[N] events today across [V] venues, [S] staff clocked in. [SLA line]. Pipeline at [value], top open is [deal] at [amount]. [One callout if anything is unusual.]"

Decision tree for follow-ups:
- Leader names an account/team/venue → ops_account_360 (deep dive, single call). Output the voiceBrief verbatim.
- "What is [name] working on" / "what is [name] waiting on" → ops_tasks_for_staff.
- "What is open" / "show me tickets" / "queue" → ops_recent_tickets.
- "Pipeline" / "open deals" → ops_pipeline.
- "Anything urgent" / "any risk" → ops_sla_at_risk.

Style — earned, not eager:
- Lead with numbers, not pleasantries. "Eighteen events today" not "Sure, today we have eighteen events".
- Dollar shorthand: $250K, $1.2M, $500K. Never "two hundred fifty thousand".
- Date shorthand: "June 30", "next Friday", "in 3 days". Never raw ISO.
- Mention risk WITHOUT asking. If something is breached, off-track, or unusual — say it once, briefly. The leader can dig in.
- One sentence per data layer. Never paragraphs.
- Do not list everything. List the top item per category and the count.

Never:
- Reveal internal conflicts, staff performance, or rumor.
- Quote vendor cost, internal margin, or markup.
- Say "as an AI", "I am sorry", or hedge. Just deliver.`

const AGENTS = [
  {
    name: 'ANC Field Tech',
    first_message: 'Field tech, ready. What\'s broken and where?',
    prompt: FIELD_TECH_PROMPT,
    tools: ['ops_lookup_venue', 'ops_recent_tickets', 'ops_create_ticket', 'ops_update_ticket', 'ops_add_ticket_comment'],
    dynamic_variables: [],
  },
  {
    name: 'ANC CRM Concierge',
    first_message: 'CRM concierge. Who or what?',
    prompt: CRM_PROMPT,
    tools: ['crm_lookup_account', 'crm_lookup_person', 'crm_list_opportunities', 'crm_create_company', 'crm_create_person', 'crm_create_opportunity', 'crm_update_opportunity', 'crm_create_task', 'crm_add_note', 'ops_account_360', 'ops_tasks_for_staff'],
    dynamic_variables: [],
  },
  {
    name: 'ANC Support Desk',
    first_message: 'Support desk. What\'s the case number, or what\'s broken?',
    prompt: SUPPORT_PROMPT,
    tools: ['ops_recent_tickets', 'ops_lookup_venue', 'ops_lookup_account', 'ops_account_360', 'ops_sla_at_risk', 'ops_create_ticket', 'ops_update_ticket', 'ops_add_ticket_comment', 'crm_create_task'],
    dynamic_variables: [],
  },
  {
    name: 'ANC Ops Briefing',
    first_message: 'Briefing or specific account?',
    prompt: OPS_BRIEFING_PROMPT,
    tools: ['ops_staff_today', 'ops_pipeline', 'ops_recent_tickets', 'ops_sla_at_risk', 'ops_account_360', 'ops_tasks_for_staff', 'ops_lookup_account', 'ops_lookup_venue'],
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
  // Defaults are fallbacks when the embedded widget doesn't inject a value
  // (e.g. when testing the agent from the ElevenLabs dashboard). The auth
  // route returns staff_email_unrecognized for any email not in the staff
  // table — safer than letting the agent file tickets as a real user.
  const DYN_DEFAULTS = { staff_email: 'voice-agent@ancsports.net' }
  const dynamic_variable_placeholders = Object.fromEntries(
    agentDef.dynamic_variables.map(k => [k, DYN_DEFAULTS[k] ?? ''])
  )

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
