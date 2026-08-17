import { query } from '@/lib/db'
import { SkillError, type Skill } from '@/lib/ai/types'

function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)))
}

function priorityRank(priority: unknown): number {
  const p = String(priority || '').toLowerCase()
  if (p === 'critical') return 1
  if (p === 'high') return 2
  if (p === 'medium') return 3
  return 4
}

async function resolveVenue(args: Record<string, unknown>) {
  const venueId = asText(args.venue_id)
  const venueName = asText(args.venue_name || args.q)

  if (venueId) {
    const byId = await query(
      `SELECT v.*, manager.full_name AS venue_manager_name, lead.full_name AS lead_field_rep_name
       FROM venues v
       LEFT JOIN staff manager ON manager.id = v.venue_manager_id
       LEFT JOIN staff lead ON lead.id = v.lead_field_rep_id
       WHERE v.id = $1`,
      [venueId]
    )
    if (byId.rows[0]) return byId.rows[0]
  }

  if (!venueName) {
    throw new SkillError('missing_venue', 'Tell me which venue to check.', 'Use a venue name, team alias, or venue_id.')
  }

  const byName = await query(
    `SELECT v.*, manager.full_name AS venue_manager_name, lead.full_name AS lead_field_rep_name
     FROM venues v
     LEFT JOIN staff manager ON manager.id = v.venue_manager_id
     LEFT JOIN staff lead ON lead.id = v.lead_field_rep_id
     WHERE v.name ILIKE $1
        OR COALESCE(v.address,'') ILIKE $1
        OR EXISTS (
          SELECT 1 FROM unnest(COALESCE(v.aliases, '{}'::text[])) AS alias
          WHERE alias ILIKE $1
        )
     ORDER BY
       CASE WHEN LOWER(v.name) = LOWER($2) THEN 0 ELSE 1 END,
       v.name ASC
     LIMIT 1`,
    [`%${venueName}%`, venueName]
  )

  if (!byName.rows[0]) {
    throw new SkillError('venue_not_found', `I could not find a venue matching "${venueName}".`, 'Try a venue name, city, team name, or alias.')
  }

  return byName.rows[0]
}

function ticketLine(row: Record<string, unknown>): string {
  const number = row.ticket_number ? `#${row.ticket_number}` : 'ticket'
  const title = String(row.title || 'Untitled ticket')
  const priority = row.priority ? `, ${row.priority}` : ''
  const age = row.age_days ? `, ${row.age_days}d old` : ''
  return `- ${number}: ${title}${priority}${age} - [open ->](/tickets/${row.id})`
}

function eventLine(row: Record<string, unknown>): string {
  const summary = String(row.summary || 'Untitled event')
  const when = [row.event_date, row.local_time].filter(Boolean).join(' ')
  const assigned = Number(row.assigned_count || 0)
  const staffing = assigned > 0 ? `${assigned} assigned` : 'unassigned'
  return `- ${summary}${when ? ` - ${when}` : ''} (${staffing}) - [open ->](/events/${row.id})`
}

function walkthroughLine(row: Record<string, unknown>): string {
  const result = row.result ? ` - ${row.result}` : ''
  const note = row.issues_found || row.notes ? `: ${String(row.issues_found || row.notes).slice(0, 110)}` : ''
  return `- ${row.log_date || 'recent'}${result}${note}`
}

