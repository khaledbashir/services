export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venue_id')

    const params: any[] = []
    let whereClause = ''
    if (venueId) {
      params.push(venueId)
      whereClause = `
        WHERE c.id IN (
          SELECT cv.client_id
          FROM client_venues cv
          WHERE cv.venue_id = $1
        )
      `
    }

    const result = await query(
      `SELECT
         c.id,
         c.name,
         c.client_kind,
         c.sport,
         c.is_active,
         p.id as parent_client_id,
         p.name as parent_client_name,
         COUNT(DISTINCT cv.venue_id)::int as venue_count,
         COALESCE(array_remove(array_agg(DISTINCT cv.venue_id::text), NULL), '{}') as venue_ids,
         COALESCE(array_remove(array_agg(DISTINCT v.name), NULL), '{}') as venue_names,
         COUNT(DISTINCT CASE WHEN cs.enabled = true THEN st.id END)::int as active_service_count,
         COUNT(DISTINCT child.id)::int as subclient_count,
         COALESCE(ticket_stats.open_ticket_count, 0)::int as open_ticket_count,
         COALESCE(ticket_stats.urgent_ticket_count, 0)::int as urgent_ticket_count,
         COALESCE(event_stats.upcoming_event_count, 0)::int as upcoming_event_count,
         event_stats.next_event_date,
         event_stats.next_event_summary
       FROM clients c
       LEFT JOIN clients p ON p.id = c.parent_client_id
       LEFT JOIN client_venues cv ON cv.client_id = c.id
       LEFT JOIN venues v ON v.id = cv.venue_id
       LEFT JOIN client_services cs ON cs.client_id = c.id
       LEFT JOIN service_types st ON st.id = cs.service_type_id
       LEFT JOIN clients child ON child.parent_client_id = c.id
       LEFT JOIN LATERAL (
         SELECT
           COUNT(*)::int as open_ticket_count,
           COUNT(*) FILTER (WHERE t.priority IN ('critical', 'high'))::int as urgent_ticket_count
         FROM tickets t
         WHERE t.venue_id IN (
           SELECT cv2.venue_id FROM client_venues cv2 WHERE cv2.client_id = c.id
         )
           AND COALESCE(t.status, 'new') NOT IN ('closed', 'completed', 'resolved')
       ) ticket_stats ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           COUNT(DISTINCT e.id)::int as upcoming_event_count,
           TO_CHAR(MIN(e.event_date), 'YYYY-MM-DD') as next_event_date,
           (array_agg(e.summary ORDER BY e.event_date ASC, e.start_time ASC NULLS LAST))[1] as next_event_summary
         FROM events e
         WHERE (e.client_id = c.id OR e.venue_id IN (
           SELECT cv3.venue_id FROM client_venues cv3 WHERE cv3.client_id = c.id
         ))
           AND COALESCE(e.approval_status, 'approved') = 'approved'
           AND e.event_date >= CURRENT_DATE
       ) event_stats ON TRUE
       ${whereClause}
       GROUP BY c.id, p.id, p.name, ticket_stats.open_ticket_count, ticket_stats.urgent_ticket_count,
                event_stats.upcoming_event_count, event_stats.next_event_date, event_stats.next_event_summary
       ORDER BY c.name ASC`,
      params
    )

    return NextResponse.json({ clients: result.rows })
  } catch (err) {
    console.error('Error fetching clients:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const { name, parent_client_id, sport, client_kind, linked_venue_ids } = await request.json()
    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Client name is required' }, { status: 400 })
    }

    const result = await query(
      `INSERT INTO clients (name, parent_client_id, sport, client_kind)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [
        name.trim(),
        parent_client_id || null,
        sport?.trim() || null,
        client_kind === 'sub_client' ? 'sub_client' : 'client',
      ]
    )

    const clientId = result.rows[0].id
    if (Array.isArray(linked_venue_ids)) {
      for (let i = 0; i < linked_venue_ids.length; i++) {
        const venueId = linked_venue_ids[i]
        await query(
          `INSERT INTO client_venues (client_id, venue_id, relation_type)
           VALUES ($1, $2, $3)
           ON CONFLICT (client_id, venue_id) DO NOTHING`,
          [clientId, venueId, i === 0 ? 'primary' : 'secondary']
        )
      }
    }

    return NextResponse.json({ id: clientId })
  } catch (err) {
    console.error('Error creating client:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
