import { query } from '@/lib/db'
import type { Skill } from '@/lib/ai/types'

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0
  return Math.round((numerator / denominator) * 100)
}

function ticketLine(row: Record<string, unknown>): string {
  const number = row.ticket_number ? `#${row.ticket_number}` : 'ticket'
  const title = String(row.title || 'Untitled ticket')
  const venue = row.venue_name ? ` at ${row.venue_name}` : ''
  const priority = row.priority ? `, ${row.priority}` : ''
  return `- ${number}: ${title}${venue}${priority} - [open](/tickets/${row.id})`
}

function eventLine(row: Record<string, unknown>): string {
  const summary = String(row.summary || 'Untitled event')
  const venue = row.venue_name ? ` at ${row.venue_name}` : ''
  const when = [row.event_date, row.local_time].filter(Boolean).join(' ')
  return `- ${summary}${venue}${when ? ` - ${when}` : ''} - [open](/events/${row.id})`
}

function walkthroughLine(row: Record<string, unknown>): string {
  const venue = row.venue_name ? ` at ${row.venue_name}` : ''
  const result = row.result ? ` - ${row.result}` : ''
  const date = row.log_date ? ` (${row.log_date})` : ''
  return `- Walkthrough${venue}${result}${date}`
}

const skill: Skill = {
  name: 'operations_snapshot',
  description: 'Build a live operations snapshot with tickets, events, staffing, walkthroughs, inventory, assistant usage, and suggested next actions.',
  category: 'Service Ops',
  icon: 'AI',
  role: 'technician',
  parameters: {
    type: 'object',
    properties: {
      focus: {
        type: 'string',
        description: 'Optional focus area: today, week, tickets, staffing, venues, walkthroughs, inventory, assistant',
      },
    },
  },
  async handler(args) {
    const [stats, urgentTickets, unassignedEvents, recentWalkthroughs, venueIssues] = await Promise.all([
      query(
        `SELECT
          (SELECT COUNT(*) FROM venues WHERE COALESCE(is_active,true)=true) AS active_venues,
          (SELECT COUNT(*) FROM staff WHERE COALESCE(is_active,true)=true) AS active_staff,
          (SELECT COUNT(*) FROM staff WHERE COALESCE(is_active,true)=true AND role='technician') AS active_technicians,
          (SELECT COUNT(*) FROM events WHERE COALESCE(approval_status, 'approved') = 'approved' AND event_date = CURRENT_DATE) AS events_today,
          (SELECT COUNT(*) FROM events WHERE COALESCE(approval_status, 'approved') = 'approved' AND event_date >= CURRENT_DATE AND event_date < CURRENT_DATE + 7) AS events_this_week,
          (SELECT COUNT(*) FROM events WHERE COALESCE(approval_status, 'approved') = 'approved' AND event_date >= CURRENT_DATE AND event_date < CURRENT_DATE + 7
             AND NOT EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = events.id)) AS unassigned_events_this_week,
          (SELECT COUNT(*) FROM tickets WHERE status NOT IN ('closed','resolved')) AS open_tickets,
          (SELECT COUNT(*) FROM tickets WHERE priority IN ('high','critical') AND status NOT IN ('closed','resolved')) AS urgent_open_tickets,
          (SELECT COUNT(*) FROM tickets WHERE created_at >= NOW() - INTERVAL '7 days') AS tickets_last_7_days,
          (SELECT COUNT(*) FROM tickets WHERE source IN ('portal','email','phone','voicemail') AND created_at >= NOW() - INTERVAL '7 days') AS automated_tickets_last_7_days,
          (SELECT COUNT(*) FROM walkthrough_logs WHERE log_date >= CURRENT_DATE - INTERVAL '7 days') AS walkthroughs_last_7_days,
          (SELECT COUNT(DISTINCT user_id) FROM ai_chats WHERE updated_at >= NOW() - INTERVAL '7 days') AS ai_users_last_7_days,
          (SELECT COUNT(*) FROM ai_messages WHERE role='tool' AND created_at >= NOW() - INTERVAL '7 days') AS ai_tool_runs_last_7_days,
          (SELECT COUNT(DISTINCT staff_id) FROM workflow_submissions WHERE submitted_at >= NOW() - INTERVAL '7 days') AS workflow_users_last_7_days,
          (SELECT COUNT(*) FROM inventory WHERE COALESCE(quantity,0) <= COALESCE(threshold_low,0)) AS low_stock_items`
      ),
      query(
        `SELECT t.id, t.ticket_number, t.title, t.priority, t.status, v.name AS venue_name
         FROM tickets t
         LEFT JOIN venues v ON v.id = t.venue_id
         WHERE t.status NOT IN ('closed','resolved')
         ORDER BY
           CASE t.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
           t.created_at DESC
         LIMIT 5`
      ),
      query(
        `SELECT e.id, e.summary, v.name AS venue_name,
                TO_CHAR(e.event_date,'YYYY-MM-DD') AS event_date,
                TO_CHAR(e.start_time AT TIME ZONE COALESCE(v.timezone,'America/New_York'),'HH12:MI AM') AS local_time
         FROM events e
         LEFT JOIN venues v ON v.id = e.venue_id
         WHERE COALESCE(e.approval_status, 'approved') = 'approved'
           AND e.event_date >= CURRENT_DATE
           AND e.event_date < CURRENT_DATE + 7
           AND NOT EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = e.id)
         ORDER BY e.start_time ASC
         LIMIT 5`
      ),
      query(
        `SELECT wl.id, wl.result, TO_CHAR(wl.log_date,'YYYY-MM-DD') AS log_date, v.name AS venue_name
         FROM walkthrough_logs wl
         LEFT JOIN venues v ON v.id = wl.venue_id
         WHERE wl.log_date >= CURRENT_DATE - INTERVAL '7 days'
         ORDER BY wl.log_date DESC
         LIMIT 5`
      ),
      query(
        `SELECT v.id, v.name, COUNT(t.id)::int AS open_ticket_count,
                COUNT(*) FILTER (WHERE t.priority IN ('high','critical'))::int AS urgent_ticket_count
         FROM venues v
         JOIN tickets t ON t.venue_id = v.id
         WHERE t.status NOT IN ('closed','resolved')
         GROUP BY v.id, v.name
         ORDER BY urgent_ticket_count DESC, open_ticket_count DESC, v.name ASC
         LIMIT 5`
      ),
    ])

    const s = stats.rows[0] || {}
    const eventsThisWeek = Number(s.events_this_week || 0)
    const unassigned = Number(s.unassigned_events_this_week || 0)
    const coverage = pct(eventsThisWeek - unassigned, eventsThisWeek)
    const automatedTickets = Number(s.automated_tickets_last_7_days || 0)
    const ticketsLast7 = Number(s.tickets_last_7_days || 0)
    const automationShare = pct(automatedTickets, ticketsLast7)
    const focus = typeof args.focus === 'string' && args.focus.trim() ? args.focus.trim() : 'today'

    const lines = [
      `## Operations Snapshot`,
      `Focus: ${focus}`,
      '',
      `**Live picture:** ${s.active_venues} active venues, ${s.active_technicians} active technicians, ${s.events_today} events today, ${s.events_this_week} events this week.`,
      `**Needs attention:** ${s.open_tickets} open tickets, ${s.urgent_open_tickets} urgent, ${unassigned} unassigned events this week, ${s.low_stock_items} low-stock items.`,
      `**Coverage:** ${coverage}% of this week's events have staffing assigned.`,
      `**Activity:** ${s.walkthroughs_last_7_days} walkthroughs, ${s.workflow_users_last_7_days} workflow users, ${s.ai_users_last_7_days} assistant users, ${s.ai_tool_runs_last_7_days} assistant tool runs in the last 7 days.`,
      `**Automation:** ${automationShare}% of tickets created in the last 7 days came from portal, email, phone, or voicemail sources.`,
      '',
      '## Good Starting Points',
      '- Ask for urgent tickets and open one directly.',
      '- Ask which events still need staffing before assignments are changed.',
      '- Search by team name, venue name, city, or alias.',
      '- Turn a field note into a structured service ticket.',
      '- Draft a client-safe update without exposing internal comments.',
      '- Ask the assistant to open a page, highlight a row, or fill a form.',
    ]

    if (urgentTickets.rows.length > 0) {
      lines.push('', '## Open Tickets', ...urgentTickets.rows.map(ticketLine))
    }

    if (unassignedEvents.rows.length > 0) {
      lines.push('', '## Staffing To Review', ...unassignedEvents.rows.map(eventLine))
    }

    if (venueIssues.rows.length > 0) {
      lines.push(
        '',
        '## Venues With Open Issues',
        ...venueIssues.rows.map(row => {
          const urgent = Number(row.urgent_ticket_count || 0)
          const urgentText = urgent > 0 ? `, ${urgent} urgent` : ''
          return `- ${row.name}: ${row.open_ticket_count} open tickets${urgentText} - [open](/venues/${row.id})`
        })
      )
    }

    if (recentWalkthroughs.rows.length > 0) {
      lines.push('', '## Recent Walkthroughs', ...recentWalkthroughs.rows.map(walkthroughLine))
    }

    lines.push(
      '',
      '## Try Next',
      '- "Show urgent tickets by venue."',
      '- "Which events this week need staffing?"',
      '- "Find the venue for Flyers."',
      '- "Create a ticket from this field note: display cuts to black during playback."',
      '- "Draft a client update for the highest priority ticket."'
    )

    return {
      metrics: {
        ...s,
        staffing_coverage_percent: coverage,
        automated_ticket_percent_last_7_days: automationShare,
      },
      urgent_tickets: urgentTickets.rows,
      unassigned_events: unassignedEvents.rows,
      recent_walkthroughs: recentWalkthroughs.rows,
      venue_issues: venueIssues.rows,
      text_summary: lines.join('\n'),
    }
  },
}

export default skill
