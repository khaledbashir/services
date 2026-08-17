import { query } from '@/lib/db'
import { sendSlackMessageDetailed, sendTicketNotification, slackApi } from '@/lib/slack'
import { Maintenance, Walkthroughs, dashboardVenueIdToTwentyId, isTwentyBackedEnabled } from '@/lib/twenty-ops'
import { dashboardUrl as canonicalDashboardUrl } from '@/lib/app-url'

const CLAW_STAFF_ID = process.env.OPENCLAW_CLAW_STAFF_ID || '7fb556c3-5d2d-430a-b3dc-42f58d79be33'
const TICKET_REACTIONS = (process.env.SLACK_TICKET_EMOJIS || 'ticket,admission_tickets')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean)
const MAINTENANCE_REACTIONS = (process.env.SLACK_MAINTENANCE_EMOJIS || 'wrench,hammer_and_wrench,toolbox')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean)
const WALKTHROUGH_REACTIONS = (process.env.SLACK_WALKTHROUGH_EMOJIS || 'walking,clipboard')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean)

type SlackWorklogKind = 'ticket' | 'maintenance' | 'walkthrough'

interface SlackChannelConfig {
  channel_id: string
  channel_name?: string | null
  venue_id: string
  venue_name: string
  enabled: boolean
  auto_create_tickets: boolean
  silent_mode: boolean
  triage_channel_id?: string | null
  default_priority: string
  default_category: string
  request_type: string
}

interface SlackMessageSnapshot {
  text: string
  user: string | null
  ts: string
  threadTs: string
  permalink?: string | null
  threadText?: string
}

