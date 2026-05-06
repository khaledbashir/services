import { query } from '@/lib/db'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'search_venues',
  description: 'Find venues by name, address, or market. Returns venue ID, name, address, timezone, and Slack channel.',
  category: 'Venues',
  icon: '📍',
  parameters: {
    type: 'object',
    properties: {
      q: { type: 'string', description: 'Search term' },
      limit: { type: 'integer', default: 10, maximum: 30 },
    },
    required: ['q'],
  },
  async handler(args) {
    const r = await query(
      `SELECT v.id, v.name, v.address, v.timezone, v.slack_channel_id, v.venue_type, v.feed_url, v.feed_type, v.aliases
       FROM venues v
       WHERE v.name ILIKE $1
          OR COALESCE(v.address,'') ILIKE $1
          OR EXISTS (
            SELECT 1 FROM unnest(COALESCE(v.aliases, '{}'::text[])) AS alias
            WHERE alias ILIKE $1
          )
       ORDER BY v.name LIMIT $2`,
      [`%${args.q}%`, Math.min(Number(args.limit) || 10, 30)]
    )
    return { venues: r.rows }
  },
}
export default skill
