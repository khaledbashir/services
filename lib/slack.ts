const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || ''

// Global kill switch. Set SLACK_NOTIFICATIONS_ENABLED=false on EasyPanel to
// mute every outbound Slack message during setup / staging. Also supports
// SLACK_VENUE_NOTIFICATIONS_ENABLED=false to mute only per-venue channels
// while keeping the default-channel digests flowing.
function globalMuted(): boolean {
  const v = (process.env.SLACK_NOTIFICATIONS_ENABLED || '').trim().toLowerCase()
  return v === 'false' || v === '0' || v === 'off' || v === 'no'
}
function venueMuted(): boolean {
  const v = (process.env.SLACK_VENUE_NOTIFICATIONS_ENABLED || '').trim().toLowerCase()
  return v === 'false' || v === '0' || v === 'off' || v === 'no'
}

interface SlackMessage {
  channel: string
  text: string
  blocks?: any[]
  thread_ts?: string
}

export async function slackApi(method: string, body: any) {
  if (!SLACK_BOT_TOKEN) throw new Error('SLACK_BOT_TOKEN not set')
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function sendSlackMessage(msg: SlackMessage): Promise<boolean> {
  const res = await sendSlackMessageDetailed(msg)
  return res.ok
}

export async function sendSlackMessageDetailed(msg: SlackMessage & { thread_ts?: string }): Promise<{ ok: boolean; ts?: string; channel?: string }> {
  if (!SLACK_BOT_TOKEN) {
    console.warn('SLACK_BOT_TOKEN not set, skipping Slack notification')
    return { ok: false }
  }
  if (globalMuted()) {
    console.log('[slack-muted]', msg.channel, msg.text.slice(0, 80))
    return { ok: false }
  }

  try {
    const data = await slackApi('chat.postMessage', msg)
    if (!data.ok) {
      console.error('Slack API error:', data.error)
      return { ok: false }
    }
    return { ok: true, ts: data.ts, channel: data.channel }
  } catch (err) {
    console.error('Failed to send Slack message:', err)
    return { ok: false }
  }
}

const DASHBOARD_URL_BASE = 'https://abc-anc-services.izcgmb.easypanel.host'
const DEFAULT_CHANNEL = process.env.SLACK_DEFAULT_CHANNEL || ''

/** Operational notification for any dashboard action. Safe to await or fire-and-forget. */
export async function notifyOps(emoji: string, text: string, link?: { label: string; url: string }, channel?: string): Promise<boolean> {
  const isVenueChannel = !!channel && channel !== DEFAULT_CHANNEL
  if (globalMuted()) {
    console.log('[slack-muted]', channel || DEFAULT_CHANNEL, text.slice(0, 80))
    return false
  }
  if (isVenueChannel && venueMuted()) {
    console.log('[slack-venue-muted]', channel, text.slice(0, 80))
    return false
  }
  const targetChannel = channel || DEFAULT_CHANNEL
  if (!targetChannel) {
    console.warn('[slack-missing-channel]', text.slice(0, 120))
    return false
  }
  const blocks: any[] = [
    { type: 'section', text: { type: 'mrkdwn', text: `${emoji} ${text}` } },
  ]
  if (link) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `<${link.url}|:link: ${link.label}>` } })
  }
  return sendSlackMessage({ channel: targetChannel, text: `${emoji} ${text}`, blocks })
}

export async function createSlackCanvas(params: {
  title: string
  content?: string
  channelId?: string
}) {
  const title = params.title.trim()
  if (!title) throw new Error('Canvas title is required')
  const markdown = params.content || ''

  if (params.channelId) {
    const res = await slackApi('conversations.canvases.create', {
      channel_id: params.channelId,
      title,
      document_content: {
        type: 'markdown',
        markdown,
      },
    })
    if (!res.ok) throw new Error(`Slack canvas create failed: ${res.error || 'unknown_error'}`)
    return {
      ok: true,
      canvas_id: res.canvas_id as string | undefined,
      channel_id: params.channelId,
      title,
    }
  }

  const res = await slackApi('canvases.create', {
    title,
    document_content: {
      type: 'markdown',
      markdown,
    },
  })
  if (!res.ok) throw new Error(`Slack canvas create failed: ${res.error || 'unknown_error'}`)
  return {
    ok: true,
    canvas_id: res.canvas_id as string | undefined,
    title,
  }
}

const statusLabels: Record<string, string> = {
  new: 'New', on_hold: 'On Hold', in_progress: 'In Progress',
  escalated: 'Escalated', closed: 'Closed',
}

const DASHBOARD_URL = DASHBOARD_URL_BASE

// Joe 2026-05-04 9:00 PM: keep tickets scannable in-channel; full body in thread.
const TICKET_TEASER_CHAR_CAP = 400
const SLACK_SECTION_CHAR_CAP = 2900 // headroom under Slack's 3000-char block limit

function quoteEachLine(s: string): string {
  return s.replace(/\r\n/g, '\n').split('\n').map(l => `> ${l}`).join('\n')
}

export function buildTicketDescriptionTeaser(description: string): { text: string; hasMore: boolean } {
  const desc = description.trim()
  if (!desc) return { text: '', hasMore: false }
  const firstPara = desc.split(/\n\s*\n/)[0] || desc
  const fits = firstPara.length <= TICKET_TEASER_CHAR_CAP && firstPara.length === desc.length
  if (fits) return { text: quoteEachLine(firstPara), hasMore: false }
  if (firstPara.length <= TICKET_TEASER_CHAR_CAP) {
    return { text: quoteEachLine(firstPara), hasMore: true }
  }
  return { text: quoteEachLine(firstPara.slice(0, TICKET_TEASER_CHAR_CAP).trimEnd() + '…'), hasMore: true }
}

