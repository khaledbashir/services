import { query } from '@/lib/db'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'search_events',
  description: 'Search upcoming events at any venue. Returns matching events with venue, league, date, time, assigned staff.',
  category: 'Events',
  icon: '📅',
  parameters: {
    type: 'object',
    properties: {
      venue_name: { type: 'string', description: 'Fuzzy venue name match (optional)' },
      league: { type: 'string', description: 'League filter (NBA, MLB, NHL, etc.)' },
      date_from: { type: 'string', description: 'YYYY-MM-DD lower bound' },
      date_to: { type: 'string', description: 'YYYY-MM-DD upper bound' },
      limit: { type: 'integer', default: 10, maximum: 30 },
    },
  },
  async handler(args) {
    // Suggestions are not on the schedule, so the assistant must not report them.
    const conditions: string[] = ["COALESCE(e.approval_status, 'approved') = 'approved'"]
    const params: unknown[] = []
    if (args.venue_name) {
      params.push(`%${args.venue_name}%`)
      conditions.push(`(
        v.name ILIKE $${params.length}
        OR EXISTS (
          SELECT 1 FROM unnest(COALESCE(v.aliases, '{}'::text[])) AS alias
          WHERE alias ILIKE $${params.length}
        )
      )`)
    }
    if (args.league) { params.push(args.league); conditions.push(`e.league = $${params.length}`) }
    if (args.date_from) { params.push(args.date_from); conditions.push(`e.event_date >= $${params.length}`) }
    if (args.date_to) { params.push(args.date_to); conditions.push(`e.event_date <= $${params.length}`) }
    params.push(Math.min(Number(args.limit) || 10, 30))
    const r = await query(
      `SELECT e.id, e.summary, e.league, v.name AS venue,
              TO_CHAR(e.event_date,'YYYY-MM-DD') AS date,
              TO_CHAR(e.start_time AT TIME ZONE COALESCE(v.timezone,'America/New_York'),'HH12:MI AM') AS local_time,
              e.workflow_status,
              (SELECT COUNT(*) FROM event_assignments ea WHERE ea.event_id = e.id)::int AS assigned_count
       FROM events e LEFT JOIN venues v ON v.id = e.venue_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.start_time ASC LIMIT $${params.length}`,
      params
    )
    return { events: r.rows, count: r.rows.length }
  },
}
export default skill
