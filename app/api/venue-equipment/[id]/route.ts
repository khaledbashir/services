export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { logVenueChange, changedFields } from '@/lib/venue-audit'

/**
 * One installed unit. Addressed by its own id rather than nested under the
 * venue, because a hotspot, a ticket close and the Nova map all reach for it
 * without knowing or caring which building it is in.
 */
const EDITABLE = [
  'equipment_id', 'label', 'ip_address', 'serial_number', 'installed_version',
  'firmware_version', 'rack_name', 'rack_position', 'location_note',
  'install_date', 'status', 'notes',
]

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const result = await query(
      `SELECT ve.*, e.manufacturer, e.model, e.category, e.manual_url,
              e.training_video_url, e.latest_version, v.name AS venue_name
         FROM venue_equipment ve
         LEFT JOIN equipment e ON e.id = ve.equipment_id
         JOIN venues v ON v.id = ve.venue_id
        WHERE ve.id = $1`,
      [params.id],
    )
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ equipment: result.rows[0] })
  } catch (err) {
    console.error('Error fetching venue equipment item:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json().catch(() => ({}))
    const before = await query(`SELECT * FROM venue_equipment WHERE id = $1`, [params.id])
    if (before.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const sets: string[] = []
    const values: any[] = []
    for (const field of EDITABLE) {
      if (!(field in body)) continue
      values.push(body[field] === '' ? null : body[field])
      sets.push(`${field} = $${values.length}`)
    }
    if (!sets.length) return NextResponse.json({ equipment: before.rows[0] })

    values.push(auth.userId)
    sets.push(`updated_by = $${values.length}`)
    sets.push(`updated_at = NOW()`)
    values.push(params.id)

    const result = await query(
      `UPDATE venue_equipment SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    )
    const diff = changedFields(before.rows[0], body, EDITABLE)
    if (Object.keys(diff).length) {
      await logVenueChange('venue_equipment', params.id, 'equipment_updated', auth.userId, {
        venue_id: before.rows[0].venue_id,
        label: before.rows[0].label,
        ...diff,
      })
    }
    return NextResponse.json({ equipment: result.rows[0] })
  } catch (err) {
    console.error('Error updating venue equipment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const before = await query(
      `SELECT venue_id, label FROM venue_equipment WHERE id = $1`, [params.id],
    )
    if (before.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    await query(`DELETE FROM venue_equipment WHERE id = $1`, [params.id])
    await logVenueChange('venue_equipment', params.id, 'equipment_removed', auth.userId, {
      venue_id: before.rows[0].venue_id, label: before.rows[0].label,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting venue equipment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