export function buildTicketDescriptionThreadBlocks(description: string): any[] {
  const quoted = quoteEachLine(description)
  if (quoted.length <= SLACK_SECTION_CHAR_CAP) {
    return [{ type: 'section', text: { type: 'mrkdwn', text: quoted } }]
  }
  const chunks: string[] = []
  let buf = ''
  for (const para of quoted.split('\n\n')) {
    const next = buf ? `${buf}\n\n${para}` : para
    if (next.length > SLACK_SECTION_CHAR_CAP) {
      if (buf) chunks.push(buf)
      if (para.length > SLACK_SECTION_CHAR_CAP) {
        for (let i = 0; i < para.length; i += SLACK_SECTION_CHAR_CAP) chunks.push(para.slice(i, i + SLACK_SECTION_CHAR_CAP))
        buf = ''
      } else {
        buf = para
      }
    } else {
      buf = next
    }
  }
  if (buf) chunks.push(buf)
  const capped = chunks.slice(0, 8)
  const blocks: any[] = capped.map(c => ({ type: 'section', text: { type: 'mrkdwn', text: c } }))
  if (chunks.length > capped.length) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: '_…note continues — open the ticket to see the rest._' }] })
  }
  return blocks
}

export function formatTicketNotification(ticket: {
  id?: string
  ticket_number: number
  title: string
  category: string
  priority: string
  venue_name: string
  description?: string
  status?: string
  image_url?: string
}, action: 'created' | 'updated' | 'resolved'): SlackMessage & { text: string; blocks: any[] } {
  const emoji = {
    created: ':ticket:',
    updated: ':pencil2:',
    resolved: ':white_check_mark:',
  }[action]

  const priorityEmoji = {
    low: ':white_circle:',
    medium: ':large_yellow_circle:',
    high: ':large_orange_circle:',
    critical: ':red_circle:',
  }[ticket.priority] || ':white_circle:'

  const caseNum = String(ticket.ticket_number).padStart(8, '0')
  const displayStatus = statusLabels[ticket.status || 'new'] || ticket.status || 'New'

  const text = `${emoji} Case #${caseNum} ${action}: ${ticket.title}`

  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *Case #${caseNum} ${action}*\n*${ticket.title}*`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Venue:*\n${ticket.venue_name}` },
        { type: 'mrkdwn', text: `*Category:*\n${ticket.category}` },
        { type: 'mrkdwn', text: `*Priority:*\n${priorityEmoji} ${ticket.priority}` },
        { type: 'mrkdwn', text: `*Status:*\n${displayStatus}` },
      ],
    },
  ]

  if (ticket.description) {
    // Joe 2026-05-04 9:00 PM follow-up: keep the channel post scannable —
    // show only the first paragraph (or first ~400 chars) inline, and post
    // the full body as a thread reply (handled by sendTicketNotification).
    // The teaser keeps the same `> `-per-line quote so styling matches.
    const teaser = buildTicketDescriptionTeaser(ticket.description)
    if (teaser.text) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: teaser.text } })
      if (teaser.hasMore) {
        blocks.push({
          type: 'context',
          elements: [{ type: 'mrkdwn', text: ':thread: _Full note posted in thread below._' }],
        })
      }
    }
  }

  if (ticket.image_url) {
    if (ticket.image_url.startsWith('http')) {
      blocks.push({
        type: 'image',
        image_url: ticket.image_url,
        alt_text: ticket.title,
      })
    } else {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: ':camera: _Photo attached — view on dashboard_' },
      })
    }
  }

  if (ticket.id) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `<${DASHBOARD_URL}/tickets/${ticket.id}|:link: View Ticket>` },
    })
  }

  return { text, blocks, channel: '' }
}

/**
 * Joe 2026-05-04 9:00 PM: post a ticket notification as a scannable card,
 * then drop the full body as a thread reply on the same message. Slack
 * doesn't auto-collapse Block Kit messages, so this is the manual collapse:
 * channel stays clean, full note is one click away in-thread.
 */
export async function sendTicketNotification(ticket: {
  id?: string
  ticket_number: number
  title: string
  category: string
  priority: string
  venue_name: string
  description?: string
  status?: string
  image_url?: string
}, action: 'created' | 'updated' | 'resolved', channel: string): Promise<boolean> {
  const main = formatTicketNotification(ticket, action)
  main.channel = channel
  const res = await sendSlackMessageDetailed(main)
  if (!res.ok) return false
  // Did the teaser truncate? If so, post the full body in-thread.
  const desc = (ticket.description || '').trim()
  if (desc) {
    const teaser = buildTicketDescriptionTeaser(desc)
    if (teaser.hasMore && res.ts) {
      const threadBlocks = buildTicketDescriptionThreadBlocks(desc)
      const caseNum = String(ticket.ticket_number).padStart(8, '0')
      await sendSlackMessageDetailed({
        channel,
        thread_ts: res.ts,
        text: `Full note for Case #${caseNum}`,
        blocks: [
          { type: 'context', elements: [{ type: 'mrkdwn', text: `:memo: *Full note — Case #${caseNum}*` }] },
          ...threadBlocks,
        ],
      })
    }
  }
  return true
}
