export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { logVenueChange } from '@/lib/venue-audit'

/**
 * Venue-specific quirks — the half of Common Issues that belongs to the
 * building rather than the gear (Steve's example: Fenway's header-row issue).
 *
 * The hardware-generic half lives on the equipment record and reaches this
 * venue through whatever is installed here, so the same fault is written once
 * and read everywhere it applies.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const [venueIssues, hardwareIssues] = await Promise.all([
      query(
        `SELECT vi.*, s.full_name AS created_by_name, ve.label AS equipment_label
           FROM venue_issues vi
           LEFT JOIN staff s ON s.id = vi.created_by
           LEFT JOIN venue_equipment ve ON ve.id = vi.venue_equipment_id
          WHERE vi.venue_id = $1
          ORDER BY vi.created_at DESC`,
        [params.id],
      ),
      // Faults attached to models this venue actually has installed.
      query(
        `SELECT DISTINCT ei.*, e.manufacturer, e.model
           FROM equipment_issues ei
           JOIN equipment e ON e.id = ei.equipment_id
           JOIN venue_equipment ve ON ve.equipment_id = e.id
          WHERE ve.venue_id = $1
          ORDER BY e.manufacturer, e.model, ei.created_at DESC`,
        [params.id],
      ),
    ])
    return NextResponse.json({
      venue_issues: venueIssues.rows,
      hardware_issues: hardwareIssues.rows,
    })
  } catch (err) {
    console.error('Error fetching venue issues:', err)
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
    const title = String(body.title || '').trim()
    if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

    const result = await query(
      `INSERT INTO venue_issues (venue_id, venue_equipment_id, title, symptom, resolution, source_ticket_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        params.id,
        body.venue_equipment_id || null,
        title,
        body.symptom || null,
        body.resolution || null,
        body.source_ticket_id || null,
        auth.userId,
      ],
    )
    await logVenueChange('venue_issue', result.rows[0].id, 'issue_added', auth.userId, {
      venue_id: params.id, title,
    })
    return NextResponse.json({ issue: result.rows[0] })
  } catch (err) {
    console.error('Error creating venue issue:', err)
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
    const issueId = String(body.issue_id || '')
    if (!issueId) return NextResponse.json({ error: 'issue_id required' }, { status: 400 })

    const result = await query(
      `UPDATE venue_issues
          SET title = COALESCE($1, title),
              symptom = COALESCE($2, symptom),
              resolution = COALESCE($3, resolution),
              updated_at = NOW()
        WHERE id = $4 AND venue_id = $5
        RETURNING *`,
      [body.title || null, body.symptom || null, body.resolution || null, issueId, params.id],
    )
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }
    await logVenueChange('venue_issue', issueId, 'issue_updated', auth.userId, { venue_id: params.id })
    return NextResponse.json({ issue: result.rows[0] })
  } catch (err) {
    console.error('Error updating venue issue:', err)
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

    const { issue_id } = await request.json().catch(() => ({ issue_id: null }))
    if (!issue_id) return NextResponse.json({ error: 'issue_id required' }, { status: 400 })

    await query(`DELETE FROM venue_issues WHERE id = $1 AND venue_id = $2`, [issue_id, params.id])
    await logVenueChange('venue_issue', issue_id, 'issue_removed', auth.userId, { venue_id: params.id })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting venue issue:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