const skill: Skill = {
  name: 'venue_health_report',
  description: 'Create a live venue health report with risk score, open tickets, upcoming events, staffing gaps, walkthrough issues, inventory risk, portal status, and next actions.',
  category: 'Venues',
  icon: 'Activity',
  role: 'technician',
  parameters: {
    type: 'object',
    properties: {
      venue_id: { type: 'string', description: 'Dashboard venue UUID. Optional if venue_name is provided.' },
      venue_name: { type: 'string', description: 'Venue name, city, or team alias such as Flyers, Sixers, Prudential, or Fenway.' },
      days: { type: 'integer', default: 14, description: 'Upcoming window in days. Defaults to 14.' },
    },
  },
  async handler(args) {
    const venue = await resolveVenue(args)
    const venueId = String(venue.id)
    const days = Math.max(1, Math.min(Number(args.days) || 14, 60))

    const [tickets, events, walkthroughs, lowStock, portal, linkedStaff] = await Promise.all([
      query(
        `SELECT t.id, t.ticket_number, t.title, t.priority, t.status,
                DATE_PART('day', NOW() - t.created_at)::int AS age_days
         FROM tickets t
         WHERE t.venue_id = $1
           AND COALESCE(LOWER(t.status), 'open') NOT IN ('closed','resolved','done','cancelled')
         ORDER BY
           CASE LOWER(COALESCE(t.priority,'')) WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
           t.created_at ASC
         LIMIT 8`,
        [venueId]
      ),
      query(
        `SELECT e.id, e.summary,
                TO_CHAR(e.event_date,'YYYY-MM-DD') AS event_date,
                TO_CHAR(e.start_time AT TIME ZONE COALESCE(v.timezone,'America/New_York'),'HH12:MI AM') AS local_time,
                e.status, e.workflow_status,
                (SELECT COUNT(*) FROM event_assignments ea WHERE ea.event_id = e.id)::int AS assigned_count
         FROM events e
         LEFT JOIN venues v ON v.id = e.venue_id
         WHERE COALESCE(e.approval_status, 'approved') = 'approved'
           AND e.venue_id = $1
           AND e.event_date >= CURRENT_DATE
           AND e.event_date < CURRENT_DATE + ($2::int * INTERVAL '1 day')
         ORDER BY e.start_time ASC
         LIMIT 8`,
        [venueId, days]
      ),
      query(
        `SELECT id, TO_CHAR(log_date,'YYYY-MM-DD') AS log_date, result, issues_found, notes
         FROM walkthrough_logs
         WHERE venue_id = $1
           AND log_date >= CURRENT_DATE - INTERVAL '30 days'
         ORDER BY log_date DESC, created_at DESC
         LIMIT 6`,
        [venueId]
      ),
      query(
        `SELECT id, COALESCE(part_name, item_name, model_name, 'Inventory item') AS item_name,
                quantity, threshold_low
         FROM inventory
         WHERE venue_id = $1
           AND COALESCE(quantity,0) <= COALESCE(threshold_low,0)
         ORDER BY COALESCE(quantity,0) ASC, item_name ASC
         LIMIT 6`,
        [venueId]
      ),
      query(
        `SELECT id, token, expires_at, last_viewed_at, view_count
         FROM client_portals
         WHERE dashboard_venue_id = $1
           AND revoked_at IS NULL
           AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY created_at DESC
         LIMIT 1`,
        [venueId]
      ),
      query(
        `SELECT s.id, s.full_name, s.role, s.title
         FROM staff_venues sv
         JOIN staff s ON s.id = sv.staff_id
         WHERE sv.venue_id = $1 AND COALESCE(s.is_active,true)=true
         ORDER BY s.role, s.full_name
         LIMIT 8`,
        [venueId]
      ),
    ])

    const openTickets = tickets.rows.length
    const urgentTickets = tickets.rows.filter(t => priorityRank(t.priority) <= 2).length
    const unassignedEvents = events.rows.filter(e => Number(e.assigned_count || 0) === 0).length
    const walkthroughIssues = walkthroughs.rows.filter(w => {
      const text = `${w.result || ''} ${w.issues_found || ''} ${w.notes || ''}`.toLowerCase()
      return /issue|fail|broken|down|follow|repair|problem|new/.test(text)
    }).length
    const lowStockCount = lowStock.rows.length
    const portalLive = portal.rows.length > 0
    const feedRisk = venue.feed_url && String(venue.last_feed_sync_status || '').toLowerCase().includes('fail')

    const score = clampScore(
      100
      - urgentTickets * 15
      - Math.max(0, openTickets - urgentTickets) * 5
      - unassignedEvents * 10
      - walkthroughIssues * 8
      - lowStockCount * 5
      - (feedRisk ? 5 : 0)
      - (portalLive ? 0 : 3)
    )
    const level = score >= 85 ? 'Healthy' : score >= 70 ? 'Watch' : score >= 50 ? 'At Risk' : 'Critical'

    const nextActions: string[] = []
    if (urgentTickets > 0) nextActions.push('Review urgent tickets first and confirm owner/next response.')
    if (unassignedEvents > 0) nextActions.push('Use staffing recommendations before assigning upcoming event coverage.')
    if (walkthroughIssues > 0) nextActions.push('Review recent walkthrough issues for ticket follow-up.')
    if (lowStockCount > 0) nextActions.push('Check low-stock parts before the next event window.')
    if (!portalLive) nextActions.push('Create or refresh the client portal link if this client expects external visibility.')
    if (nextActions.length === 0) nextActions.push('No major risks found. Keep monitoring upcoming event coverage and ticket age.')

    const lines = [
      `## ${venue.name} Health Report`,
      `**Score:** ${score}/100 (${level}) - [open venue ->](/venues/${venue.id})`,
      `**Signals:** ${openTickets} open tickets (${urgentTickets} urgent), ${events.rows.length} upcoming events in ${days} days, ${unassignedEvents} unassigned, ${walkthroughIssues} walkthrough issue signals, ${lowStockCount} low-stock items.`,
      `**Coverage:** ${linkedStaff.rows.length} linked staff${venue.lead_field_rep_name ? `, lead: ${venue.lead_field_rep_name}` : ''}${venue.venue_manager_name ? `, manager: ${venue.venue_manager_name}` : ''}.`,
      `**Client portal:** ${portalLive ? `active (${portal.rows[0].view_count || 0} views)` : 'no active portal link found'}.`,
    ]

    if (venue.aliases?.length) lines.push(`**Aliases:** ${venue.aliases.join(', ')}.`)
    if (tickets.rows.length) lines.push('', '## Tickets To Watch', ...tickets.rows.map(ticketLine))
    if (events.rows.length) lines.push('', '## Upcoming Events', ...events.rows.map(eventLine))
    if (walkthroughs.rows.length) lines.push('', '## Recent Walkthrough Signals', ...walkthroughs.rows.map(walkthroughLine))
    if (lowStock.rows.length) {
      lines.push(
        '',
        '## Inventory Risk',
        ...lowStock.rows.map(item => `- ${item.item_name}: ${item.quantity || 0} on hand, low threshold ${item.threshold_low || 0}`)
      )
    }
    lines.push('', '## Recommended Next Actions', ...nextActions.map(action => `- ${action}`))

    return {
      venue,
      score,
      level,
      metrics: {
        open_tickets: openTickets,
        urgent_tickets: urgentTickets,
        upcoming_events: events.rows.length,
        unassigned_events: unassignedEvents,
        walkthrough_issue_signals: walkthroughIssues,
        low_stock_items: lowStockCount,
        client_portal_active: portalLive,
      },
      tickets: tickets.rows,
      events: events.rows,
      walkthroughs: walkthroughs.rows,
      low_stock: lowStock.rows,
      recommended_next_actions: nextActions,
      text_summary: lines.join('\n'),
    }
  },
}

export default skill
