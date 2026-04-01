const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || ''

interface SlackMessage {
  channel: string
  text: string
  blocks?: any[]
}

export async function sendSlackMessage(msg: SlackMessage): Promise<boolean> {
  if (!SLACK_BOT_TOKEN) {
    console.warn('SLACK_BOT_TOKEN not set, skipping Slack notification')
    return false
  }

  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      },
      body: JSON.stringify(msg),
    })

    const data = await res.json()
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

/** Fire-and-forget operational notification for any dashboard action */
export function notifyOps(emoji: string, text: string, link?: { label: string; url: string }, channel?: string) {
  const blocks: any[] = [
    { type: 'section', text: { type: 'mrkdwn', text: `${emoji} ${text}` } },
  ]
  if (link) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `<${link.url}|:link: ${link.label}>` } })
  }
  sendSlackMessage({ channel: channel || DEFAULT_CHANNEL, text: `${emoji} ${text}`, blocks })
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
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `> ${ticket.description.substring(0, 200)}${ticket.description.length > 200 ? '...' : ''}` },
    })
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
