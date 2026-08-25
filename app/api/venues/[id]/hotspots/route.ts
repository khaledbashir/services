export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { logVenueChange } from '@/lib/venue-audit'
import { softwareStatus } from '@/lib/venue-reference'

/**
 * Rack-photo hotspots — the rectangles that keep the picture connected to
 * live data. Clicking one returns the unit's address, serial, manual, training
 * video and known faults, so the photo stops being just a photo.
 *
 * Coordinates are percentages of the rendered image rather than pixels: the
 * same rack has to be tappable on a phone in a tunnel and on a desk monitor.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const documentId = request.nextUrl.searchParams.get('document_id')
    const values: any[] = [params.id]
    let clause = 'rh.venue_id = $1'
    if (documentId) {
      values.push(documentId)
      clause += ` AND rh.document_id = $${values.length}`
    }

    const result = await query(
      `SELECT rh.*,
              ve.label, ve.ip_address, ve.serial_number, ve.installed_version,
              ve.rack_position, ve.status AS equipment_status,
              e.manufacturer, e.model, e.manual_url, e.training_video_url, e.latest_version,
              (SELECT COUNT(*)::int FROM equipment_issues ei WHERE ei.equipment_id = e.id) AS known_issue_count
         FROM rack_hotspots rh
         LEFT JOIN venue_equipment ve ON ve.id = rh.venue_equipment_id
         LEFT JOIN equipment e ON e.id = ve.equipment_id
        WHERE ${clause}
        ORDER BY rh.created_at`,
      values,
    )

    return NextResponse.json({
      hotspots: result.rows.map((r: any) => ({
        ...r,
        software_status: softwareStatus(r.installed_version, r.latest_version),
      })),
    })
  } catch (err) {
    console.error('Error fetching hotspots:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const pct = (v: unknown): number | null => {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  // Anything outside the image is a drag that escaped the frame; clamping
  // keeps the marker reachable instead of parking it off-screen forever.
  return Math.min(100, Math.max(0, n))
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json().catch(() => ({}))
    const documentId = String(body.document_id || '')
    if (!documentId) return NextResponse.json({ error: 'document_id is required' }, { status: 400 })

    const x = pct(body.x), y = pct(body.y), w = pct(body.w), h = pct(body.h)
    if (x === null || y === null || w === null || h === null) {
      return NextResponse.json({ error: 'x, y, w and h are required' }, { status: 400 })
    }
    if (w <= 0 || h <= 0) {
      return NextResponse.json({ error: 'A hotspot needs a width and a height' }, { status: 400 })
    }

    const result = await query(
      `INSERT INTO rack_hotspots (venue_id, document_id, venue_equipment_id, label, x, y, w, h, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [params.id, documentId, body.venue_equipment_id || null, body.label || null, x, y, w, h, auth.userId],
    )
    await logVenueChange('venue', params.id, 'hotspot_added', auth.userId, {
      document_id: documentId, venue_equipment_id: body.venue_equipment_id || null,
    })
    return NextResponse.json({ hotspot: result.rows[0] })
  } catch (err) {
    console.error('Error creating hotspot:', err)
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

    const { hotspot_id } = await request.json().catch(() => ({ hotspot_id: null }))
    if (!hotspot_id) return NextResponse.json({ error: 'hotspot_id required' }, { status: 400 })

    await query(`DELETE FROM rack_hotspots WHERE id = $1 AND venue_id = $2`, [hotspot_id, params.id])
    await logVenueChange('venue', params.id, 'hotspot_removed', auth.userId, { hotspot_id })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting hotspot:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
