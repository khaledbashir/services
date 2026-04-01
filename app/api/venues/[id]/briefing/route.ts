import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

interface Alert {
  level: 'urgent' | 'warning' | 'info' | 'good'
  icon: string
  message: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const venueId = params.id
    const now = new Date()
    const today = now.toISOString().split('T')[0]

    // Parallel queries for all the data we need
    const [venueRes, eventsRes, ticketsRes, workflowRes, staffRes] = await Promise.all([
      // Venue info
      query(
        `SELECT v.name, v.venue_manager_id, v.lead_field_rep_id, v.requires_assignment,
                sm.full_name as manager_name, sl.full_name as lead_rep_name
         FROM venues v
         LEFT JOIN staff sm ON v.venue_manager_id = sm.id
         LEFT JOIN staff sl ON v.lead_field_rep_id = sl.id
         WHERE v.id = $1`,
        [venueId]
      ),
      // Upcoming events (next 14 days) with assignment counts
      query(
        `SELECT e.id, e.summary, e.event_date, e.start_time, e.workflow_status,
                COUNT(ea.id) as assigned_count
         FROM events e
         LEFT JOIN event_assignments ea ON e.id = ea.event_id
         WHERE e.venue_id = $1 AND e.event_date >= $2 AND e.event_date <= $2::date + INTERVAL '14 days'
         GROUP BY e.id, e.summary, e.event_date, e.start_time, e.workflow_status
         ORDER BY e.start_time`,
        [venueId, today]
      ),
      // Open tickets
      query(
        `SELECT id, title, status, priority, created_at, resolved_at
         FROM tickets
         WHERE venue_id = $1 AND status IN ('new', 'on_hold', 'in_progress', 'escalated')
         ORDER BY created_at`,
        [venueId]
      ),
      // Workflow completion (last 30 days)
      query(
        `SELECT
           COUNT(*) as total,
           COUNT(CASE WHEN workflow_status = 'post_game_submitted' THEN 1 END) as completed
         FROM events
         WHERE venue_id = $1 AND event_date >= $2::date - INTERVAL '30 days' AND event_date < $2`,
        [venueId, today]
      ),
      // Resolved tickets this week
      query(
        `SELECT COUNT(*) as count FROM tickets
         WHERE venue_id = $1 AND status = 'closed' AND resolved_at >= $2::date - INTERVAL '7 days'`,
        [venueId, today]
      ),
    ])

    const venue = venueRes.rows[0]
    if (!venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
    }

    const events = eventsRes.rows
    const openTickets = ticketsRes.rows
    const workflowData = workflowRes.rows[0] || { total: 0, completed: 0 }
    const resolvedThisWeek = parseInt(staffRes.rows[0]?.count || '0')

    const alerts: Alert[] = []

    // --- STAFFING ALERTS ---
    const totalEvents = events.length
    const unassignedEvents = events.filter((e: any) => parseInt(e.assigned_count) === 0)
    const assignedEvents = totalEvents - unassignedEvents.length

