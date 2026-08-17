import { query } from '@/lib/db'
import { SkillError, type Skill } from '@/lib/ai/types'

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function eventLine(event: Record<string, unknown>): string {
  const when = [event.event_date, event.local_time].filter(Boolean).join(' ')
  return `**${event.summary || 'Untitled event'}**${event.venue_name ? ` at ${event.venue_name}` : ''}${when ? ` - ${when}` : ''}`
}

function candidateReason(row: Record<string, unknown>): string {
  const reasons: string[] = []
  if (row.linked_to_venue) reasons.push('knows venue')
  const conflicts = Number(row.same_day_events || 0)
  if (conflicts > 0) reasons.push(`${conflicts} same-day assignment${conflicts === 1 ? '' : 's'}`)
  const hours = Number(row.week_hours || 0)
  reasons.push(`${hours.toFixed(hours % 1 === 0 ? 0 : 1)}h scheduled this week`)
  return reasons.join(', ')
}

const skill: Skill = {
  name: 'staffing_recommendations',
  description: 'Recommend technicians or managers for unassigned events based on venue familiarity, weekly workload, and same-day conflicts. This does not assign anyone.',
  category: 'Staff',
  icon: 'Users',
  role: 'technician',
  parameters: {
    type: 'object',
    properties: {
      event_id: { type: 'string', description: 'Specific event UUID. Optional; if omitted, returns upcoming unassigned events.' },
      venue_id: { type: 'string', description: 'Optional venue UUID filter.' },
      venue_name: { type: 'string', description: 'Optional venue name or team alias filter.' },
      date_from: { type: 'string', description: 'YYYY-MM-DD lower bound. Defaults to today.' },
      date_to: { type: 'string', description: 'YYYY-MM-DD upper bound. Defaults to 7 days from today.' },
      limit: { type: 'integer', default: 5, maximum: 10 },
    },
  },
  async handler(args) {
    const eventId = asText(args.event_id)
    const venueId = asText(args.venue_id)
    const venueName = asText(args.venue_name)
    const dateFrom = asText(args.date_from)
    const dateTo = asText(args.date_to)
    const limit = Math.max(1, Math.min(Number(args.limit) || 5, 10))

    const conditions: string[] = ["COALESCE(e.approval_status, 'approved') = 'approved'", 'e.event_date >= COALESCE($1::date, CURRENT_DATE)', "e.event_date <= COALESCE($2::date, CURRENT_DATE + INTERVAL '7 days')"]
    const params: unknown[] = [dateFrom || null, dateTo || null]

    if (eventId) {
      params.push(eventId)
      conditions.push(`e.id = $${params.length}`)
    } else {
      conditions.push('NOT EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = e.id)')
    }
    if (venueId) {
      params.push(venueId)
      conditions.push(`e.venue_id = $${params.length}`)
    }
    if (venueName) {
      params.push(`%${venueName}%`)
      conditions.push(`(
        v.name ILIKE $${params.length}
        OR COALESCE(v.address,'') ILIKE $${params.length}
        OR EXISTS (
          SELECT 1 FROM unnest(COALESCE(v.aliases, '{}'::text[])) AS alias
          WHERE alias ILIKE $${params.length}
        )
      )`)
    }

    params.push(limit)
    const events = await query(
      `SELECT e.id, e.venue_id, e.summary, e.status, e.workflow_status,
              TO_CHAR(e.event_date,'YYYY-MM-DD') AS event_date,
              TO_CHAR(e.start_time AT TIME ZONE COALESCE(v.timezone,'America/New_York'),'HH12:MI AM') AS local_time,
              v.name AS venue_name,
              (SELECT COUNT(*) FROM event_assignments ea WHERE ea.event_id = e.id)::int AS assigned_count
       FROM events e
       LEFT JOIN venues v ON v.id = e.venue_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY e.start_time ASC
       LIMIT $${params.length}`,
      params
    )

    if (events.rows.length === 0) {
      throw new SkillError('no_events_found', 'I did not find matching events that need a staffing recommendation.', 'Try a wider date range, a venue name, or a specific event_id.')
    }

    const recommendations = []
    for (const event of events.rows) {
      const candidates = await query(
        `SELECT s.id, s.full_name, s.role, s.title, s.email,
                COALESCE(wk.hours, 0)::float AS week_hours,
                COALESCE(wk.events, 0)::int AS week_events,
                COALESCE(dayload.events, 0)::int AS same_day_events,
                CASE WHEN sv.staff_id IS NOT NULL THEN true ELSE false END AS linked_to_venue
         FROM staff s
         LEFT JOIN (
           SELECT ea.staff_id, SUM(COALESCE(ea.estimated_hours, 0)) AS hours, COUNT(*) AS events
           FROM event_assignments ea
           JOIN events e ON e.id = ea.event_id
           WHERE e.event_date >= ($2::date - INTERVAL '3 days')
             AND e.event_date <= ($2::date + INTERVAL '3 days')
           GROUP BY ea.staff_id
         ) wk ON wk.staff_id = s.id
         LEFT JOIN (
           SELECT ea.staff_id, COUNT(*) AS events
           FROM event_assignments ea
           JOIN events e ON e.id = ea.event_id
           WHERE e.event_date = $2::date
           GROUP BY ea.staff_id
         ) dayload ON dayload.staff_id = s.id
         LEFT JOIN staff_venues sv ON sv.staff_id = s.id AND sv.venue_id = $1
         WHERE COALESCE(s.is_active,true)=true
           AND s.role IN ('technician','manager','admin')
         ORDER BY
           CASE WHEN sv.staff_id IS NOT NULL THEN 0 ELSE 1 END,
           COALESCE(dayload.events, 0) ASC,
           COALESCE(wk.hours, 0) ASC,
           CASE s.role WHEN 'technician' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END,
           s.full_name ASC
         LIMIT 5`,
        [event.venue_id, event.event_date]
      )
      recommendations.push({ event, candidates: candidates.rows })
    }

    const lines = [
      '## Staffing Recommendations',
      'These are suggestions only. No assignments were changed.',
      '',
      ...recommendations.flatMap(({ event, candidates }) => [
        `${eventLine(event)} - [open ->](/events/${event.id})`,
        ...(candidates.length > 0
          ? candidates.slice(0, 3).map((candidate: Record<string, unknown>, index: number) =>
              `${index + 1}. ${candidate.full_name}${candidate.title ? ` (${candidate.title})` : ''} - ${candidateReason(candidate)}`
            )
          : ['No active staff candidates found.']),
        '',
      ]),
      '## Good Next Step',
      '- Ask me to open one event, then confirm who you want assigned.',
      '- Ask for venue health first if you want ticket risk included before staffing.',
    ]

    return {
      recommendations,
      text_summary: lines.join('\n').trim(),
    }
  },
}

export default skill
