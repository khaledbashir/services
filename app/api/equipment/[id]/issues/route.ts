export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { logVenueChange } from '@/lib/venue-audit'

/**
 * Faults that belong to a piece of gear rather than a building — written once
 * on the model, read at every venue running it.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const result = await query(
      `SELECT ei.*, s.full_name AS created_by_name
         FROM equipment_issues ei
         LEFT JOIN staff s ON s.id = ei.created_by
        WHERE ei.equipment_id = $1
        ORDER BY ei.created_at DESC`,
      [params.id],
    )
    return NextResponse.json({ issues: result.rows })
  } catch (err) {
    console.error('Error fetching equipment issues:', err)
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
      `INSERT INTO equipment_issues (equipment_id, title, symptom, resolution, source_ticket_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        params.id,
        title,
        body.symptom || null,
        body.resolution || null,
        body.source_ticket_id || null,
        auth.userId,
      ],
    )
    await logVenueChange('equipment_issue', result.rows[0].id, 'issue_added', auth.userId, {
      equipment_id: params.id, title,
    })
    return NextResponse.json({ issue: result.rows[0] })
  } catch (err) {
    console.error('Error creating equipment issue:', err)
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

    await query(`DELETE FROM equipment_issues WHERE id = $1 AND equipment_id = $2`, [issue_id, params.id])
    await logVenueChange('equipment_issue', issue_id, 'issue_removed', auth.userId, {
      equipment_id: params.id,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting equipment issue:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
