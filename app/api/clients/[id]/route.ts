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

    const [clientResult, venuesResult, servicesResult, allVenuesResult, subclientsResult] = await Promise.all([
      query(
        `SELECT c.*, p.name as parent_client_name
         FROM clients c
         LEFT JOIN clients p ON p.id = c.parent_client_id
         WHERE c.id = $1`,
        [clientId]
      ),
      query(
        `SELECT v.id, v.name, cv.relation_type
         FROM client_venues cv
         JOIN venues v ON v.id = cv.venue_id
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
