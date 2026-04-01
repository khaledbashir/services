import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const venueId = params.id
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    const [venueRes, eventsRes, ticketsRes, workflowRes, resolvedRes] = await Promise.all([
      query(
        `SELECT v.name, v.venue_manager_id, v.lead_field_rep_id, v.requires_assignment,
                sm.full_name as manager_name, sl.full_name as lead_rep_name
         FROM venues v
         LEFT JOIN staff sm ON v.venue_manager_id = sm.id
         LEFT JOIN staff sl ON v.lead_field_rep_id = sl.id
         WHERE v.id = $1`,
        [venueId]
      ),
      query(
        `SELECT e.id, e.summary, TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date,
                e.workflow_status, COUNT(ea.id) as assigned_count
         FROM events e
         LEFT JOIN event_assignments ea ON e.id = ea.event_id
         WHERE e.venue_id = $1 AND e.event_date >= $2 AND e.event_date <= ($2::date + 14)
         GROUP BY e.id, e.summary, e.event_date, e.workflow_status
         ORDER BY e.start_time`,
        [venueId, today]
      ),
      query(
        `SELECT id, title, priority, created_at FROM tickets
         WHERE venue_id = $1 AND status IN ('new', 'on_hold', 'in_progress', 'escalated')
         ORDER BY created_at`,
        [venueId]
      ),
      query(
        `SELECT COUNT(*) as total,
                COUNT(CASE WHEN workflow_status = 'post_game_submitted' THEN 1 END) as completed
         FROM events WHERE venue_id = $1 AND event_date >= ($2::date - 30) AND event_date < $2`,
        [venueId, today]
      ),
      query(
        `SELECT COUNT(*) as count FROM tickets
         WHERE venue_id = $1 AND status = 'closed' AND resolved_at >= ($2::date - 7)`,
        [venueId, today]
      ),
    ])

    const venue = venueRes.rows[0]
    if (!venue) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })

    const events = eventsRes.rows
    const openTickets = ticketsRes.rows
    const wf = workflowRes.rows[0] || { total: 0, completed: 0 }
    const resolvedThisWeek = parseInt(resolvedRes.rows[0]?.count || '0')

    const totalEvents = events.length
    const unassigned = events.filter((e: any) => parseInt(e.assigned_count) === 0)
    const assigned = totalEvents - unassigned.length
    const coverageRate = totalEvents > 0 ? Math.round((assigned / totalEvents) * 100) : null
    const wfTotal = parseInt(wf.total) || 0
    const wfDone = parseInt(wf.completed) || 0
    const workflowRate = wfTotal > 0 ? Math.round((wfDone / wfTotal) * 100) : null

    const alerts: Array<{ level: string; icon: string; message: string }> = []

    // Staffing
    if (unassigned.length > 0 && venue.requires_assignment) {
      const next = unassigned[0]
      const days = Math.ceil((new Date(next.event_date).getTime() - now.getTime()) / 86400000)
      if (days <= 2) {
        alerts.push({ level: 'urgent', icon: '🔴', message: `${unassigned.length} event${unassigned.length > 1 ? 's' : ''} unassigned. Next: ${days === 0 ? 'TODAY' : days === 1 ? 'tomorrow' : days + ' days'} (${next.summary}).` })
      } else {
        alerts.push({ level: 'warning', icon: '⚠️', message: `${unassigned.length} of ${totalEvents} events need staff.` })
      }
    }

    // Roles
    if (!venue.venue_manager_id && venue.requires_assignment) {
      alerts.push({ level: 'warning', icon: '⚠️', message: 'No venue manager assigned.' })
    }

    // Tickets
    if (openTickets.length > 0) {
      const crit = openTickets.filter((t: any) => t.priority === 'critical' || t.priority === 'high').length
      const age = Math.ceil((now.getTime() - new Date(openTickets[0].created_at).getTime()) / 86400000)
      alerts.push({
        level: crit > 0 ? 'urgent' : 'warning',
        icon: crit > 0 ? '🔴' : '📋',
        message: crit > 0
          ? `${crit} high/critical ticket${crit > 1 ? 's' : ''} open.`
          : `${openTickets.length} open ticket${openTickets.length > 1 ? 's' : ''} (oldest: ${age}d).`,
      })
    }

    // Overdue workflows
    const overdue = events.filter((e: any) => new Date(e.event_date) < now && e.workflow_status !== 'post_game_submitted' && parseInt(e.assigned_count) > 0)
    if (overdue.length > 0) {
      alerts.push({ level: 'warning', icon: '📝', message: `${overdue.length} event${overdue.length > 1 ? 's' : ''} missing post-game reports.` })
    }

    // All clear
    if (alerts.length === 0) {
      alerts.push({ level: 'good', icon: '✅', message: totalEvents > 0 ? `All ${totalEvents} events staffed. Looking good.` : 'No upcoming events. All clear.' })
    }

    // Recommendation
    let recommendation = ''
    if (unassigned.length > 0) recommendation = `Assign staff to ${unassigned.length} event${unassigned.length > 1 ? 's' : ''}.`
    else if (!venue.venue_manager_id && venue.requires_assignment) recommendation = 'Assign a venue manager.'
    else if (openTickets.some((t: any) => t.priority === 'critical')) recommendation = 'Address critical tickets.'

    return NextResponse.json({
      alerts,
      ai_summary: null,
      stats: { coverage_rate: coverageRate, workflow_rate: workflowRate, upcoming_events: totalEvents, unassigned_events: unassigned.length, open_tickets: openTickets.length, resolved_this_week: resolvedThisWeek },
      recommendation,
      generated_at: now.toISOString(),
    })
  } catch (err: any) {
    console.error('Briefing error:', err?.message || err)
    return NextResponse.json({ error: err?.message || 'Internal server error' }, { status: 500 })
  }
}
