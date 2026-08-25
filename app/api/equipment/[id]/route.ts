export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { logVenueChange, changedFields } from '@/lib/venue-audit'
import { softwareStatus } from '@/lib/venue-reference'

/** One catalog record, with everywhere it is installed and everything known about it. */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const eq = await query(`SELECT * FROM equipment WHERE id = $1`, [params.id])
    if (eq.rows.length === 0) {
      return NextResponse.json({ error: 'Equipment not found' }, { status: 404 })
    }
    const equipment = eq.rows[0]

    const [installs, issues, documents] = await Promise.all([
      query(
        `SELECT ve.*, v.name AS venue_name
           FROM venue_equipment ve
           JOIN venues v ON v.id = ve.venue_id
          WHERE ve.equipment_id = $1
          ORDER BY v.name, ve.label`,
        [params.id],
      ),
      query(
        `SELECT ei.*, s.full_name AS created_by_name
           FROM equipment_issues ei
           LEFT JOIN staff s ON s.id = ei.created_by
          WHERE ei.equipment_id = $1
          ORDER BY ei.created_at DESC`,
        [params.id],
      ),
      query(
        `SELECT * FROM venue_documents
          WHERE equipment_id = $1 AND is_archived = false
          ORDER BY created_at DESC`,
        [params.id],
      ),
    ])

    // The version comparison is the reason this page is useful: it says which
    // of the installed units are behind the version this model should be on.
    const rows = installs.rows.map((r: any) => ({
      ...r,
      software_status: softwareStatus(r.installed_version, equipment.latest_version),
    }))

    return NextResponse.json({
      equipment,
      installs: rows,
      behind: rows.filter((r: any) => r.software_status === 'update_available').length,
      issues: issues.rows,
      documents: documents.rows,
    })
  } catch (err) {
    console.error('Error fetching equipment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const EDITABLE = [
  'category', 'manufacturer', 'model', 'description', 'manual_url',
  'training_video_url', 'latest_version', 'latest_version_note', 'notes', 'is_active',
]

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json().catch(() => ({}))
    const before = await query(`SELECT * FROM equipment WHERE id = $1`, [params.id])
    if (before.rows.length === 0) {
      return NextResponse.json({ error: 'Equipment not found' }, { status: 404 })
    }

    const sets: string[] = []
    const values: any[] = []
    for (const field of EDITABLE) {
      if (!(field in body)) continue
      values.push(body[field] === '' ? null : body[field])
      sets.push(`${field} = $${values.length}`)
    }
    if (!sets.length) return NextResponse.json({ equipment: before.rows[0] })

    // Publishing a new target version is the event every Software tab reads,
    // so it carries its own timestamp rather than borrowing updated_at.
    if ('latest_version' in body && body.latest_version !== before.rows[0].latest_version) {
      sets.push(`latest_version_updated_at = NOW()`)
    }
    sets.push(`updated_at = NOW()`)
    values.push(params.id)

    const result = await query(
      `UPDATE equipment SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    )
    const diff = changedFields(before.rows[0], body, EDITABLE)
    if (Object.keys(diff).length) {
      await logVenueChange('equipment', params.id, 'equipment_updated', auth.userId, diff)
    }
    return NextResponse.json({ equipment: result.rows[0] })
  } catch (err) {
    console.error('Error updating equipment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireRole(_request, 'admin')
    if (isAuthError(auth)) return auth

    // Retired, not deleted. Installed units point at this record and a hard
    // delete would blank the make and model on every rack that has one.
    const result = await query(
      `UPDATE equipment SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [params.id],
    )
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Equipment not found' }, { status: 404 })
    }
    await logVenueChange('equipment', params.id, 'equipment_retired', auth.userId, {})
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error retiring equipment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
