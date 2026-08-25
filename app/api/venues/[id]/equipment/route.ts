export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { logVenueChange } from '@/lib/venue-audit'
import { softwareStatus } from '@/lib/venue-reference'

/**
 * The gear installed at one venue — the Hardware tab, and the Software tab
 * reading the same rows against each model's published version.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const result = await query(
      `SELECT ve.*,
              e.manufacturer, e.model, e.category, e.manual_url, e.training_video_url,
              e.latest_version, e.latest_version_note,
              s.full_name AS updated_by_name,
              (SELECT COUNT(*)::int FROM equipment_issues ei WHERE ei.equipment_id = e.id) AS known_issue_count
         FROM venue_equipment ve
         LEFT JOIN equipment e ON e.id = ve.equipment_id
         LEFT JOIN staff s ON s.id = ve.updated_by
        WHERE ve.venue_id = $1
        ORDER BY COALESCE(ve.rack_name, ''), ve.label`,
      [params.id],
    )

    const equipment = result.rows.map((r: any) => ({
      ...r,
      software_status: softwareStatus(r.installed_version, r.latest_version),
    }))

    return NextResponse.json({
      equipment,
      counts: {
        total: equipment.length,
        behind: equipment.filter((e: any) => e.software_status === 'update_available').length,
        unknown_version: equipment.filter((e: any) => e.software_status === 'unknown').length,
        unlinked: equipment.filter((e: any) => !e.equipment_id).length,
      },
    })
  } catch (err) {
    console.error('Error fetching venue equipment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json().catch(() => ({}))
    const label = String(body.label || '').trim()
    if (!label) {
      return NextResponse.json({ error: 'label is required' }, { status: 400 })
    }

    // A tech can name the make and model instead of hunting the catalog first;
    // the record is created or reused behind the scenes. Blocking the save on
    // "go add it to the library first" is how equipment lists stay empty.
    let equipmentId: string | null = body.equipment_id || null
    const manufacturer = String(body.manufacturer || '').trim()
    const model = String(body.model || '').trim()
    if (!equipmentId && manufacturer && model) {
      const found = await query(
        `SELECT id FROM equipment WHERE lower(manufacturer) = lower($1) AND lower(model) = lower($2)`,
        [manufacturer, model],
      )
      if (found.rows.length > 0) {
        equipmentId = found.rows[0].id
      } else {
        const created = await query(
          `INSERT INTO equipment (category, manufacturer, model, created_by)
           VALUES ($1,$2,$3,$4) RETURNING id`,
          [String(body.category || 'other'), manufacturer, model, auth.userId],
        )
        equipmentId = created.rows[0].id
        await logVenueChange('equipment', equipmentId!, 'equipment_created', auth.userId, {
          manufacturer, model, via: 'venue_equipment',
        })
      }
    }

    const result = await query(
      `INSERT INTO venue_equipment
         (venue_id, equipment_id, label, ip_address, serial_number, installed_version,
          firmware_version, rack_name, rack_position, location_note, install_date, status, notes, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        params.id,
        equipmentId,
        label,
        body.ip_address || null,
        body.serial_number || null,
        body.installed_version || null,
        body.firmware_version || null,
        body.rack_name || null,
        body.rack_position || null,
        body.location_note || null,
        body.install_date || null,
        String(body.status || 'active'),
        body.notes || null,
        auth.userId,
      ],
    )
    const row = result.rows[0]
    await logVenueChange('venue_equipment', row.id, 'equipment_added', auth.userId, {
      venue_id: params.id, label, equipment_id: equipmentId,
    })
    return NextResponse.json({ equipment: row })
  } catch (err) {
    console.error('Error adding venue equipment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
