export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError, getAuthUser } from '@/lib/rbac'
import { createWalkthrough } from '@/lib/venue-walkthroughs'

/**
 * Assigned walk-thrus (Joe 2026-08-17).
 *
 * GET lists them. A technician only ever sees their own — the same rule the
 * events list already applies to assignments.
 * POST assigns the venue's standard walk to someone; manager and above.
 */
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const venueId = searchParams.get('venue_id')
  const status = searchParams.get('status')

  const conditions: string[] = ['1=1']
  const params: unknown[] = []

  if (user.role === 'technician') {
    params.push(user.userId)
    conditions.push(`w.assigned_staff_id = $${params.length}`)
  }
  if (venueId) {
    params.push(venueId)
    conditions.push(`w.venue_id = $${params.length}`)
  }
  if (status) {
    params.push(status)
    conditions.push(`w.status = $${params.length}`)
  }

  const result = await query(
    `SELECT w.id, w.venue_id, w.status,
            TO_CHAR(w.scheduled_for, 'YYYY-MM-DD') AS scheduled_for,
            w.submitted_at, w.generated_ticket_id,
            v.name AS venue_name,
            assignee.full_name AS assigned_staff_name,
            t.ticket_number AS generated_ticket_number,
            COUNT(r.id)::int AS item_count,
            COUNT(r.id) FILTER (WHERE r.result = 'issue')::int AS issue_count
     FROM venue_walkthroughs w
     LEFT JOIN venues v ON v.id = w.venue_id
     LEFT JOIN staff assignee ON assignee.id = w.assigned_staff_id
     LEFT JOIN tickets t ON t.id = w.generated_ticket_id
     LEFT JOIN venue_walkthrough_results r ON r.walkthrough_id = w.id
     WHERE ${conditions.join(' AND ')}
     GROUP BY w.id, v.name, assignee.full_name, t.ticket_number
     ORDER BY w.scheduled_for DESC NULLS LAST, w.created_at DESC
     LIMIT 200`,
    params,
  )

  return NextResponse.json({ walkthroughs: result.rows })
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json().catch(() => ({}))
    const venueId = typeof body?.venue_id === 'string' ? body.venue_id : ''
    const assignedStaffId = typeof body?.assigned_staff_id === 'string' ? body.assigned_staff_id : ''

    if (!venueId || !assignedStaffId) {
      return NextResponse.json(
        { error: 'venue_id and assigned_staff_id are required' },
        { status: 400 },
      )
    }

    const created = await createWalkthrough({
      venueId,
      assignedStaffId,
      assignedBy: auth.userId,
      scheduledFor: typeof body?.scheduled_for === 'string' ? body.scheduled_for : null,
    })

    if (created.item_count === 0) {
      return NextResponse.json({
        ...created,
        warning: 'This venue has no checklist items yet — add screens and systems to its standard walk first.',
      })
    }

    return NextResponse.json(created)
  } catch (err) {
    console.error('Error creating walk-thru:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
