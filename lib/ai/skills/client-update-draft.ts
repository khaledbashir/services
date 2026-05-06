import { query } from '@/lib/db'
import { SkillError, type Skill } from '@/lib/ai/types'

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function priorityOrderSql(alias = 't'): string {
  return `CASE LOWER(COALESCE(${alias}.priority,'')) WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`
}

function cleanSnippet(value: unknown, max = 220): string {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max - 3)}...` : text
}

function buildDraft(ticket: Record<string, unknown>, comments: Array<Record<string, unknown>>, tone: string): string {
  const contactName = asText(ticket.contact_name)
  const greeting = contactName ? `Hi ${contactName},` : 'Hi,'
  const title = asText(ticket.title) || 'the service issue'
  const venue = asText(ticket.venue_name)
  const priority = asText(ticket.priority) || 'medium'
  const latestComment = comments[0]?.body ? cleanSnippet(comments[0].body, 260) : ''
  const description = cleanSnippet(ticket.description || ticket.original_message, 260)
  const toneLine = tone === 'executive'
    ? 'We are actively tracking this and will keep the update concise.'
    : tone === 'friendly'
      ? 'We are on it and will keep you posted as we make progress.'
      : 'We are actively tracking this and will keep you updated.'

  const lines = [
    greeting,
    '',
    `Quick update on ${venue ? `${venue} - ` : ''}${title}: ${toneLine}`,
    '',
    `Current status: ${ticket.status || 'open'} (${priority} priority).`,
  ]

  if (latestComment) {
    lines.push(`Latest client-visible note: ${latestComment}`)
  } else if (description) {
    lines.push(`What we have logged: ${description}`)
  }

  lines.push(
    '',
    'Next step: our team will confirm the next action and follow up with timing or resolution details.',
    '',
    'Thank you,',
    'ANC Support'
  )

  return lines.join('\n')
}

const skill: Skill = {
  name: 'client_update_draft',
  description: 'Draft a client-safe update for a service ticket using ticket details and external comments only. Does not send the message and never exposes internal notes.',
  category: 'Support',
  icon: 'Mail',
  role: 'technician',
  parameters: {
    type: 'object',
    properties: {
      ticket_id: { type: 'string', description: 'Ticket UUID. Optional if ticket_number or venue_name is provided.' },
      ticket_number: { type: 'integer', description: 'Ticket number. Optional.' },
      venue_name: { type: 'string', description: 'Optional venue name or team alias. If no ticket is provided, drafts for the highest priority open ticket at this venue.' },
      tone: { type: 'string', enum: ['standard', 'friendly', 'executive'], default: 'standard' },
    },
  },
  async handler(args) {
    const ticketId = asText(args.ticket_id)
    const ticketNumber = Number(args.ticket_number) || null
    const venueName = asText(args.venue_name)
    const tone = ['standard', 'friendly', 'executive'].includes(asText(args.tone)) ? asText(args.tone) : 'standard'

    const conditions: string[] = ["COALESCE(LOWER(t.status), 'open') NOT IN ('closed','resolved','done','cancelled')"]
    const params: unknown[] = []
    if (ticketId) {
      params.push(ticketId)
      conditions.push(`t.id = $${params.length}`)
    }
    if (ticketNumber) {
      params.push(ticketNumber)
      conditions.push(`t.ticket_number = $${params.length}`)
    }
    if (venueName) {
      params.push(`%${venueName}%`)
      conditions.push(`(
        v.name ILIKE $${params.length}
        OR EXISTS (
          SELECT 1 FROM unnest(COALESCE(v.aliases, '{}'::text[])) AS alias
          WHERE alias ILIKE $${params.length}
        )
      )`)
    }

    const ticketResult = await query(
      `SELECT t.id, t.ticket_number, t.title, t.description, t.original_message,
              t.priority, t.status, t.contact_name, t.contact_email,
              TO_CHAR(t.created_at,'YYYY-MM-DD HH12:MI AM') AS created_at_label,
              v.name AS venue_name, v.primary_contact_email,
              assignee.full_name AS assignee_name
       FROM tickets t
       LEFT JOIN venues v ON v.id = t.venue_id
       LEFT JOIN staff assignee ON assignee.id = t.assigned_to
       WHERE ${conditions.join(' AND ')}
       ORDER BY ${priorityOrderSql('t')}, t.created_at ASC
       LIMIT 1`,
      params
    )

    const ticket = ticketResult.rows[0]
    if (!ticket) {
      throw new SkillError('ticket_not_found', 'I could not find an open ticket for that request.', 'Try a ticket number, ticket id, or venue name.')
    }

    const commentsResult = await query(
      `SELECT body, TO_CHAR(created_at,'YYYY-MM-DD HH12:MI AM') AS created_at_label
       FROM ticket_comments
       WHERE ticket_id = $1
         AND is_internal = false
       ORDER BY created_at DESC
       LIMIT 8`,
      [ticket.id]
    )

    const draft = buildDraft(ticket, commentsResult.rows, tone)
    const recipient = ticket.contact_email || ticket.primary_contact_email || 'No client email found on the ticket or venue.'
    const lines = [
      `## Client-Safe Draft`,
      `Ticket **#${ticket.ticket_number}**: ${ticket.title} - [open ->](/tickets/${ticket.id})`,
      `Recipient candidate: ${recipient}`,
      '',
      '```text',
      draft,
      '```',
      '',
      'Source check: used ticket fields and external comments only. Internal comments were not queried.',
    ]

    return {
      ticket,
      comments_used: commentsResult.rows.length,
      recipient_candidate: recipient,
      draft,
      text_summary: lines.join('\n'),
    }
  },
}

export default skill
