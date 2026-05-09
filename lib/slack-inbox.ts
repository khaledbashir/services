import { query } from '@/lib/db'
import { slackApi } from '@/lib/slack'
import { triage } from '@/lib/service-triage'

/**
 * Slack -> Inbox capture pipeline.
 *
 * Two opt-in capture surfaces, both privacy-respecting (we never silently
 * scrape every message in every channel):
 *
 * 1. Emoji-reaction trigger — when an authorized user adds the configured
 *    triage emoji (default :inbox_tray:) to any message the bot can see,
 *    that message is captured to the Inbox tab on /service-log/change-orders.
 * 2. DM to the bot — any direct message to the bot (not an @-mention)
 *    gets captured.
 *
 * Captured rows live with inbox=true. They don't show on stakeholder boards,
 * don't count toward retainer math, and don't fire alerts. Ahmad reviews
 * them on the Inbox tab and one-click Approve / Reject.
 */

const TRIAGE_EMOJIS = (process.env.SLACK_INBOX_EMOJIS || 'inbox_tray,tray,bookmark,raised_hand,eyes,memo')
  .split(',').map(s => s.trim()).filter(Boolean)

function isAuthorizedReactor(slackUserId: string): boolean {
  const adminIds = (process.env.ANC_SLACK_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean)
  return adminIds.length === 0 || adminIds.includes(slackUserId)
}

async function getSlackUserName(slackUserId: string): Promise<string | null> {
  try {
    const res: any = await slackApi('users.info', { user: slackUserId })
    if (res?.ok && res.user) {
      return res.user.real_name || res.user.profile?.real_name || res.user.name || null
    }
  } catch {}
  return null
}

async function getSlackPermalink(channel: string, ts: string): Promise<string | null> {
  try {
    const res: any = await slackApi('chat.getPermalink', { channel, message_ts: ts })
    if (res?.ok && typeof res.permalink === 'string') return res.permalink
  } catch {}
  return null
}

async function getMessageText(channel: string, ts: string): Promise<{ text: string; user: string | null } | null> {
  try {
    const res: any = await slackApi('conversations.history', {
      channel,
      latest: ts,
      inclusive: true,
      limit: 1,
    })
    if (res?.ok && Array.isArray(res.messages) && res.messages[0]) {
      const m = res.messages[0]
      if (m.bot_id || m.subtype === 'bot_message') return null
      return { text: typeof m.text === 'string' ? m.text : '', user: typeof m.user === 'string' ? m.user : null }
    }
  } catch {}
  return null
}

async function alreadyCaptured(sourceUrl: string): Promise<boolean> {
  if (!sourceUrl) return false
  const r = await query(
    `SELECT 1 FROM service_requests WHERE source_url = $1 LIMIT 1`,
    [sourceUrl],
  ).catch(() => ({ rows: [] }))
  return r.rows.length > 0
}

/**
 * Reaction-triggered inbox capture.
 *
 * Slack `reaction_added` event shape (the relevant bits):
 *   { type: 'reaction_added', user: 'U123', reaction: 'inbox_tray',
 *     item: { type: 'message', channel: 'C123', ts: '1715250000.123' } }
 */
export async function handleSlackReactionAdded(event: any): Promise<void> {
  if (!event || event.type !== 'reaction_added') return
  const reaction = String(event.reaction || '').toLowerCase()
  if (!TRIAGE_EMOJIS.includes(reaction)) return
  const reactorId = String(event.user || '')
  if (!isAuthorizedReactor(reactorId)) return
  const item = event.item
  if (!item || item.type !== 'message' || !item.channel || !item.ts) return

  const permalink = await getSlackPermalink(item.channel, item.ts)
  if (permalink && (await alreadyCaptured(permalink))) return

  const msg = await getMessageText(item.channel, item.ts)
  if (!msg || !msg.text.trim()) return

  const requesterName = msg.user ? (await getSlackUserName(msg.user)) : null

  await triage({
    raw_text: msg.text,
    source: 'slack',
    source_url: permalink || undefined,
    requester: requesterName || undefined,
    inbox: true,
  })
}

/**
 * DM-to-bot inbox capture.
 *
 * Fires from the existing /api/slack/events handler when a message lands in
 * an IM channel and isn't an @-mention (those still go through the assistant
 * flow). Captures to inbox; does NOT reply to the message.
 */
export async function captureDirectMessageToInbox(event: any): Promise<void> {
  if (!event) return
  if (event.subtype === 'bot_message' || event.bot_id) return
  if (event.channel_type !== 'im') return // only DMs
  const text = typeof event.text === 'string' ? event.text.trim() : ''
  if (!text) return
  const channel = String(event.channel || '')
  const ts = String(event.ts || '')
  if (!channel || !ts) return

  const permalink = await getSlackPermalink(channel, ts)
  if (permalink && (await alreadyCaptured(permalink))) return

  const userId = typeof event.user === 'string' ? event.user : null
  const requesterName = userId ? await getSlackUserName(userId) : null

  await triage({
    raw_text: text,
    source: 'slack',
    source_url: permalink || undefined,
    requester: requesterName || undefined,
    inbox: true,
  })
}
