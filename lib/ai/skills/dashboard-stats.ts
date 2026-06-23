import { query } from '@/lib/db'
import type { Skill } from '@/lib/ai/types'
import { SPEC_SHEET_PRINT_SQL } from '@/lib/spec-sheet-work'

const skill: Skill = {
  name: 'dashboard_stats',
  description: 'Overall live dashboard snapshot: totals for venues, staff, clients, events, assignments, tickets, design work, maintenance, and other operational counts.',
  category: 'System',
  icon: '📊',
  parameters: { type: 'object', properties: {} },
  async handler() {
    const r = await query(
      `SELECT
        (SELECT COUNT(*) FROM venues) AS total_venues,
        (SELECT COUNT(*) FROM venues WHERE COALESCE(is_active,true)=true) AS active_venues,
        (SELECT COUNT(*) FROM venues WHERE COALESCE(is_active,true)=false) AS inactive_venues,
        (SELECT COUNT(*) FROM clients WHERE COALESCE(is_active,true)=true) AS active_clients,
        (SELECT COUNT(*) FROM staff WHERE COALESCE(is_active,true)=true) AS active_staff,
        (SELECT COUNT(*) FROM staff WHERE COALESCE(is_active,true)=true AND role='technician') AS active_technicians,
        (SELECT COUNT(*) FROM events WHERE event_date = CURRENT_DATE) AS events_today,
        (SELECT COUNT(*) FROM events WHERE event_date >= CURRENT_DATE AND event_date < CURRENT_DATE + 7) AS events_this_week,
        (SELECT COUNT(*) FROM events WHERE event_date >= DATE_TRUNC('month', CURRENT_DATE) AND event_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month') AS events_this_month,
        (SELECT COUNT(*) FROM events WHERE event_date >= CURRENT_DATE AND event_date < CURRENT_DATE + 7
            AND NOT EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id=events.id)) AS unassigned_events_this_week,
        (SELECT COUNT(*) FROM event_assignments) AS total_event_assignments,
        (SELECT COUNT(*) FROM tickets WHERE status NOT IN ('closed','resolved')) AS open_tickets,
        (SELECT COUNT(*) FROM tickets WHERE priority IN ('high','critical') AND status NOT IN ('closed','resolved')) AS urgent_open_tickets,
        (SELECT COUNT(*) FROM design_requests WHERE status NOT IN ('approved','done')) AS open_design_requests,
        (SELECT COUNT(*) FROM cg_design_requests WHERE status NOT IN ('approved','done')) AS open_cg_design_requests,
        (SELECT COUNT(*) FROM print_requests WHERE status NOT IN ('approved','done','delivered') AND NOT ${SPEC_SHEET_PRINT_SQL}) AS open_print_requests,
        (SELECT COUNT(*) FROM content_schedules WHERE status NOT IN ('done','completed','cancelled')) AS open_content_schedules,
        (SELECT COUNT(*) FROM maintenance_logs WHERE status NOT IN ('completed','cancelled')) AS open_maintenance,
        (SELECT COUNT(*) FROM walkthrough_logs WHERE log_date >= CURRENT_DATE - INTERVAL '7 days') AS walkthroughs_last_7_days,
        (SELECT COUNT(*) FROM inventory WHERE COALESCE(quantity,0) <= COALESCE(threshold_low,0)) AS low_stock_items`
    )
    return r.rows[0]
  },
}
export default skill
