import { query } from '@/lib/db'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'dashboard_stats',
  description: 'Overall dashboard snapshot: counts of venues, events this week, open tickets, pending design requests.',
  category: 'System',
  icon: '📊',
  parameters: { type: 'object', properties: {} },
  async handler() {
    const r = await query(
      `SELECT
        (SELECT COUNT(*) FROM venues WHERE COALESCE(is_active,true)=true) AS active_venues,
        (SELECT COUNT(*) FROM events WHERE event_date >= CURRENT_DATE AND event_date < CURRENT_DATE + 7) AS events_this_week,
        (SELECT COUNT(*) FROM events WHERE event_date >= CURRENT_DATE AND event_date < CURRENT_DATE + 7
            AND NOT EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id=events.id)) AS unassigned_events_this_week,
        (SELECT COUNT(*) FROM tickets WHERE status NOT IN ('closed','resolved')) AS open_tickets,
        (SELECT COUNT(*) FROM design_requests WHERE status NOT IN ('approved','done')) AS open_design_requests,
        (SELECT COUNT(*) FROM maintenance_logs WHERE status NOT IN ('completed','cancelled')) AS open_maintenance,
        (SELECT COUNT(*) FROM staff) AS active_staff`
    )
    return r.rows[0]
  },
}
export default skill
