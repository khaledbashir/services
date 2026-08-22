import { query } from '@/lib/db'
import { slackApiForm, sendSlackMessage } from '@/lib/slack'

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

/**
 * Slack fires app_mention whenever the bot is NAMED, anywhere in the text. A
 * sentence like "for private ones, invite @ANC and it picks them up" is a
 * passing reference, not an instruction — and it was being filed as a request
 * against its own author. Being addressed means the mention leads the message.
 */
export function addressesTheBot(text: string, botUserId?: string): boolean {
  if (!botUserId) return false
  const leading = new RegExp(`^[\\s>*_~]*<@${botUserId}>`)
  return leading.test(String(text || ''))
}

export function shouldCaptureCodexMention(event: any, botUserId?: string): boolean {
  if (!enabled()) return false
  if (!event || event.subtype === 'bot_message' || event.bot_id) return false
  const text = typeof event.text === 'string' ? event.text : ''
  if (!addressesTheBot(text, botUserId)) return false
  return looksLikeRequest(text)
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
    const res: any = await slackApiForm('users.info', { user: userId })
    if (res?.ok && res.user) {
      return res.user.profile?.display_name || res.user.real_name || res.user.name || userId
    }
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

async function getPermalink(channelId: string, ts: string): Promise<string | null> {
  try {
    const res: any = await slackApiForm('chat.getPermalink', { channel: channelId, message_ts: ts })
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

  // Keyed on the message itself, not on its permalink. Slack delivers one
  // mention as TWO events (app_mention and message), and the permalink was
  // arriving null — and in Postgres a null never conflicts, so the old
  // ON CONFLICT (source_url) silently deduped nothing and posted twice.
  const inserted = await query(
    `INSERT INTO codex_request_inbox (
       requester_slack_user_id, requester_name, channel_id, channel_name,
       thread_ts, message_ts, source_url, raw_text, cleaned_text, title,
       suggested_skill
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (channel_id, message_ts) DO UPDATE
       SET updated_at = NOW(),
           raw_text = EXCLUDED.raw_text,
           cleaned_text = EXCLUDED.cleaned_text,
           title = EXCLUDED.title,
           source_url = COALESCE(EXCLUDED.source_url, codex_request_inbox.source_url),
           suggested_skill = EXCLUDED.suggested_skill
     RETURNING id, status, (xmax = 0) AS is_new`,
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
  // The second event for the same message updates the row; it must not post a
  // second card.
  if (!row?.is_new) return { captured: true, suppressAssistant: true }
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