function cleanText(text: string): string {
  return text
    .replace(/<https?:\/\/[^|>]+\|([^>]+)>/g, '$1')
    .replace(/<(@|#)[^>|]+\|([^>]+)>/g, '$2')
    .replace(/<(@|#)?([^>]+)>/g, '$2')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleFromSlackText(text: string): string {
  const firstLine = cleanText(text).split(/\n/)[0]?.trim() || 'Slack request'
  return firstLine.length > 96 ? `${firstLine.slice(0, 93).trim()}...` : firstLine
}

function validPriority(value?: string | null): string {
  return ['low', 'medium', 'high', 'critical'].includes(String(value)) ? String(value) : 'medium'
}

async function slackUserName(slackUserId?: string | null): Promise<string | null> {
  if (!slackUserId) return null
  try {
    const res = await slackApi('users.info', { user: slackUserId })
    return res?.user?.profile?.display_name || res?.user?.real_name || res?.user?.name || slackUserId
  } catch {
    return slackUserId
  }
}

async function resolveStaffId(slackUserId?: string | null): Promise<string | null> {
  if (slackUserId) {
    const mapped = await query(
      `SELECT id FROM staff WHERE $1 = ANY(slack_user_ids) LIMIT 1`,
      [slackUserId],
    )
    if (mapped.rows[0]?.id) return mapped.rows[0].id
  }

  const claw = await query(`SELECT id FROM staff WHERE id = $1 LIMIT 1`, [CLAW_STAFF_ID]).catch(() => ({ rows: [] }))
  if (claw.rows[0]?.id) return claw.rows[0].id

  const fallback = await query(
    `SELECT id FROM staff
     WHERE COALESCE(is_active, true) = true
     ORDER BY (role = 'admin') DESC, (role = 'manager') DESC, created_at ASC
     LIMIT 1`,
  ).catch(() => ({ rows: [] }))
  return fallback.rows[0]?.id || null
}

function dashboardUrl(path: string): string {
  return canonicalDashboardUrl(path)
}

export async function getSlackChannelConfig(channelId: string): Promise<SlackChannelConfig | null> {
  const configured = await query(
    `SELECT src.channel_id, src.channel_name, src.venue_id, v.name AS venue_name,
            src.enabled, src.auto_create_tickets, src.silent_mode, src.triage_channel_id,
            src.default_priority, src.default_category, src.request_type
     FROM slack_request_channels src
     JOIN venues v ON v.id = src.venue_id
     WHERE src.channel_id = $1 AND src.enabled = true
     LIMIT 1`,
    [channelId],
  )
  if (configured.rows[0]?.venue_id) return configured.rows[0] as SlackChannelConfig

  // Backward-compatible bridge: existing venue.slack_channel_id mappings
  // work for manual emoji capture even before an admin creates a full config.
  const venueMapped = await query(
    `SELECT $1::text AS channel_id, NULL::text AS channel_name, v.id AS venue_id, v.name AS venue_name,
            true AS enabled, false AS auto_create_tickets, false AS silent_mode, NULL::text AS triage_channel_id,
            'medium'::text AS default_priority, 'slack'::text AS default_category, 'Support'::text AS request_type
     FROM venues v
     WHERE v.slack_channel_id = $1
     LIMIT 1`,
    [channelId],
  )
  return venueMapped.rows[0] ? venueMapped.rows[0] as SlackChannelConfig : null
}

async function getPermalink(channel: string, ts: string): Promise<string | null> {
  try {
    const res = await slackApi('chat.getPermalink', { channel, message_ts: ts })
    return res?.ok && typeof res.permalink === 'string' ? res.permalink : null
  } catch {
    return null
  }
}

async function fetchSlackMessage(channelId: string, ts: string, fallback?: Partial<SlackMessageSnapshot>): Promise<SlackMessageSnapshot | null> {
  let message: any = null
  try {
    const res = await slackApi('conversations.history', {
      channel: channelId,
      latest: ts,
      inclusive: true,
      limit: 1,
    })
    message = Array.isArray(res?.messages) ? res.messages[0] : null
  } catch {}

  if (!message && !fallback?.text) return null
  const text = typeof message?.text === 'string' ? message.text : String(fallback?.text || '')
  const user = typeof message?.user === 'string' ? message.user : fallback?.user || null
  const threadTs = typeof message?.thread_ts === 'string' ? message.thread_ts : fallback?.threadTs || ts
  const permalink = await getPermalink(channelId, ts)

  let threadText = ''
  try {
    const replies = await slackApi('conversations.replies', { channel: channelId, ts: threadTs, limit: 12 })
    const messages = Array.isArray(replies?.messages) ? replies.messages : []
    threadText = messages
      .filter((m: any) => m?.text && !m?.bot_id && m?.subtype !== 'bot_message')
      .map((m: any) => `- ${cleanText(String(m.text))}`)
      .join('\n')
  } catch {}

  return { text, user, ts, threadTs, permalink, threadText }
}

export async function createTicketFromSlackThread(params: {
  channelId: string
  threadTs: string
  sourceMessageTs?: string
  actorSlackUserId?: string
  createdFrom: 'emoji' | 'auto' | 'slash' | 'assistant'
  fallbackText?: string
}): Promise<{ ok: boolean; ticket?: any; existing?: boolean; error?: string; text?: string }> {
  const config = await getSlackChannelConfig(params.channelId)
  if (!config) return { ok: false, error: 'channel_not_configured', text: 'This Slack channel is not connected to a Services venue yet.' }

  const sourceMessageTs = params.sourceMessageTs || params.threadTs
  const message = await fetchSlackMessage(params.channelId, sourceMessageTs, {
    text: params.fallbackText,
    user: params.actorSlackUserId || null,
    threadTs: params.threadTs,
    ts: sourceMessageTs,
  })
  if (!message || !message.text.trim()) return { ok: false, error: 'empty_message', text: 'I could not find message text to turn into a ticket.' }

  const effectiveThreadTs = message.threadTs || params.threadTs
  const existing = await query(
    `SELECT st.ticket_id, t.ticket_number, t.title
     FROM slack_ticket_threads st
     JOIN tickets t ON t.id = st.ticket_id
     WHERE st.channel_id = $1 AND st.thread_ts = $2
     LIMIT 1`,
    [params.channelId, effectiveThreadTs],
  )
  if (existing.rows[0]) {
    const t = existing.rows[0]
    return {
      ok: true,
      existing: true,
      ticket: t,
      text: `Already tracking this thread as T-${String(t.ticket_number).padStart(5, '0')}: ${t.title}`,
    }
  }

  const requesterName = await slackUserName(message.user || params.actorSlackUserId)
  const createdBy = await resolveStaffId(params.actorSlackUserId || message.user)
  const title = titleFromSlackText(message.text)
  const priority = validPriority(config.default_priority)
  const category = config.default_category || 'slack'
  const description = [
    cleanText(message.text),
    message.threadText ? `\nSlack thread context:\n${message.threadText}` : '',
    `\nSource: Slack ${params.createdFrom}`,
    requesterName ? `Requester: ${requesterName}` : '',
    message.permalink ? `Thread: ${message.permalink}` : '',
  ].filter(Boolean).join('\n')

  const result = await query(
    `INSERT INTO tickets (venue_id, created_by, title, description, priority, status, category, source, ticket_type, contact_name)
     VALUES ($1, $2, $3, $4, $5, 'new', $6, 'slack', 'support', $7)
     RETURNING id, ticket_number, title, priority, status, category`,
    [config.venue_id, createdBy, title, description, priority, category, requesterName],
  )
  const ticket = result.rows[0]

  await query(
    `INSERT INTO slack_ticket_threads (channel_id, thread_ts, ticket_id, created_by_slack_user_id, created_from, source_message_ts, source_permalink)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (channel_id, thread_ts) DO NOTHING`,
    [params.channelId, effectiveThreadTs, ticket.id, params.actorSlackUserId || message.user, params.createdFrom, sourceMessageTs, message.permalink || null],
  )
  await query(
    `INSERT INTO slack_worklog_threads (
       channel_id, thread_ts, entity_type, entity_id, created_by_slack_user_id,
       created_from, source_message_ts, source_permalink, summary
     ) VALUES ($1,$2,'ticket',$3,$4,$5,$6,$7,$8)
     ON CONFLICT (channel_id, thread_ts, entity_type) DO NOTHING`,
    [params.channelId, effectiveThreadTs, String(ticket.id), params.actorSlackUserId || message.user, params.createdFrom, sourceMessageTs, message.permalink || null, ticket.title],
  )
  await query(
    `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
     VALUES ('ticket_created_from_slack', 'ticket', $1, $2, $3)`,
    [ticket.id, createdBy, JSON.stringify({ venue_name: config.venue_name, channel_id: params.channelId, thread_ts: effectiveThreadTs })],
  ).catch(() => undefined)

  if (!config.silent_mode && params.createdFrom !== 'slash') {
    await sendSlackMessageDetailed({
      channel: params.channelId,
      thread_ts: effectiveThreadTs,
      text: `Created T-${String(ticket.ticket_number).padStart(5, '0')}: ${ticket.title}`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `:ticket: *Created T-${String(ticket.ticket_number).padStart(5, '0')}* for *${config.venue_name}*\n${ticket.title}` } },
        { type: 'section', text: { type: 'mrkdwn', text: `<${dashboardUrl(`/tickets/${ticket.id}`)}|:link: View Ticket>` } },
      ],
    })
  }

  if (config.triage_channel_id && config.triage_channel_id !== params.channelId) {
    await sendTicketNotification({
      id: ticket.id,
      ticket_number: ticket.ticket_number,
      title: ticket.title,
      category: ticket.category || category,
      priority: ticket.priority || priority,
      venue_name: config.venue_name,
      description,
    }, 'created', config.triage_channel_id)
  }

  return { ok: true, ticket, text: `Created T-${String(ticket.ticket_number).padStart(5, '0')}: ${ticket.title}` }
}

async function createMaintenanceFromSlackThread(params: {
  channelId: string
  threadTs: string
  sourceMessageTs?: string
  actorSlackUserId?: string
  createdFrom: 'emoji' | 'auto' | 'slash' | 'assistant'
  fallbackText?: string
}): Promise<{ ok: boolean; log?: any; existing?: boolean; error?: string; text?: string }> {
  const config = await getSlackChannelConfig(params.channelId)
  if (!config) return { ok: false, error: 'channel_not_configured', text: 'This Slack channel is not connected to a Services venue yet.' }

  const sourceMessageTs = params.sourceMessageTs || params.threadTs
  const message = await fetchSlackMessage(params.channelId, sourceMessageTs, {
    text: params.fallbackText,
    user: params.actorSlackUserId || null,
    threadTs: params.threadTs,
    ts: sourceMessageTs,
  })
  if (!message || !message.text.trim()) return { ok: false, error: 'empty_message', text: 'I could not find message text to turn into a maintenance log.' }

  const effectiveThreadTs = message.threadTs || params.threadTs
  const existing = await query(
    `SELECT entity_id, summary
     FROM slack_worklog_threads
     WHERE channel_id = $1 AND thread_ts = $2 AND entity_type = 'maintenance'
     LIMIT 1`,
    [params.channelId, effectiveThreadTs],
  )
  if (existing.rows[0]) {
    return {
      ok: true,
      existing: true,
      log: { id: existing.rows[0].entity_id, issue: existing.rows[0].summary },
      text: `Already tracking this thread as maintenance: ${existing.rows[0].summary || existing.rows[0].entity_id}`,
    }
  }

  const createdBy = await resolveStaffId(params.actorSlackUserId || message.user)
  const title = titleFromSlackText(message.text)
  const description = [
    cleanText(message.text),
    message.threadText ? `\nSlack thread context:\n${message.threadText}` : '',
    `\nSource: Slack ${params.createdFrom}`,
    message.permalink ? `Thread: ${message.permalink}` : '',
  ].filter(Boolean).join('\n')

  let log: any
  if (isTwentyBackedEnabled('MAINTENANCE')) {
    const twentyVenueId = await dashboardVenueIdToTwentyId(config.venue_id).catch(() => null)
    log = await Maintenance.create({
      name: title,
      issue: title,
      issueSummary: { markdown: description },
      detailsToResolve: { markdown: description },
      locationReported: config.venue_name,
      maintenanceType: 'MAINTENANCE_TYPE_REACTIVE',
      status: 'STATUS_OPEN',
      maintenanceStationId: twentyVenueId,
    } as any)
  } else {
    const result = await query(
      `INSERT INTO maintenance_logs (
         venue_id, technician_id, maintenance_type, issue, issue_summary,
         details_to_resolve, status, reported_date, location_reported
       ) VALUES ($1,$2,'reactive',$3,$4,$5,'open',CURRENT_DATE,$6)
       RETURNING id, issue, status`,
      [config.venue_id, createdBy, title, title, description, config.venue_name],
    )
    log = result.rows[0]
  }

  await query(
    `INSERT INTO slack_worklog_threads (
       channel_id, thread_ts, entity_type, entity_id, created_by_slack_user_id,
       created_from, source_message_ts, source_permalink, summary
     ) VALUES ($1,$2,'maintenance',$3,$4,$5,$6,$7,$8)
     ON CONFLICT (channel_id, thread_ts, entity_type) DO NOTHING`,
    [params.channelId, effectiveThreadTs, String(log.id), params.actorSlackUserId || message.user, params.createdFrom, sourceMessageTs, message.permalink || null, title],
  )

  if (!config.silent_mode && params.createdFrom !== 'slash') {
    await sendSlackMessageDetailed({
      channel: params.channelId,
      thread_ts: effectiveThreadTs,
      text: `Maintenance log created: ${title}`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `:wrench: *Maintenance log created* for *${config.venue_name}*\n${title}` } },
        { type: 'section', text: { type: 'mrkdwn', text: `<${dashboardUrl('/maintenance')}|:link: View Maintenance>` } },
      ],
    })
  }

  return { ok: true, log, text: `Maintenance log created: ${title}` }
}

