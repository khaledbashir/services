export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    const venueIds = user ? await getStaffVenueIds(user.userId, user.role) : null
    const vfEvent = buildVenueFilterClause(venueIds, 'e.venue_id', 1)
    const vfTicket = buildVenueFilterClause(venueIds, 't.venue_id', 1)

    let wfWhere = ''
    if (vfEvent.clause) wfWhere = 'WHERE ' + vfEvent.clause.replace(/^AND /, '')
    let tkWhere = ''
    if (vfTicket.clause) tkWhere = 'WHERE ' + vfTicket.clause.replace(/^AND /, '')
    let logWhere = ''
    let logParams: string[] = []
    if (venueIds !== null) {
      if (venueIds.length === 0) {
        logWhere = 'WHERE FALSE'
      } else {
        const placeholders = venueIds.map((_, index) => `$${index + 1}`).join(', ')
        logWhere = `WHERE (ticket_entity.venue_id IN (${placeholders}) OR event_entity.venue_id IN (${placeholders}))`
        logParams = venueIds
      }
    }

    // Workflow activity
    const workflowResult = await query(
      `SELECT
        'workflow' as source,
        ws.type,
        ws.submitted_at as created_at,
        COALESCE(s.full_name, 'System') as staff_name,
        e.summary as entity_name,
        v.name as venue_name
      FROM workflow_submissions ws
      JOIN staff s ON ws.staff_id = s.id
      JOIN events e ON ws.event_id = e.id
      LEFT JOIN venues v ON e.venue_id = v.id
      ${wfWhere}
      ORDER BY ws.submitted_at DESC
      LIMIT 15`,
      [...vfEvent.params]
    )

    // Ticket creation
    const ticketResult = await query(
      `SELECT
        'ticket' as source,
        'ticket_created' as type,
        t.created_at,
        COALESCE(s.full_name, t.contact_name, t.contact_email, 'System') as staff_name,
        CONCAT('#', LPAD(t.ticket_number::text, 8, '0'), ' · ', t.title) as entity_name,
        v.name as venue_name,
        t.id as entity_id,
        t.priority as priority
      FROM tickets t
      LEFT JOIN staff s ON t.created_by = s.id
      LEFT JOIN venues v ON t.venue_id = v.id
      ${tkWhere}
      ORDER BY t.created_at DESC
      LIMIT 10`,
      [...vfTicket.params]
    )

    // Ticket comments
    const commentResult = await query(
      `SELECT
        'comment' as source,
        CASE WHEN tc.is_internal THEN 'internal_comment' ELSE 'external_comment' END as type,
        tc.created_at,
        COALESCE(s.full_name, NULLIF(tc.author_name, ''), t.contact_name, t.contact_email, 'External customer') as staff_name,
        CONCAT('#', LPAD(t.ticket_number::text, 8, '0'), ' · ', t.title) as entity_name,
        v.name as venue_name,
        t.id as entity_id
      FROM ticket_comments tc
      LEFT JOIN staff s ON tc.author_id = s.id
      JOIN tickets t ON tc.ticket_id = t.id
      LEFT JOIN venues v ON t.venue_id = v.id
      ${tkWhere.replace('t.venue_id', 't.venue_id')}
      ORDER BY tc.created_at DESC
      LIMIT 10`,
      [...vfTicket.params]
    )

    // Activity log (status changes, assignments, etc.)
    const logResult = await query(
      `SELECT 
        'log' as source,
        al.action as type,
        al.created_at,
        COALESCE(s.full_name, 'System') as staff_name,
        COALESCE(
          NULLIF(al.details->>'entity_name', ''),
          CASE
            WHEN ticket_entity.id IS NOT NULL
              THEN CONCAT('#', LPAD(ticket_entity.ticket_number::text, 8, '0'), ' · ', ticket_entity.title)
            ELSE event_entity.summary
          END
        ) as entity_name,
        COALESCE(
          NULLIF(al.details->>'venue_name', ''),
          ticket_venue.name,
          event_venue.name
        ) as venue_name,
        al.details
      FROM activity_log al
      LEFT JOIN staff s ON al.staff_id = s.id
      LEFT JOIN tickets ticket_entity
        ON al.entity_type = 'ticket' AND al.entity_id = ticket_entity.id
      LEFT JOIN venues ticket_venue ON ticket_entity.venue_id = ticket_venue.id
      LEFT JOIN events event_entity
        ON al.entity_type = 'event' AND al.entity_id = event_entity.id
      LEFT JOIN venues event_venue ON event_entity.venue_id = event_venue.id
      ${logWhere}
      ORDER BY al.created_at DESC
      LIMIT 10`,
      logParams
    )

    // Merge all, sort, take top 15
    const all = [
      ...workflowResult.rows,
      ...ticketResult.rows,
      ...commentResult.rows,
      ...logResult.rows,
    ]
    const sorted = all.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 15)

    const typeMap: Record<string, string> = {
      'check_in': 'checked in at',
      'game_ready': 'confirmed game ready at',
      'post_game_report': 'submitted post-game report for',
      'ticket_created': 'created ticket',
      'internal_comment': 'added internal comment on',
      'external_comment': 'added comment on',
      'ticket_status_change': 'changed ticket status on',
      'ticket_assigned': 'assigned ticket',
      'ticket_priority_change': 'changed ticket priority on',
      'ticket_category_change': 'changed ticket category on',
      'tech_assigned': 'was assigned to',
      'tech_removed': 'was removed from',
    }

    const activity = sorted.map(item => {
      // Ensure created_at is a proper ISO string
      const createdAtDate = new Date(item.created_at)
      const isoTimestamp = createdAtDate.toISOString()
      
      return {
        ...item,
        created_at: isoTimestamp,
        type_display: typeMap[item.type] || item.type,
      }
    })

    return NextResponse.json(activity)
  } catch (err) {
    console.error('Error fetching activity:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
