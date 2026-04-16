import { query } from '@/lib/db'
import { sendSlackMessage, formatTicketNotification } from '@/lib/slack'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'create_ticket',
  description: 'Open a new service ticket at a venue. Use search_venues first to get a venue_id.',
  category: 'Support',
  icon: '🎫',
  role: 'technician',
  parameters: {
    type: 'object',
    properties: {
      venue_id: { type: 'string', description: 'UUID of the venue' },
      title: { type: 'string' },
      description: { type: 'string' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
    },
    required: ['venue_id', 'title'],
  },
  async handler(args, ctx) {
    const venueId = String(args.venue_id)
    const title = String(args.title)
    const description = typeof args.description === 'string' ? args.description : null
    const priority = typeof args.priority === 'string' ? args.priority : null

    const r = await query(
      `INSERT INTO tickets (venue_id, title, description, priority, status, created_by)
       VALUES ($1, $2, $3, COALESCE($4,'medium'), 'new', $5)
       RETURNING id, ticket_number, title, status, priority, category`,
      [venueId, title, description, priority, ctx.userId]
    )

    const ticket = r.rows[0]
    const venueRow = await query(
      `SELECT name, slack_channel_id FROM venues WHERE id = $1`,
      [venueId]
    )
    const venue = venueRow.rows[0]
    const channel = venue?.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
    if (venue && channel) {
      const msg = formatTicketNotification({
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        title: ticket.title,
        category: ticket.category || 'general',
        priority: ticket.priority,
        venue_name: venue.name,
        description: description || undefined,
      }, 'created')
      msg.channel = channel
      sendSlackMessage(msg)
    }

    return { ticket, _ui_action: { type: 'refresh' } }
  },
}
export default skill
