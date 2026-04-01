import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

function generateBriefing(venue: any, events: any[], openTickets: any[], wf: any, resolvedThisWeek: number, now: Date) {
  const totalEvents = events.length
  const unassigned = events.filter((e: any) => parseInt(e.assigned_count) === 0)
  const assigned = totalEvents - unassigned.length
  const coverageRate = totalEvents > 0 ? Math.round((assigned / totalEvents) * 100) : null
  const wfTotal = parseInt(wf.total) || 0
  const wfDone = parseInt(wf.completed) || 0
  const workflowRate = wfTotal > 0 ? Math.round((wfDone / wfTotal) * 100) : null

  const alerts: Array<{ level: string; icon: string; message: string }> = []
  const lines: string[] = []

  // Staffing
  if (unassigned.length > 0 && venue.requires_assignment) {
    const next = unassigned[0]
    const days = Math.ceil((new Date(next.event_date).getTime() - now.getTime()) / 86400000)
    if (days <= 2) {
      alerts.push({ level: 'urgent', icon: '🔴', message: `${unassigned.length} event${unassigned.length > 1 ? 's' : ''} unassigned — next is ${days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days'}.` })
      lines.push(`**${venue.name}** has ${unassigned.length} upcoming event${unassigned.length > 1 ? 's' : ''} with no staff assigned. The most urgent is **${next.summary}** ${days === 0 ? 'happening today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days'} — this needs immediate attention.`)
    } else {
      alerts.push({ level: 'warning', icon: '⚠️', message: `${unassigned.length} of ${totalEvents} events need staff.` })
      lines.push(`${unassigned.length} of ${totalEvents} upcoming events still need staff assigned. Coverage is at ${coverageRate}%.`)
    }
  } else if (totalEvents > 0) {
    lines.push(`All ${totalEvents} upcoming events are fully staffed${coverageRate === 100 ? ' — 100% coverage' : ''}.`)
  } else {
    lines.push(`No upcoming events in the next 14 days.`)
  }

  // Roles
  if (!venue.venue_manager_id && venue.requires_assignment) {
    alerts.push({ level: 'warning', icon: '⚠️', message: 'No venue manager assigned.' })
    lines.push(`This venue has no manager assigned, which makes coordination harder.`)
  } else if (venue.manager_name) {
    lines.push(`${venue.manager_name} is managing this venue${venue.lead_rep_name ? ` with ${venue.lead_rep_name} as lead field rep` : ''}.`)
  }

  // Tickets
  if (openTickets.length > 0) {
    const crit = openTickets.filter((t: any) => t.priority === 'critical' || t.priority === 'high').length
    const age = Math.ceil((now.getTime() - new Date(openTickets[0].created_at).getTime()) / 86400000)
    if (crit > 0) {
      alerts.push({ level: 'urgent', icon: '🔴', message: `${crit} high/critical ticket${crit > 1 ? 's' : ''} open.` })
      lines.push(`There ${crit === 1 ? 'is' : 'are'} **${crit} high-priority ticket${crit > 1 ? 's' : ''}** that need attention. ${openTickets.length} total open, oldest is ${age} days old.`)
    } else {
      alerts.push({ level: 'info', icon: '📋', message: `${openTickets.length} open ticket${openTickets.length > 1 ? 's' : ''}.` })
      lines.push(`${openTickets.length} open ticket${openTickets.length > 1 ? 's' : ''} (${resolvedThisWeek} resolved this week). Nothing critical.`)
    }
  } else {
    lines.push(`No open tickets — clean slate.`)
  }

  // Workflows
  const overdue = events.filter((e: any) => new Date(e.event_date) < now && e.workflow_status !== 'post_game_submitted' && parseInt(e.assigned_count) > 0)
  if (overdue.length > 0) {
    alerts.push({ level: 'warning', icon: '📝', message: `${overdue.length} missing post-game reports.` })
    lines.push(`${overdue.length} past event${overdue.length > 1 ? 's are' : ' is'} still missing post-game reports.`)
  }

  // All clear override
  if (alerts.length === 0) {
    alerts.push({ level: 'good', icon: '✅', message: 'All clear.' })
  }

  // Recommendation
  let recommendation = ''
  if (unassigned.length > 0) recommendation = `Prioritize staffing the ${unassigned.length} unassigned event${unassigned.length > 1 ? 's' : ''} — start with the soonest.`
  else if (!venue.venue_manager_id && venue.requires_assignment) recommendation = 'Assign a venue manager to streamline operations.'
  else if (crit(openTickets) > 0) recommendation = 'Resolve the high-priority tickets before they escalate.'
  else if (overdue.length > 0) recommendation = 'Follow up on missing post-game reports.'

  const content = lines.join(' ')

  return {
    content,
    alerts,
    stats: { coverage_rate: coverageRate, workflow_rate: workflowRate, upcoming_events: totalEvents, unassigned_events: unassigned.length, open_tickets: openTickets.length, resolved_this_week: resolvedThisWeek },
    recommendation,
  }
}

function crit(tickets: any[]) {
  return tickets.filter((t: any) => t.priority === 'critical' || t.priority === 'high').length
}

async function fetchAndGenerate(venueId: string) {
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
  if (!venue) return null

  const resolvedThisWeek = parseInt(resolvedRes.rows[0]?.count || '0')
  const briefing = generateBriefing(venue, eventsRes.rows, ticketsRes.rows, workflowRes.rows[0] || { total: 0, completed: 0 }, resolvedThisWeek, now)

  // Cache it
  await query(
    `INSERT INTO venue_briefings (venue_id, content, alerts, stats, recommendation, generated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (venue_id) DO UPDATE SET content = $2, alerts = $3, stats = $4, recommendation = $5, generated_at = NOW()`,
    [venueId, briefing.content, JSON.stringify(briefing.alerts), JSON.stringify(briefing.stats), briefing.recommendation]
  )

  return { ...briefing, generated_at: new Date().toISOString() }
}

// GET — return cached briefing or generate fresh
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Try cache first
    const cached = await query('SELECT * FROM venue_briefings WHERE venue_id = $1', [params.id])
    if (cached.rows.length > 0) {
      const row = cached.rows[0]
      const age = Date.now() - new Date(row.generated_at).getTime()
      // If less than 5 min old, return cache
      if (age < 5 * 60 * 1000) {
        return NextResponse.json({
          content: row.content,
          alerts: row.alerts,
          stats: row.stats,
          recommendation: row.recommendation,
          generated_at: row.generated_at,
        })
      }
    }

    // Generate fresh
    const briefing = await fetchAndGenerate(params.id)
    if (!briefing) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
    return NextResponse.json(briefing)
  } catch (err: any) {
    console.error('Briefing error:', err?.message || err)
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}

// POST — force regenerate
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const briefing = await fetchAndGenerate(params.id)
    if (!briefing) return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
    return NextResponse.json(briefing)
  } catch (err: any) {
    console.error('Briefing regen error:', err?.message || err)
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
