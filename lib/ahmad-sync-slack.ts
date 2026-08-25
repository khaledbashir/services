import { query } from '@/lib/db'
import { slackApiForm } from '@/lib/slack'
import { classifyAhmadSyncSlackMessage } from '@/lib/ahmad-sync-slack-classifier'

function stripSlackMarkup(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+>/g, ' ')
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')
    .replace(/<([^>|]+)\|([^>]+)>/g, '$2')
    .replace(/<([^>]+)>/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleFrom(text: string): string {
  const cleaned = stripSlackMarkup(text)
    .replace(/^ahmad[,\s:—-]*/i, '')
    .replace(/^anc[,\s:—-]*/i, '')
    .trim()
  const sentence = cleaned.split(/[.!?\n]/).find(Boolean)?.trim() || cleaned
  return sentence.length > 120 ? `${sentence.slice(0, 117).trim()}...` : sentence || 'Slack work item'
}

async function lookupUserLabel(userId?: string): Promise<string | null> {
  if (!userId) return null
  try {
    const res: any = await slackApiForm('users.info', { user: userId })
    if (res?.ok && res.user) return res.user.profile?.display_name || res.user.real_name || res.user.name || userId
  } catch {}
  return userId
}

async function lookupChannelLabel(channelId?: string): Promise<string | null> {
  if (!channelId) return null
  try {
    const res: any = await slackApiForm('conversations.info', { channel: channelId })
    if (res?.ok && res.channel) return res.channel.name || channelId
  } catch {}
  return channelId
}

async function getPermalink(channelId: string, messageTs: string): Promise<string | null> {
  try {
    const res: any = await slackApiForm('chat.getPermalink', { channel: channelId, message_ts: messageTs })
    if (res?.ok && typeof res.permalink === 'string') return res.permalink
  } catch {}
  return null
}

export async function captureAhmadSyncSlackMessage(event: any, _botUserId?: string): Promise<boolean> {
  const eventType = classifyAhmadSyncSlackMessage(event)
  if (!eventType) return false

  const channelId = typeof event.channel === 'string' ? event.channel : ''
  const messageTs = typeof event.ts === 'string' ? event.ts : ''
  const threadTs = typeof event.thread_ts === 'string' ? event.thread_ts : messageTs
  const requesterSlackUserId = typeof event.user === 'string' ? event.user : null
  const rawText = typeof event.text === 'string' ? event.text : ''
  if (!channelId || !messageTs || !rawText.trim()) return false

  const [requesterName, channelName, sourcePermalink] = await Promise.all([
    lookupUserLabel(requesterSlackUserId || undefined),
    lookupChannelLabel(channelId),
    getPermalink(channelId, messageTs),
  ])
  const title = titleFrom(rawText)
  const status = eventType === 'shipped' ? 'done' : 'new'
  const slackEpoch = Number(messageTs) || Date.now() / 1000
  const result = await query(
    `INSERT INTO ahmad_sync_events (
       created_at, event_type, actor, headline, detail, status,
       source_channel_id, source_channel_name, source_message_ts, source_thread_ts,
       requester_slack_user_id, source_permalink
     ) VALUES (to_timestamp($1),$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (source_channel_id, source_message_ts, event_type) WHERE source_message_ts IS NOT NULL
     DO UPDATE SET actor = EXCLUDED.actor,
                   headline = EXCLUDED.headline,
                   source_channel_name = EXCLUDED.source_channel_name,
                   source_permalink = COALESCE(EXCLUDED.source_permalink, ahmad_sync_events.source_permalink)
     RETURNING id`,
    [
      slackEpoch,
      eventType,
      requesterName || (eventType === 'shipped' ? 'Ahmad' : requesterSlackUserId || 'ANC'),
      title,
      eventType === 'shipped' ? `Shipped in #${channelName || channelId}` : `Requested in #${channelName || channelId}`,
      status,
      channelId,
      channelName,
      messageTs,
      threadTs,
      requesterSlackUserId,
      sourcePermalink,
    ],
  )
  await query(`SELECT pg_notify('ahmad_sync_activity', $1)`, [String(result.rows[0]?.id || messageTs)]).catch(() => {})
  return true
}
