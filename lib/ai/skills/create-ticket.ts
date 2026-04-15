import { query } from '@/lib/db'
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
    const r = await query(
      `INSERT INTO tickets (venue_id, title, description, priority, status, created_by)
       VALUES ($1, $2, $3, COALESCE($4,'medium'), 'open', $5)
       RETURNING id, ticket_number, title, status`,
      [args.venue_id, args.title, args.description || null, args.priority || null, ctx.userId]
    )
    return { ticket: r.rows[0] }
  },
}
export default skill
