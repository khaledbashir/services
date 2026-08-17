export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/rbac'
import {
  canDecideApproval,
  decideEventApproval,
  loadEventForApproval,
} from '@/lib/event-approval-actions'

/**
 * The venue lead's accept/reject on a suggested event (Joe 2026-08-17).
 *
 * GET reports the current state plus whether the caller is allowed to decide,
 * so the UI can show the buttons only to the person who owns the call.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const event = await loadEventForApproval(params.id)
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  return NextResponse.json({
    id: event.id,
    summary: event.summary,
    event_date: event.event_date,
    venue_name: event.venue_name,
    approval_status: event.approval_status,
    suggestion_reason: event.suggestion_reason,
    can_decide: canDecideApproval(user, event),
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getAuthUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const action = body?.action
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: "action must be 'approve' or 'reject'" }, { status: 400 })
    }

    const event = await loadEventForApproval(params.id)
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    if (!canDecideApproval(user, event)) {
      return NextResponse.json(
        { error: 'Only this venue’s lead can approve or reject its suggested events' },
        { status: 403 },
      )
    }

    // Approving something already on the schedule is a no-op, not an error —
    // two leads clicking the same button should not produce a failure.
    if (event.approval_status === 'approved' && action === 'approve') {
      return NextResponse.json({ ok: true, approval_status: 'approved', unchanged: true })
    }

    const result = await decideEventApproval({
      event,
      user,
      action,
      note: typeof body?.note === 'string' ? body.note : null,
    })

    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    console.error('Error deciding event approval:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
