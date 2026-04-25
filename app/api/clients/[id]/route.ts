import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clientId = params.id

    const [clientResult, venuesResult, servicesResult, allVenuesResult, subclientsResult, ticketsResult, eventsResult, statsResult, activityResult] = await Promise.all([
      query(
        `SELECT c.*, p.name as parent_client_name
         FROM clients c
         LEFT JOIN clients p ON p.id = c.parent_client_id
         WHERE c.id = $1`,
        [clientId]
      ),
      query(
        `SELECT
           v.id,
           v.name,
           cv.relation_type,
           m.name as market,
           COALESCE(v.is_active, true) as is_active,
           v.portal_token,
           v.primary_contact_name,
           v.primary_contact_email,
           COALESCE(ticket_stats.open_ticket_count, 0)::int as open_ticket_count,
           COALESCE(event_stats.upcoming_event_count, 0)::int as upcoming_event_count
         FROM client_venues cv
         JOIN venues v ON v.id = cv.venue_id
         LEFT JOIN markets m ON m.id = v.market_id
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int as open_ticket_count
           FROM tickets t
           WHERE t.venue_id = v.id
             AND COALESCE(t.status, 'new') NOT IN ('closed', 'completed', 'resolved')
         ) ticket_stats ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int as upcoming_event_count
           FROM events e
           WHERE e.venue_id = v.id
             AND e.event_date >= CURRENT_DATE
         ) event_stats ON TRUE
         WHERE cv.client_id = $1
         ORDER BY CASE WHEN cv.relation_type = 'primary' THEN 0 ELSE 1 END, v.name ASC`,
        [clientId]
      ),
      query(
        `SELECT st.id as service_type_id, st.name, st.description, COALESCE(cs.enabled, false) as enabled
         FROM service_types st
         LEFT JOIN client_services cs ON cs.service_type_id = st.id AND cs.client_id = $1
         ORDER BY st.name`,
        [clientId]
      ),
      query(`SELECT id, name FROM venues WHERE COALESCE(is_active, true) = true ORDER BY name ASC`),
      query(
        `SELECT id, name, sport
         FROM clients
         WHERE parent_client_id = $1
         ORDER BY name ASC`,
        [clientId]
      ),
      query(
        `SELECT
           t.id,
           t.ticket_number,
           t.title,
           t.status,
           t.priority,
           t.category,
           COALESCE(t.source, 'web') as source,
           v.name as venue_name,
           TO_CHAR(t.created_at AT TIME ZONE 'America/New_York', 'Mon DD') as created_date
         FROM tickets t
         JOIN client_venues cv ON cv.venue_id = t.venue_id AND cv.client_id = $1
         LEFT JOIN venues v ON v.id = t.venue_id
         WHERE COALESCE(t.status, 'new') NOT IN ('closed', 'completed', 'resolved')
         ORDER BY
           CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
           t.created_at DESC
         LIMIT 6`,
        [clientId]
      ),
      query(
        `SELECT
           e.id,
           e.summary,
           e.league,
           v.name as venue_name,
           TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date,
           TO_CHAR(e.start_time AT TIME ZONE COALESCE(v.timezone, 'America/New_York'), 'HH12:MI AM') as start_time,
           COALESCE(e.workflow_status, 'pending') as workflow_status,
           COALESCE(e.requires_staffing, false) as event_requires_staffing,
           COUNT(ea.id)::int as assigned_count
         FROM events e
         LEFT JOIN venues v ON v.id = e.venue_id
         LEFT JOIN event_assignments ea ON ea.event_id = e.id
         WHERE (e.client_id = $1 OR e.venue_id IN (
           SELECT venue_id FROM client_venues WHERE client_id = $1
         ))
           AND e.event_date >= CURRENT_DATE
         GROUP BY e.id, v.name, v.timezone
         ORDER BY e.event_date ASC, e.start_time ASC NULLS LAST
         LIMIT 6`,
        [clientId]
      ),
      query(
        `SELECT
           COUNT(DISTINCT CASE WHEN COALESCE(t.status, 'new') NOT IN ('closed', 'completed', 'resolved') THEN t.id END)::int as open_ticket_count,
           COUNT(DISTINCT CASE WHEN COALESCE(t.status, 'new') NOT IN ('closed', 'completed', 'resolved') AND t.priority IN ('critical', 'high') THEN t.id END)::int as urgent_ticket_count,
           COUNT(DISTINCT CASE WHEN e.event_date >= CURRENT_DATE THEN e.id END)::int as upcoming_event_count,
           COUNT(DISTINCT CASE WHEN cp.revoked_at IS NULL THEN cp.id END)::int as portal_link_count,
           COUNT(DISTINCT CASE WHEN COALESCE(v.primary_contact_email, '') = '' THEN v.id END)::int as missing_contact_count
         FROM clients c
         LEFT JOIN client_venues cv ON cv.client_id = c.id
         LEFT JOIN venues v ON v.id = cv.venue_id
         LEFT JOIN tickets t ON t.venue_id = v.id
         LEFT JOIN events e ON e.venue_id = v.id OR e.client_id = c.id
         LEFT JOIN client_portals cp ON cp.dashboard_venue_id = v.id
         WHERE c.id = $1`,
        [clientId]
      ),
      query(
        `SELECT
           activity_type,
           entity_id,
           title,
           context,
           meta,
           href,
           TO_CHAR(occurred_at AT TIME ZONE 'America/New_York', 'Mon DD, HH12:MI AM') as occurred_date
         FROM (
           SELECT
             'ticket'::text as activity_type,
             t.id::text as entity_id,
             t.title,
             v.name as context,
             COALESCE(t.status, 'new') as meta,
             '/tickets/' || t.id::text as href,
             t.updated_at as occurred_at
           FROM tickets t
           JOIN client_venues cv ON cv.venue_id = t.venue_id AND cv.client_id = $1
           LEFT JOIN venues v ON v.id = t.venue_id

           UNION ALL

           SELECT
             'event'::text as activity_type,
             e.id::text as entity_id,
             e.summary as title,
             v.name as context,
             COALESCE(e.workflow_status, 'pending') as meta,
             '/events/' || e.id::text as href,
             e.event_date::timestamp as occurred_at
           FROM events e
           LEFT JOIN venues v ON v.id = e.venue_id
           WHERE e.client_id = $1
              OR e.venue_id IN (SELECT venue_id FROM client_venues WHERE client_id = $1)
         ) activity
         ORDER BY occurred_at DESC
         LIMIT 10`,
        [clientId]
      ),
    ])

    if (!clientResult.rows.length) {
      return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    }

    return NextResponse.json({
      client: clientResult.rows[0],
      linkedVenues: venuesResult.rows,
      clientServices: servicesResult.rows,
      availableVenues: allVenuesResult.rows,
      subclients: subclientsResult.rows,
      supportTickets: ticketsResult.rows,
      upcomingEvents: eventsResult.rows,
      accountStats: statsResult.rows[0] || {
        open_ticket_count: 0,
        urgent_ticket_count: 0,
        upcoming_event_count: 0,
        portal_link_count: 0,
        missing_contact_count: 0,
      },
      recentActivity: activityResult.rows,
    })
  } catch (err) {
    console.error('Error fetching client detail:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const clientId = params.id
    const body = await request.json()

    if (body.name !== undefined) {
      await query(`UPDATE clients SET name = $1, updated_at = NOW() WHERE id = $2`, [body.name, clientId])
    }
    if (body.sport !== undefined) {
      await query(`UPDATE clients SET sport = $1, updated_at = NOW() WHERE id = $2`, [body.sport || null, clientId])
    }
    if (body.parent_client_id !== undefined) {
      await query(`UPDATE clients SET parent_client_id = $1, updated_at = NOW() WHERE id = $2`, [body.parent_client_id || null, clientId])
    }
    if (body.is_active !== undefined) {
      await query(`UPDATE clients SET is_active = $1, updated_at = NOW() WHERE id = $2`, [Boolean(body.is_active), clientId])
    }
    if (body.service_type_id !== undefined) {
      await query(
        `INSERT INTO client_services (client_id, service_type_id, enabled)
         VALUES ($1, $2, $3)
         ON CONFLICT (client_id, service_type_id)
         DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()`,
        [clientId, body.service_type_id, Boolean(body.enabled)]
      )
    }
    if (body.linked_venue_ids !== undefined && Array.isArray(body.linked_venue_ids)) {
      await query(`DELETE FROM client_venues WHERE client_id = $1`, [clientId])
      for (let i = 0; i < body.linked_venue_ids.length; i++) {
        const venueId = body.linked_venue_ids[i]
        await query(
          `INSERT INTO client_venues (client_id, venue_id, relation_type)
           VALUES ($1, $2, $3)
           ON CONFLICT (client_id, venue_id)
           DO UPDATE SET relation_type = EXCLUDED.relation_type`,
          [clientId, venueId, i === 0 ? 'primary' : 'secondary']
        )
      }
    }

    return GET(request, { params })
  } catch (err) {
    console.error('Error updating client:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