    if (unassignedEvents.length > 0 && venue.requires_assignment) {
      const nextUnassigned = unassignedEvents[0]
      const nextDate = new Date(nextUnassigned.event_date)
      const daysUntil = Math.ceil((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      if (daysUntil <= 2) {
        alerts.push({
          level: 'urgent',
          icon: '🔴',
          message: `${unassignedEvents.length} upcoming event${unassignedEvents.length > 1 ? 's' : ''} with no staff assigned. Next one is ${daysUntil === 0 ? 'TODAY' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`} (${nextUnassigned.summary}).`,
        })
      } else {
        alerts.push({
          level: 'warning',
          icon: '⚠️',
          message: `${unassignedEvents.length} of ${totalEvents} upcoming events need staff assignment.`,
        })
      }
    }

    // --- ROLE ALERTS ---
    if (!venue.venue_manager_id && venue.requires_assignment) {
      alerts.push({
        level: 'warning',
        icon: '⚠️',
        message: 'No venue manager assigned — coverage coordination at risk.',
      })
    }
    if (!venue.lead_field_rep_id && venue.requires_assignment) {
      alerts.push({
        level: 'info',
        icon: 'ℹ️',
        message: 'No lead field representative assigned.',
      })
    }

    // --- TICKET ALERTS ---
    if (openTickets.length > 0) {
      const oldest = openTickets[0]
      const daysOld = Math.ceil((now.getTime() - new Date(oldest.created_at).getTime()) / (1000 * 60 * 60 * 24))
      const criticalCount = openTickets.filter((t: any) => t.priority === 'critical' || t.priority === 'high').length

      if (criticalCount > 0) {
        alerts.push({
          level: 'urgent',
          icon: '🔴',
          message: `${criticalCount} high/critical priority ticket${criticalCount > 1 ? 's' : ''} open. ${openTickets.length} total open tickets.`,
        })
      } else {
        alerts.push({
          level: 'warning',
          icon: '📋',
          message: `${openTickets.length} open ticket${openTickets.length > 1 ? 's' : ''} (${resolvedThisWeek} resolved this week). Oldest is ${daysOld} day${daysOld !== 1 ? 's' : ''} old.`,
        })
      }
    }

    // --- WORKFLOW ALERTS ---
    const workflowTotal = parseInt(workflowData.total) || 0
    const workflowCompleted = parseInt(workflowData.completed) || 0

    if (workflowTotal > 0) {
      const overdue = events.filter((e: any) => {
        const eventDate = new Date(e.event_date)
        return eventDate < now && e.workflow_status !== 'post_game_submitted' && parseInt(e.assigned_count) > 0
      })
      if (overdue.length > 0) {
        alerts.push({
          level: 'warning',
          icon: '📝',
          message: `${overdue.length} past event${overdue.length > 1 ? 's' : ''} still missing post-game reports.`,
        })
      }
    }

    // --- STATS ---
    const coverageRate = totalEvents > 0 ? Math.round((assignedEvents / totalEvents) * 100) : null
    const workflowRate = workflowTotal > 0 ? Math.round((workflowCompleted / workflowTotal) * 100) : null

    // --- ALL CLEAR ---
    if (alerts.length === 0) {
      if (totalEvents > 0) {
        alerts.push({
          level: 'good',
          icon: '✅',
          message: `All ${totalEvents} upcoming events are staffed${coverageRate === 100 ? ', 100% coverage' : ''}. ${openTickets.length === 0 ? 'No open tickets.' : ''} Looking good.`,
        })
      } else {
        alerts.push({
          level: 'good',
          icon: '✅',
          message: 'No upcoming events in the next 14 days. All clear.',
        })
      }
    }

    // --- RECOMMENDATION ---
    let recommendation = ''
    if (alerts.some(a => a.level === 'urgent')) {
      if (unassignedEvents.length > 0) {
        recommendation = `Assign staff to the ${unassignedEvents.length} unassigned event${unassignedEvents.length > 1 ? 's' : ''} — the first one is coming up fast.`
      } else if (openTickets.some((t: any) => t.priority === 'critical')) {
        recommendation = 'Address the critical tickets before they impact operations.'
      }
    } else if (!venue.venue_manager_id && venue.requires_assignment) {
      recommendation = 'Assign a venue manager to improve coverage coordination.'
    } else if (unassignedEvents.length > 0) {
      recommendation = `Staff the ${unassignedEvents.length} unassigned event${unassignedEvents.length > 1 ? 's' : ''} while there\'s still time.`
    }

    return NextResponse.json({
      alerts,
      stats: {
        coverage_rate: coverageRate,
        workflow_rate: workflowRate,
        upcoming_events: totalEvents,
        unassigned_events: unassignedEvents.length,
        open_tickets: openTickets.length,
        resolved_this_week: resolvedThisWeek,
      },
      recommendation,
      generated_at: now.toISOString(),
    })
  } catch (err) {
    console.error('Error generating venue briefing:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
