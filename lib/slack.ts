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
  if (!SLACK_BOT_TOKEN) {
    console.warn('SLACK_BOT_TOKEN not set, skipping Slack notification')
    return false
  }
  if (globalMuted()) {
    console.log('[slack-muted]', msg.channel, msg.text.slice(0, 80))
    return false
  }

  try {
    const data = await slackApi('chat.postMessage', msg)
    if (!data.ok) {
      console.error('Slack API error:', data.error)
      return false
    }
    return true
  } catch (err) {
    console.error('Failed to send Slack message:', err)
    return false
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
    // Stevie 2026-05-04 ask: full ticket body in the Slack preview, not a
    // 200-char teaser. Slack section blocks cap at 3000 chars; chunk on
    // paragraph boundaries when needed and prefix every line with `> ` so
    // the whole body renders as a multi-line quote (Slack only quotes the
    // first line of mrkdwn otherwise).
    const quoted = ticket.description
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map(line => `> ${line}`)
      .join('\n')

    const SECTION_LIMIT = 2900 // headroom under Slack's 3000-char cap
    if (quoted.length <= SECTION_LIMIT) {
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: quoted } })
    } else {
      const chunks: string[] = []
      let buf = ''
      for (const para of quoted.split('\n\n')) {
        const next = buf ? `${buf}\n\n${para}` : para
        if (next.length > SECTION_LIMIT) {
          if (buf) chunks.push(buf)
          if (para.length > SECTION_LIMIT) {
            for (let i = 0; i < para.length; i += SECTION_LIMIT) chunks.push(para.slice(i, i + SECTION_LIMIT))
            buf = ''
          } else {
            buf = para
          }
        } else {
          buf = next
        }
      }
      if (buf) chunks.push(buf)
      // Cap to 8 description blocks to keep within Slack's 50-block ceiling.
      const capped = chunks.slice(0, 8)
      for (const c of capped) blocks.push({ type: 'section', text: { type: 'mrkdwn', text: c } })
      if (chunks.length > capped.length) {
        blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `_…note continues — open the ticket to see the rest._` }] })
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
