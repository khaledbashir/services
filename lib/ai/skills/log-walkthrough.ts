import { query } from '@/lib/db'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'log_walkthrough',
  description: 'Record a walkthrough at a venue. Use when a tech finishes checking a site.',
  category: 'Service Ops',
  icon: '🚶',
  role: 'technician',
  parameters: {
    type: 'object',
    properties: {
      venue_id: { type: 'string' },
      result: { type: 'string', enum: ['good', 'problem_detected', 'partial'] },
      locations_visited: { type: 'string' },
      issues_found: { type: 'string' },
      notes: { type: 'string' },
    },
    required: ['venue_id', 'result'],
  },
  async handler(args, ctx) {
    const r = await query(
      `INSERT INTO walkthrough_logs (
         venue_id, technician_id, log_date, result, locations_visited, issues_found, notes
       ) VALUES ($1,$2,CURRENT_DATE,$3,$4,$5,$6)
       RETURNING id, result, log_date`,
      [args.venue_id, ctx.userId, args.result, args.locations_visited || null, args.issues_found || null, args.notes || null]
    )
    return { walkthrough: r.rows[0] }
  },
}
export default skill