async function createWalkthroughFromSlackThread(params: {
  channelId: string
  threadTs: string
  sourceMessageTs?: string
  actorSlackUserId?: string
  createdFrom: 'emoji' | 'auto' | 'slash' | 'assistant'
  fallbackText?: string
}): Promise<{ ok: boolean; walkthrough?: any; existing?: boolean; error?: string; text?: string }> {
  const config = await getSlackChannelConfig(params.channelId)
  if (!config) return { ok: false, error: 'channel_not_configured', text: 'This Slack channel is not connected to a Services venue yet.' }

  const sourceMessageTs = params.sourceMessageTs || params.threadTs
  const message = await fetchSlackMessage(params.channelId, sourceMessageTs, {
    text: params.fallbackText,
    user: params.actorSlackUserId || null,
    threadTs: params.threadTs,
    ts: sourceMessageTs,
  })
  if (!message || !message.text.trim()) return { ok: false, error: 'empty_message', text: 'I could not find message text to turn into a walkthrough log.' }

  const effectiveThreadTs = message.threadTs || params.threadTs
  const existing = await query(
    `SELECT entity_id, summary
     FROM slack_worklog_threads
     WHERE channel_id = $1 AND thread_ts = $2 AND entity_type = 'walkthrough'
     LIMIT 1`,
    [params.channelId, effectiveThreadTs],
  )
  if (existing.rows[0]) {
    return {
      ok: true,
      existing: true,
      walkthrough: { id: existing.rows[0].entity_id, result: existing.rows[0].summary },
      text: `Already tracking this thread as a walkthrough: ${existing.rows[0].summary || existing.rows[0].entity_id}`,
    }
  }

  const createdBy = await resolveStaffId(params.actorSlackUserId || message.user)
  const requesterName = await slackUserName(message.user || params.actorSlackUserId)
  const title = titleFromSlackText(message.text)
  const notes = [
    cleanText(message.text),
    message.threadText ? `\nSlack thread context:\n${message.threadText}` : '',
    `\nSource: Slack ${params.createdFrom}`,
    message.permalink ? `Thread: ${message.permalink}` : '',
  ].filter(Boolean).join('\n')

  let walkthrough: any
  if (isTwentyBackedEnabled('WALKTHROUGHS')) {
    walkthrough = await Walkthroughs.create({
      name: title,
      logDate: new Date().toISOString().slice(0, 10),
      notes: { markdown: notes },
      result: 'good',
    } as any)
  } else {
    const result = await query(
      `INSERT INTO walkthrough_logs (
         venue_id, technician_id, log_date, locations_visited, issues_found,
         result, in_person, technician_name, notes
       ) VALUES ($1,$2,CURRENT_DATE,$3,$4,'good',true,$5,$6)
       RETURNING id, result, log_date`,
      [config.venue_id, createdBy, config.venue_name, null, requesterName, notes],
    )
    walkthrough = result.rows[0]
  }

  await query(
    `INSERT INTO slack_worklog_threads (
       channel_id, thread_ts, entity_type, entity_id, created_by_slack_user_id,
       created_from, source_message_ts, source_permalink, summary
     ) VALUES ($1,$2,'walkthrough',$3,$4,$5,$6,$7,$8)
     ON CONFLICT (channel_id, thread_ts, entity_type) DO NOTHING`,
    [params.channelId, effectiveThreadTs, String(walkthrough.id), params.actorSlackUserId || message.user, params.createdFrom, sourceMessageTs, message.permalink || null, title],
  )

  if (!config.silent_mode && params.createdFrom !== 'slash') {
    await sendSlackMessageDetailed({
      channel: params.channelId,
      thread_ts: effectiveThreadTs,
      text: `Walkthrough log created: ${title}`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `:clipboard: *Walkthrough log created* for *${config.venue_name}*\n${title}` } },
        { type: 'section', text: { type: 'mrkdwn', text: `<${dashboardUrl('/walkthroughs')}|:link: View Walkthroughs>` } },
      ],
    })
  }

  return { ok: true, walkthrough, text: `Walkthrough log created: ${title}` }
}

