import { query } from '@/lib/db'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'log_maintenance',
  description: 'Log a maintenance issue or completed work at a venue.',
  category: 'Service Ops',
  icon: '🔧',
  role: 'technician',
  parameters: {
    type: 'object',
    properties: {
      venue_id: { type: 'string' },
      maintenance_type: { type: 'string', enum: ['reactive', 'scheduled', 'preventive'], default: 'reactive' },
      issue: { type: 'string' },
      issue_summary: { type: 'string' },
      location_reported: { type: 'string' },
      status: { type: 'string', enum: ['open', 'in_progress', 'completed'], default: 'open' },
    },
    required: ['venue_id', 'issue'],
  },
  async handler(args, ctx) {
    const r = await query(
      `INSERT INTO maintenance_logs (
         venue_id, technician_id, maintenance_type, issue, issue_summary,
         location_reported, status, reported_date
       ) VALUES ($1,$2,COALESCE($3,'reactive'),$4,$5,$6,COALESCE($7,'open'),CURRENT_DATE)
       RETURNING id, issue, status`,
      [args.venue_id, ctx.userId, args.maintenance_type || null, args.issue,
       args.issue_summary || null, args.location_reported || null, args.status || null]
    )
    return { maintenance_log: r.rows[0], _ui_action: { type: 'refresh' } }
  },
}
export default skill
