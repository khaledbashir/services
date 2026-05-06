import { query } from '@/lib/db'
import type { Skill } from '@/lib/ai/types'

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 100
  return Math.round((numerator / denominator) * 100)
}

function urgencyLabel(score: number): string {
  if (score >= 80) return 'High'
  if (score >= 45) return 'Medium'
  return 'Low'
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`
}

function ticketLine(row: Record<string, unknown>): string {
  const number = row.ticket_number ? `#${row.ticket_number}` : 'ticket'
  const venue = row.venue_name ? ` @ ${row.venue_name}` : ''
  const due = row.sla_resolution_due_label ? `, due ${row.sla_resolution_due_label}` : ''
  const age = row.age_hours ? `, ${row.age_hours}h old` : ''
  return `- ${number}: ${row.title || 'Untitled ticket'}${venue} (${row.priority || 'medium'}${due}${age}) - [open ->](/tickets/${row.id})`
}

function eventLine(row: Record<string, unknown>): string {
  const venue = row.venue_name ? ` @ ${row.venue_name}` : ''
  const time = row.local_time ? ` ${row.local_time}` : ''
  const assigned = Number(row.assigned_count || 0)
  const staffing = assigned > 0 ? `${assigned} assigned` : 'unassigned'
  return `- ${row.summary || 'Untitled event'}${venue}${time} (${staffing}) - [open ->](/events/${row.id})`
}

function venueLine(row: Record<string, unknown>): string {
  const urgent = Number(row.urgent_ticket_count || 0)
  const unassigned = Number(row.unassigned_event_count || 0)
  const parts = Number(row.low_stock_count || 0)
  const pieces = [
    `${row.open_ticket_count || 0} open tickets`,
    urgent > 0 ? `${urgent} urgent` : '',
    unassigned > 0 ? `${unassigned} unassigned events` : '',
    parts > 0 ? `${parts} low-stock items` : '',
  ].filter(Boolean)
  return `- ${row.name}: ${pieces.join(', ')} - [open ->](/venues/${row.id})`
}

function walkthroughLine(row: Record<string, unknown>): string {
  const venue = row.venue_name ? ` @ ${row.venue_name}` : ''
  const issue = row.issues_found || row.notes ? `: ${String(row.issues_found || row.notes).replace(/\s+/g, ' ').slice(0, 110)}` : ''
  return `- ${row.log_date || 'recent'}${venue} (${row.result || 'logged'})${issue}`
}

