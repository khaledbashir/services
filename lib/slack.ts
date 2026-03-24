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

const statusLabels: Record<string, string> = {
  new: 'New', on_hold: 'On Hold', in_progress: 'In Progress',
  escalated: 'Escalated', closed: 'Closed',
}

export function formatTicketNotification(ticket: {
  ticket_number: number
  title: string
  category: string
  priority: string
  venue_name: string
  description?: string
  status?: string
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

  return { text, blocks, channel: '' }
}
