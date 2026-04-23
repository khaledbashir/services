import crypto from 'node:crypto'
import { query } from '@/lib/db'
import { runChat, type StreamEvent } from '@/lib/ai/agent'
import type { AgentRole } from '@/lib/ai/types'
import { slackApi } from '@/lib/slack'

const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || ''
const CLAW_STAFF_ID = process.env.OPENCLAW_CLAW_STAFF_ID || '7fb556c3-5d2d-430a-b3dc-42f58d79be33'

export interface SlackResolvedCaller {
  userId: string
  userRole: AgentRole
  userName?: string
}

export function verifySlackSignature(headers: Headers, rawBody: string): boolean {
  if (!SIGNING_SECRET) return false
  const timestamp = headers.get('x-slack-request-timestamp') || ''
  const signature = headers.get('x-slack-signature') || ''
  if (!timestamp || !signature) return false

  const age = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(age) || age > 60 * 5) return false

  const base = `v0:${timestamp}:${rawBody}`
  const expected = `v0=${crypto.createHmac('sha256', SIGNING_SECRET).update(base).digest('hex')}`
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function markSlackEventProcessed(eventId: string): Promise<boolean> {
  const inserted = await query(
    `INSERT INTO slack_processed_events (event_id) VALUES ($1)
     ON CONFLICT (event_id) DO NOTHING
     RETURNING event_id`,
    [eventId]
  )
  return inserted.rows.length > 0
}

export async function resolveSlackCaller(slackUserId?: string): Promise<SlackResolvedCaller | null> {
  if (!slackUserId) return null

  const mapped = await query(
    `SELECT id, COALESCE(role,'technician') AS role, COALESCE(full_name, email) AS name
     FROM staff WHERE $1 = ANY(slack_user_ids) LIMIT 1`,
    [slackUserId]
  )
  if (mapped.rows.length > 0) {
    const row = mapped.rows[0]
    return { userId: row.id, userRole: row.role as AgentRole, userName: row.name }
  }

  const adminIds = (process.env.ANC_SLACK_ADMIN_IDS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  if (adminIds.includes(slackUserId)) {
    return { userId: CLAW_STAFF_ID, userRole: 'admin', userName: 'Claw (Slack admin)' }
  }

  return null
}

export function cleanSlackPrompt(text: string, botUserId?: string): string {
  let out = text || ''
  if (botUserId) {
    const mention = new RegExp(`<@${botUserId}>`, 'g')
    out = out.replace(mention, ' ')
  }
  return out.replace(/\s+/g, ' ').trim()
}

function cleanSlackReply(text: string): string {
  return text
    .replace(/<suggestions>[\s\S]*?<\/suggestions>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function lookupUserLabel(userId: string, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(userId)
  if (hit) return hit

  try {
    const res = await slackApi('users.info', { user: userId })
    const label =
      res?.user?.profile?.display_name ||
      res?.user?.real_name ||
      res?.user?.name ||
      userId
    cache.set(userId, label)
    return label
  } catch {
    cache.set(userId, userId)
    return userId
  }
}

export async function getSlackConversationContext(params: {
  channelId: string
  threadTs: string
  currentTs?: string
  limit?: number
}): Promise<string> {
  const limit = params.limit || 12
  const cache = new Map<string, string>()

  let messages: any[] = []
  try {
    if (params.threadTs && params.currentTs && params.threadTs !== params.currentTs) {
      const replies = await slackApi('conversations.replies', {
        channel: params.channelId,
        ts: params.threadTs,
        limit,
      })
      messages = replies?.messages || []
    } else {
      const history = await slackApi('conversations.history', {
        channel: params.channelId,
        latest: params.currentTs || undefined,
        inclusive: true,
        limit,
      })
      messages = (history?.messages || []).reverse()
    }
  } catch {
    return ''
  }

  const lines: string[] = []
  for (const message of messages.slice(-limit)) {
    if (message?.subtype === 'bot_message') continue
    const raw = typeof message?.text === 'string' ? message.text.replace(/\s+/g, ' ').trim() : ''
    if (!raw) continue
    const who = message.user ? await lookupUserLabel(message.user, cache) : 'unknown'
    lines.push(`- ${who}: ${raw}`)
  }
  return lines.join('\n')
}

export async function resolveSlackThreadChat(params: {
  channelId: string
  threadTs: string
  caller: SlackResolvedCaller
}): Promise<string> {
  const existing = await query(
    `SELECT chat_id FROM slack_ai_threads WHERE channel_id = $1 AND thread_ts = $2 LIMIT 1`,
    [params.channelId, params.threadTs]
  )
  if (existing.rows[0]?.chat_id) return existing.rows[0].chat_id

  const created = await query(
    `INSERT INTO ai_chats (user_id, title) VALUES ($1, $2) RETURNING id`,
    [params.caller.userId, `Slack ${params.channelId} ${params.threadTs}`]
  )
  const chatId = created.rows[0].id
  await query(
    `INSERT INTO slack_ai_threads (channel_id, thread_ts, chat_id, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (channel_id, thread_ts) DO NOTHING`,
    [params.channelId, params.threadTs, chatId, params.caller.userId]
  )
  return chatId
}

export async function runSlackAssistantTurn(params: {
  caller: SlackResolvedCaller
  channelId: string
  threadTs: string
  eventTs?: string
  prompt: string
}): Promise<string> {
  const chatId = await resolveSlackThreadChat({
    channelId: params.channelId,
    threadTs: params.threadTs,
    caller: params.caller,
  })
  await query(
    `UPDATE slack_ai_threads SET last_message_at = NOW()
     WHERE channel_id = $1 AND thread_ts = $2`,
    [params.channelId, params.threadTs]
  )

  const recentContext = await getSlackConversationContext({
    channelId: params.channelId,
    threadTs: params.threadTs,
    currentTs: params.eventTs,
  })

  const userMessage = [
    `SLACK CHANNEL ID: ${params.channelId}`,
    `SLACK THREAD TS: ${params.threadTs}`,
    recentContext ? `RECENT SLACK CONTEXT:\n${recentContext}` : '',
    `USER REQUEST:\n${params.prompt}`,
    'If the request refers to "what did I miss", prioritize summarizing the recent Slack context before taking any tool action.',
    'If you create a Slack canvas, use the current channel_id unless the user explicitly asks for a different place.',
  ].filter(Boolean).join('\n\n')

  let finalText = ''
  const emit = (event: StreamEvent) => {
    if (event.type === 'text' && typeof event.data === 'string') finalText = event.data
    if (event.type === 'error' && typeof event.data === 'string') finalText = `I hit an error: ${event.data}`
  }

  await runChat({
    chatId,
    userId: params.caller.userId,
    userRole: params.caller.userRole,
    userName: params.caller.userName,
    userMessage,
    channel: 'slack',
    emit,
  })

  return cleanSlackReply(finalText) || 'I could not produce a response.'
}