export async function buildMorningCommandCenter(args: Record<string, unknown> = {}) {
  const horizonDays = Math.max(1, Math.min(Number(args.horizon_days) || 7, 14))
  const maxItems = Math.max(3, Math.min(Number(args.max_items) || 5, 8))

  const [stats, todaysEvents, staffingGaps, ticketRisks, venueRisks, walkthroughIssues, lowStock] = await Promise.all([
    query(
      `SELECT
        (SELECT COUNT(*) FROM events WHERE event_date = CURRENT_DATE)::int AS events_today,
        (SELECT COUNT(*) FROM events WHERE event_date >= CURRENT_DATE AND event_date < CURRENT_DATE + ($1::int * INTERVAL '1 day'))::int AS events_horizon,
        (SELECT COUNT(*) FROM events WHERE event_date >= CURRENT_DATE AND event_date < CURRENT_DATE + ($1::int * INTERVAL '1 day')
           AND NOT EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = events.id))::int AS unassigned_events_horizon,
        (SELECT COUNT(*) FROM tickets WHERE COALESCE(LOWER(status),'open') NOT IN ('closed','resolved','done','cancelled'))::int AS open_tickets,
        (SELECT COUNT(*) FROM tickets WHERE COALESCE(LOWER(status),'open') NOT IN ('closed','resolved','done','cancelled')
           AND LOWER(COALESCE(priority,'')) IN ('critical','high'))::int AS urgent_open_tickets,
        (SELECT COUNT(*) FROM tickets WHERE COALESCE(LOWER(status),'open') NOT IN ('closed','resolved','done','cancelled')
           AND sla_resolution_due IS NOT NULL AND sla_resolution_due <= NOW() + INTERVAL '24 hours')::int AS sla_due_24h,
        (SELECT COUNT(*) FROM walkthrough_logs WHERE log_date >= CURRENT_DATE - INTERVAL '1 day')::int AS walkthroughs_last_day,
        (SELECT COUNT(*) FROM walkthrough_logs WHERE log_date >= CURRENT_DATE - INTERVAL '7 days'
           AND (LOWER(COALESCE(result,'')) LIKE '%issue%' OR COALESCE(issues_found,'') <> ''))::int AS walkthrough_issue_signals,
        (SELECT COUNT(*) FROM inventory WHERE COALESCE(quantity,0) <= COALESCE(threshold_low,0))::int AS low_stock_items,
        (SELECT COUNT(DISTINCT user_id) FROM ai_chats WHERE updated_at >= NOW() - INTERVAL '7 days')::int AS ai_users_last_7_days,
        (SELECT COUNT(*) FROM ai_messages WHERE role='tool' AND created_at >= NOW() - INTERVAL '7 days')::int AS ai_tool_runs_last_7_days,
        (SELECT COUNT(*) FROM tickets WHERE source IN ('portal','email','phone','voicemail') AND created_at >= NOW() - INTERVAL '7 days')::int AS automated_tickets_last_7_days,
        (SELECT COUNT(*) FROM tickets WHERE created_at >= NOW() - INTERVAL '7 days')::int AS tickets_last_7_days`,
      [horizonDays]
    ),
    query(
      `SELECT e.id, e.summary, v.name AS venue_name,
              TO_CHAR(e.start_time AT TIME ZONE COALESCE(v.timezone,'America/New_York'),'HH12:MI AM') AS local_time,
              e.workflow_status,
              (SELECT COUNT(*) FROM event_assignments ea WHERE ea.event_id = e.id)::int AS assigned_count
       FROM events e
       LEFT JOIN venues v ON v.id = e.venue_id
       WHERE e.event_date = CURRENT_DATE
       ORDER BY e.start_time ASC
       LIMIT $1`,
      [maxItems]
    ),
    query(
      `SELECT e.id, e.summary, v.name AS venue_name,
              TO_CHAR(e.event_date,'YYYY-MM-DD') AS event_date,
              TO_CHAR(e.start_time AT TIME ZONE COALESCE(v.timezone,'America/New_York'),'HH12:MI AM') AS local_time,
              (SELECT COUNT(*) FROM event_assignments ea WHERE ea.event_id = e.id)::int AS assigned_count
       FROM events e
       LEFT JOIN venues v ON v.id = e.venue_id
       WHERE e.event_date >= CURRENT_DATE
         AND e.event_date < CURRENT_DATE + ($1::int * INTERVAL '1 day')
         AND NOT EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = e.id)
       ORDER BY e.start_time ASC
       LIMIT $2`,
      [horizonDays, maxItems]
    ),
    query(
      `SELECT t.id, t.ticket_number, t.title, t.priority, t.status,
              DATE_PART('hour', NOW() - t.created_at)::int AS age_hours,
              TO_CHAR(t.sla_resolution_due AT TIME ZONE COALESCE(v.timezone,'America/New_York'),'Mon DD HH12:MI AM') AS sla_resolution_due_label,
              v.name AS venue_name
       FROM tickets t
       LEFT JOIN venues v ON v.id = t.venue_id
       WHERE COALESCE(LOWER(t.status),'open') NOT IN ('closed','resolved','done','cancelled')
       ORDER BY
         CASE LOWER(COALESCE(t.priority,'')) WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         CASE WHEN t.sla_resolution_due IS NULL THEN 1 ELSE 0 END,
         t.sla_resolution_due ASC NULLS LAST,
         t.created_at ASC
       LIMIT $1`,
      [maxItems]
    ),
    query(
      `WITH venue_ticket_risk AS (
         SELECT v.id, v.name,
                COUNT(t.id)::int AS open_ticket_count,
                COUNT(*) FILTER (WHERE LOWER(COALESCE(t.priority,'')) IN ('critical','high'))::int AS urgent_ticket_count
         FROM venues v
         LEFT JOIN tickets t ON t.venue_id = v.id
          AND COALESCE(LOWER(t.status),'open') NOT IN ('closed','resolved','done','cancelled')
         WHERE COALESCE(v.is_active,true)=true
         GROUP BY v.id, v.name
       ),
       venue_event_risk AS (
         SELECT e.venue_id,
                COUNT(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM event_assignments ea WHERE ea.event_id = e.id))::int AS unassigned_event_count
         FROM events e
         WHERE e.event_date >= CURRENT_DATE
           AND e.event_date < CURRENT_DATE + ($1::int * INTERVAL '1 day')
         GROUP BY e.venue_id
       ),
       venue_parts_risk AS (
         SELECT venue_id, COUNT(*)::int AS low_stock_count
         FROM inventory
         WHERE COALESCE(quantity,0) <= COALESCE(threshold_low,0)
         GROUP BY venue_id
       )
       SELECT vtr.id, vtr.name, vtr.open_ticket_count, vtr.urgent_ticket_count,
              COALESCE(ver.unassigned_event_count,0)::int AS unassigned_event_count,
              COALESCE(vpr.low_stock_count,0)::int AS low_stock_count
       FROM venue_ticket_risk vtr
       LEFT JOIN venue_event_risk ver ON ver.venue_id = vtr.id
       LEFT JOIN venue_parts_risk vpr ON vpr.venue_id = vtr.id
       WHERE vtr.open_ticket_count > 0 OR COALESCE(ver.unassigned_event_count,0) > 0 OR COALESCE(vpr.low_stock_count,0) > 0
       ORDER BY vtr.urgent_ticket_count DESC, COALESCE(ver.unassigned_event_count,0) DESC, vtr.open_ticket_count DESC, COALESCE(vpr.low_stock_count,0) DESC, vtr.name ASC
       LIMIT $2`,
      [horizonDays, maxItems]
    ),
    query(
      `SELECT wl.id, TO_CHAR(wl.log_date,'YYYY-MM-DD') AS log_date, wl.result, wl.issues_found, wl.notes, v.name AS venue_name
       FROM walkthrough_logs wl
       LEFT JOIN venues v ON v.id = wl.venue_id
       WHERE wl.log_date >= CURRENT_DATE - INTERVAL '7 days'
         AND (LOWER(COALESCE(wl.result,'')) LIKE '%issue%' OR COALESCE(wl.issues_found,'') <> '' OR LOWER(COALESCE(wl.notes,'')) LIKE '%issue%')
       ORDER BY wl.log_date DESC, wl.created_at DESC
       LIMIT $1`,
      [maxItems]
    ),
    query(
      `SELECT i.id, COALESCE(i.part_name, i.item_name, i.model_name, 'Inventory item') AS item_name,
              i.quantity, i.threshold_low, v.name AS venue_name
       FROM inventory i
       LEFT JOIN venues v ON v.id = i.venue_id
       WHERE COALESCE(i.quantity,0) <= COALESCE(i.threshold_low,0)
       ORDER BY COALESCE(i.quantity,0) ASC, i.item_name ASC
       LIMIT $1`,
      [maxItems]
    ),
  ])

  const s = stats.rows[0] || {}
  const eventsHorizon = Number(s.events_horizon || 0)
  const unassigned = Number(s.unassigned_events_horizon || 0)
  const staffingCoverage = pct(eventsHorizon - unassigned, eventsHorizon)
  const ticketsLast7 = Number(s.tickets_last_7_days || 0)
  const automationShare = pct(Number(s.automated_tickets_last_7_days || 0), ticketsLast7)

  const priorityScore =
    Number(s.urgent_open_tickets || 0) * 12 +
    Number(s.sla_due_24h || 0) * 10 +
    unassigned * 8 +
    Number(s.walkthrough_issue_signals || 0) * 5 +
    Number(s.low_stock_items || 0) * 3
  const urgency = urgencyLabel(priorityScore)

  const rationale: string[] = []
  if (Number(s.sla_due_24h || 0) > 0) {
    rationale.push(`SLA pressure is active: ${plural(Number(s.sla_due_24h || 0), 'ticket')} due within 24 hours.`)
  }
  if (Number(s.urgent_open_tickets || 0) > 0) {
    rationale.push(`Urgent ticket load is driving risk: ${plural(Number(s.urgent_open_tickets || 0), 'urgent open ticket')}.`)
  }
  if (unassigned > 0) {
    rationale.push(`Coverage is not fully locked: ${plural(unassigned, 'event')} unassigned inside the next ${horizonDays} days.`)
  }
  if (Number(s.walkthrough_issue_signals || 0) > 0) {
    rationale.push(`Recent walkthroughs show field risk: ${plural(Number(s.walkthrough_issue_signals || 0), 'issue signal')}.`)
  }
  if (Number(s.low_stock_items || 0) > 0) {
    rationale.push(`Parts risk may affect response time: ${plural(Number(s.low_stock_items || 0), 'low-stock item')}.`)
  }
  if (rationale.length === 0) {
    rationale.push('No single risk signal is spiking, so today starts with event readiness and routine ticket hygiene.')
  }

  const topActions: string[] = []
  if (Number(s.sla_due_24h || 0) > 0) topActions.push(`Handle ${s.sla_due_24h} ticket${Number(s.sla_due_24h) === 1 ? '' : 's'} due within 24 hours.`)
  if (Number(s.urgent_open_tickets || 0) > 0) topActions.push(`Review ${s.urgent_open_tickets} urgent open ticket${Number(s.urgent_open_tickets) === 1 ? '' : 's'} and confirm ownership.`)
  if (unassigned > 0) topActions.push(`Review ${unassigned} unassigned event${unassigned === 1 ? '' : 's'} in the next ${horizonDays} days before assigning staff.`)
  if (Number(s.walkthrough_issue_signals || 0) > 0) topActions.push(`Convert walkthrough issue signals into tickets or follow-up notes where needed.`)
  if (Number(s.low_stock_items || 0) > 0) topActions.push(`Check low-stock parts against upcoming events and open tickets.`)
  if (topActions.length === 0) topActions.push('No major blockers found. Start with today\'s events and keep an eye on new tickets.')

  const lines = [
    '## Morning Command Center',
    `**Urgency:** ${urgency} (${priorityScore} risk points)`,
    `**Today:** ${s.events_today || 0} events, ${s.open_tickets || 0} open tickets, ${s.urgent_open_tickets || 0} urgent, ${s.sla_due_24h || 0} SLA due within 24 hours.`,
    `**Next ${horizonDays} days:** ${eventsHorizon} events, ${unassigned} unassigned, ${staffingCoverage}% staffing coverage.`,
    `**Signals:** ${s.walkthroughs_last_day || 0} walkthroughs in the last day, ${s.walkthrough_issue_signals || 0} walkthrough issue signals this week, ${s.low_stock_items || 0} low-stock items.`,
    `**Assistant/automation:** ${s.ai_users_last_7_days || 0} assistant users, ${s.ai_tool_runs_last_7_days || 0} tool runs, ${automationShare}% of new tickets came from portal/email/phone/voicemail in the last 7 days.`,
    '',
    '## Full Analysis',
    '- [Open Morning Command Center](/ai/morning-command-center)',
    '- Use the buttons there to turn this into a checklist, staffing plan, NocoDB doc, CRM note, Slack handoff, or client-safe update.',
    '',
    '## Why These Are The Priorities',
    ...rationale.map(reason => `- ${reason}`),
    '',
    '## Do First',
    ...topActions.slice(0, 5).map(action => `- ${action}`),
  ]

  if (ticketRisks.rows.length > 0) lines.push('', '## Ticket Risk', ...ticketRisks.rows.map(ticketLine))
  if (todaysEvents.rows.length > 0) lines.push('', '## Today\'s Events', ...todaysEvents.rows.map(eventLine))
  if (staffingGaps.rows.length > 0) lines.push('', '## Staffing Gaps', ...staffingGaps.rows.map(eventLine))
  if (venueRisks.rows.length > 0) lines.push('', '## Venue Risk', ...venueRisks.rows.map(venueLine))
  if (walkthroughIssues.rows.length > 0) lines.push('', '## Walkthrough Follow-Up', ...walkthroughIssues.rows.map(walkthroughLine))
  if (lowStock.rows.length > 0) {
    lines.push(
      '',
      '## Parts Watch',
      ...lowStock.rows.map(row => `- ${row.item_name}${row.venue_name ? ` @ ${row.venue_name}` : ''}: ${row.quantity || 0} on hand, low threshold ${row.threshold_low || 0}`)
    )
  }

  lines.push(
    '',
    '## Good Follow-Ups',
    '- "Recommend staffing for the unassigned events."',
    '- "Build a readiness checklist for the highest-risk venue or event."',
    '- "Draft a client-safe update for the highest priority ticket."',
    '- "Run venue health for the first risky venue."',
    '',
    '## Want This Turned Into Something?',
    '- NocoDB ops doc/canvas for the team to use during the day.',
    '- CRM note attached to an account or venue.',
    '- Slack-ready manager handoff.',
    '- Technician day plan.',
    '- Client-safe status update.'
  )

  return {
    urgency,
    risk_points: priorityScore,
    metrics: {
      ...s,
      horizon_days: horizonDays,
      staffing_coverage_percent: staffingCoverage,
      automated_ticket_percent_last_7_days: automationShare,
    },
    top_actions: topActions,
    rationale,
    publish_options: ['NocoDB ops doc/canvas', 'CRM note', 'Slack manager handoff', 'Technician day plan', 'Client-safe status update'],
    todays_events: todaysEvents.rows,
    staffing_gaps: staffingGaps.rows,
    ticket_risks: ticketRisks.rows,
    venue_risks: venueRisks.rows,
    walkthrough_issues: walkthroughIssues.rows,
    low_stock: lowStock.rows,
    link: '/ai/morning-command-center',
    text_summary: lines.join('\n'),
  }
}

const skill: Skill = {
  name: 'morning_command_center',
  description: 'Build a manager-ready morning command center: today priorities, events, staffing gaps, urgent tickets, venue risk, walkthrough issues, low stock, automation signals, and next actions.',
  category: 'Service Ops',
  icon: 'Sunrise',
  role: 'technician',
  parameters: {
    type: 'object',
    properties: {
      horizon_days: {
        type: 'integer',
        default: 7,
        description: 'How far ahead to look for staffing and event risk. Defaults to 7 days.',
      },
      max_items: {
        type: 'integer',
        default: 5,
        description: 'Maximum rows per section. Defaults to 5.',
      },
    },
  },
  async handler(args) {
    return buildMorningCommandCenter(args)
  },
}

export default skill