export async function createWorklogFromSlackThread(params: {
  kind: SlackWorklogKind
  channelId: string
  threadTs: string
  sourceMessageTs?: string
  actorSlackUserId?: string
  createdFrom: 'emoji' | 'auto' | 'slash' | 'assistant'
  fallbackText?: string
}) {
  if (params.kind === 'ticket') return createTicketFromSlackThread(params)
  if (params.kind === 'maintenance') return createMaintenanceFromSlackThread(params)
  return createWalkthroughFromSlackThread(params)
}

export async function handleSlackServiceDeskEvent(event: any): Promise<void> {
  if (!event || event.bot_id || event.subtype === 'bot_message') return

  if (event.type === 'reaction_added') {
    const reaction = String(event.reaction || '').toLowerCase()
    const kind: SlackWorklogKind | null = TICKET_REACTIONS.includes(reaction)
      ? 'ticket'
      : MAINTENANCE_REACTIONS.includes(reaction)
        ? 'maintenance'
        : WALKTHROUGH_REACTIONS.includes(reaction)
          ? 'walkthrough'
          : null
    if (!kind) return
    const item = event.item
    if (!item || item.type !== 'message' || !item.channel || !item.ts) return
    await createWorklogFromSlackThread({
      kind,
      channelId: String(item.channel),
      threadTs: String(item.ts),
      sourceMessageTs: String(item.ts),
      actorSlackUserId: typeof event.user === 'string' ? event.user : undefined,
      createdFrom: 'emoji',
    })
    return
  }

  if (event.type === 'message') {
    const channelId = typeof event.channel === 'string' ? event.channel : ''
    const ts = typeof event.ts === 'string' ? event.ts : ''
    if (!channelId || !ts || event.thread_ts) return
    const config = await getSlackChannelConfig(channelId)
    if (!config?.auto_create_tickets) return

    const text = typeof event.text === 'string' ? event.text : ''
    const cleaned = cleanText(text).toLowerCase()
    if (!cleaned || cleaned.includes('@channel') || cleaned.includes('@here')) return
    await createTicketFromSlackThread({
      channelId,
      threadTs: ts,
      sourceMessageTs: ts,
      actorSlackUserId: typeof event.user === 'string' ? event.user : undefined,
      createdFrom: 'auto',
      fallbackText: text,
    })
  }
}
