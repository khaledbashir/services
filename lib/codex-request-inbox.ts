import { query } from '@/lib/db'
import { slackApi, sendSlackMessage } from '@/lib/slack'

const REQUEST_HINTS = [
  'can you',
  'could you',
  'please',
  'need',
  'needs',
  'not working',
  'broken',
  'fix',
  'clean',
  'cleanup',
  'export',
  'faster',
  'slow',
  'save',
  'untitled',
  'add',
  'make',
  'update',
  'request',
  'track',
  'todo',
]

function enabled(): boolean {
  const v = (process.env.CODEX_SLACK_INBOX_ENABLED || 'true').trim().toLowerCase()
  return !['false', '0', 'off', 'no'].includes(v)
}

function stripMentions(text: string): string {
  return text
    .replace(/<@[A-Z0-9]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeRequest(text: string): boolean {
  const cleaned = stripMentions(text).toLowerCase()
  if (!cleaned) return false
  if (cleaned.startsWith('status') || cleaned === 'help' || cleaned.includes('what did i miss')) return false
  return REQUEST_HINTS.some((hint) => cleaned.includes(hint))
}

export function shouldCaptureCodexMention(event: any, botUserId?: string): boolean {
  if (!enabled()) return false
  if (!event || event.subtype === 'bot_message' || event.bot_id) return false
  if (event.type !== 'app_mention' && !(botUserId && typeof event.text === 'string' && event.text.includes(`<@${botUserId}>`))) return false
  return looksLikeRequest(typeof event.text === 'string' ? event.text : '')
}

function titleFrom(text: string): string {
  const cleaned = stripMentions(text)
    .replace(/^ahmad[,:\s-]*/i, '')
    .replace(/^codex[,:\s-]*/i, '')
    .trim()
  const sentence = cleaned.split(/[.!?\n]/).find(Boolean)?.trim() || cleaned
  return sentence.length > 90 ? `${sentence.slice(0, 87).trim()}...` : sentence || 'Slack request'
}

function suggestedSkillFor(text: string): string {
  const t = text.toLowerCase()
  if (t.includes('export') || t.includes('csv') || t.includes('forecast')) return 'anc-export-cleanup'
  if (t.includes('save') || t.includes('untitled') || t.includes('not working') || t.includes('broken')) return 'anc-production-smoke-verifier'
  if (t.includes('marketing') || t.includes('newsletter') || t.includes('social') || t.includes('alison')) return 'anc-marketing-control-room'
  if (t.includes('slack') || t.includes('track') || t.includes('todo') || t.includes('request')) return 'anc-slack-request-queue'
  if (t.includes('message') || t.includes('reply')) return 'anc-stakeholder-reply-builder'
  return 'anc-next-build-radar'
}

async function lookupUserLabel(userId?: string): Promise<string | null> {
  if (!userId) return null
  try {
    const res: any = await slackApi('users.info', { user: userId })
    if (res?.ok && res.user) {
      return res.user.profile?.display_name || res.user.real_name || res.user.name || userId
    }
  } catch {}
  return userId
}

async function lookupChannelLabel(channelId?: string): Promise<string | null> {
  if (!channelId) return null
  try {
    const res: any = await slackApi('conversations.info', { channel: channelId })
    if (res?.ok && res.channel) return res.channel.name || channelId
  } catch {}
  return channelId
}

async function getPermalink(channelId: string, ts: string): Promise<string | null> {
  try {
    const res: any = await slackApi('chat.getPermalink', { channel: channelId, message_ts: ts })
    if (res?.ok && typeof res.permalink === 'string') return res.permalink
  } catch {}
  return null
}

export async function captureCodexMention(event: any, botUserId?: string): Promise<{ captured: boolean; suppressAssistant: boolean }> {
  const rawText = typeof event.text === 'string' ? event.text : ''
  if (!shouldCaptureCodexMention(event, botUserId)) return { captured: false, suppressAssistant: false }

  const channelId = typeof event.channel === 'string' ? event.channel : ''
  const messageTs = typeof event.ts === 'string' ? event.ts : ''
  const threadTs = typeof event.thread_ts === 'string' ? event.thread_ts : messageTs
  if (!channelId || !messageTs) return { captured: false, suppressAssistant: false }

  const cleanedText = stripMentions(rawText)
  const sourceUrl = await getPermalink(channelId, messageTs)
  const requesterSlackUserId = typeof event.user === 'string' ? event.user : null
  const requesterName = await lookupUserLabel(requesterSlackUserId || undefined)
  const channelName = await lookupChannelLabel(channelId)
  const title = titleFrom(rawText)
  const suggestedSkill = suggestedSkillFor(rawText)

  const inserted = await query(
    `INSERT INTO codex_request_inbox (
       requester_slack_user_id, requester_name, channel_id, channel_name,
       thread_ts, message_ts, source_url, raw_text, cleaned_text, title,
       suggested_skill
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (source_url) DO UPDATE
       SET updated_at = NOW(),
           raw_text = EXCLUDED.raw_text,
           cleaned_text = EXCLUDED.cleaned_text,
           title = EXCLUDED.title,
           suggested_skill = EXCLUDED.suggested_skill
     RETURNING id, status`,
    [
      requesterSlackUserId,
      requesterName,
      channelId,
      channelName,
      threadTs,
      messageTs,
      sourceUrl,
      rawText,
      cleanedText,
      title,
      suggestedSkill,
    ],
  )

  const row = inserted.rows[0]
  const label = requesterName || 'Slack'
  const reply = [
    `Tracked for Ahmad/Codex: *${title}*`,
    `Status: *${row.status || 'new'}*`,
    `Suggested lane: \`${suggestedSkill}\``,
  ].join('\n')

  await sendSlackMessage({
    channel: channelId,
    thread_ts: threadTs,
    text: `${label}, I tracked this for Ahmad/Codex.`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: reply } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: 'Codex will not mark this done until verification is attached.' }] },
    ],
  }).catch(() => {})

  return { captured: true, suppressAssistant: true }
}

export async function listCodexInbox(status = 'new', limit = 25) {
  const params: any[] = []
  const where: string[] = []
  if (status && status !== 'any') {
    params.push(status)
    where.push(`status = $${params.length}`)
  }
  const safeLimit = Math.min(100, Math.max(1, limit))
  const r = await query(
    `SELECT id::text, created_at, updated_at, status, requester_name,
            channel_id, channel_name, thread_ts, message_ts, source_url,
            cleaned_text, title, suggested_skill, priority, owner,
            verification_required, codex_notes, processed_at
       FROM codex_request_inbox
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY created_at DESC
      LIMIT ${safeLimit}`,
    params,
  )
  return r.rows
}
