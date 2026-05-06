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

const skill: Skill = {
  name: 'demo_briefing',
  description: 'Build a Joe-ready live demo briefing for the Services side AI: real ops metrics, strongest demo flows, and current risk points.',
  category: 'System',
  icon: 'AI',
  role: 'technician',
  parameters: {
    type: 'object',
    properties: {
      focus: {
        type: 'string',
        description: 'Optional focus area: joe, ai, tickets, operations, client_portal, upsell',
      },
    },
  },
  async handler(args) {
    const [stats, urgentTickets, unassignedEvents, recentWalkthroughs] = await Promise.all([
      query(
        `SELECT
          (SELECT COUNT(*) FROM venues WHERE COALESCE(is_active,true)=true) AS active_venues,
          (SELECT COUNT(*) FROM staff WHERE COALESCE(is_active,true)=true) AS active_staff,
          (SELECT COUNT(*) FROM staff WHERE COALESCE(is_active,true)=true AND role='technician') AS active_technicians,
          (SELECT COUNT(*) FROM events WHERE event_date = CURRENT_DATE) AS events_today,
          (SELECT COUNT(*) FROM events WHERE event_date >= CURRENT_DATE AND event_date < CURRENT_DATE + 7) AS events_this_week,
          (SELECT COUNT(*) FROM events WHERE event_date >= CURRENT_DATE AND event_date < CURRENT_DATE + 7
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
         WHERE e.event_date >= CURRENT_DATE
           AND e.event_date < CURRENT_DATE + 7
           AND NOT EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = e.id)
         ORDER BY e.start_time ASC
         LIMIT 5`
      ),
      query(
        `SELECT wl.id, wl.result, wl.log_date, v.name AS venue_name
         FROM walkthrough_logs wl
         LEFT JOIN venues v ON v.id = wl.venue_id
         WHERE wl.log_date >= CURRENT_DATE - INTERVAL '7 days'
         ORDER BY wl.log_date DESC
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
    const focus = typeof args.focus === 'string' ? args.focus : 'joe'

    const lines = [
      `Demo briefing for ${focus}`,
      '',
      `Live proof: ${s.active_venues} active venues, ${s.active_technicians} active technicians, ${s.events_today} events today, ${s.events_this_week} events this week.`,
      `Ops pressure: ${coverage}% weekly staffing coverage, ${s.open_tickets} open tickets, ${s.urgent_open_tickets} urgent, ${s.low_stock_items} low-stock items.`,
      `AI/automation signal: ${s.ai_users_last_7_days} staff used the assistant in the last 7 days, ${s.ai_tool_runs_last_7_days} tool runs, ${automationShare}% of tickets this week came from automated sources.`,
      '',
      'Best demo path:',
      '1. Open the side AI and ask for this briefing.',
      '2. Ask "show urgent open tickets" and click directly into one ticket.',
      '3. Ask "what games are this week that still need staffing" to show live ops risk.',
      '4. Ask "find the venue for Flyers" to show team alias search.',
      '5. Create a realistic ticket from a spoken or typed field note and show the Slack-ready ticket card.',
      '',
      'Strongest upsell angle:',
      'The AI is not a chat toy. It reads live ops data, resolves venue/team language, creates structured tickets, drives the dashboard UI, and gives Joe a control layer over staffing, service issues, walkthroughs, and client-visible proof.',
    ]

    if (urgentTickets.rows.length > 0) {
      lines.push('', 'Open items worth showing:', ...urgentTickets.rows.map(ticketLine))
    }

    if (unassignedEvents.rows.length > 0) {
      lines.push('', 'Staffing risk this week:', ...unassignedEvents.rows.map(eventLine))
    }

    if (recentWalkthroughs.rows.length > 0) {
      lines.push('', `Walkthrough activity: ${recentWalkthroughs.rows.length} recent rows available for Nick-style ops proof.`)
    }

    return {
      metrics: {
        ...s,
        staffing_coverage_percent: coverage,
        automated_ticket_percent_last_7_days: automationShare,
      },
      urgent_tickets: urgentTickets.rows,
      unassigned_events: unassignedEvents.rows,
      recent_walkthroughs: recentWalkthroughs.rows,
      text_summary: lines.join('\n'),
    }
  },
}

export default skill
