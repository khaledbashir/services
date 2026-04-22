import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { OpeningChecklist, isTwentyBackedEnabled } from '@/lib/twenty-ops'
import {
  buildOpeningChecklistPatch,
  deriveDueDate,
  normalizeOpeningChecklistStatus,
  resolveChecklistAssignee,
  resolveVenueForChecklist,
  shapeOpeningChecklistItem,
} from '../shared'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  if (!isTwentyBackedEnabled('OPENING_CHECKLISTS')) {
    return NextResponse.json({ error: 'Opening checklist module is not enabled' }, { status: 503 })
  }

  try {
    const record = await OpeningChecklist.get(params.id)
    if (!record) return NextResponse.json({ error: 'Opening checklist item not found' }, { status: 404 })
    return NextResponse.json({ item: await shapeOpeningChecklistItem(record) })
  } catch (err) {
    console.error('[opening-checklists/:id GET] error:', err)
    return NextResponse.json({ error: 'Failed to fetch opening checklist item' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  if (!isTwentyBackedEnabled('OPENING_CHECKLISTS')) {
    return NextResponse.json({ error: 'Opening checklist module is not enabled' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const patch = buildOpeningChecklistPatch(body)

    if (body.venue_id !== undefined) {
      const twentyVenueId = await resolveVenueForChecklist(body.venue_id ? String(body.venue_id) : null)
      if (body.venue_id && !twentyVenueId) {
        return NextResponse.json({ error: 'Venue is not mirrored in Twenty yet' }, { status: 409 })
      }
      patch.venueId = twentyVenueId
    }

    if (body.checklist_assignee_id !== undefined) {
      const assignee = await resolveChecklistAssignee(body.checklist_assignee_id ? String(body.checklist_assignee_id) : null)
      patch.checklistAssigneeId = assignee.technicianId
    }

    const nextOpeningDate = body.opening_date !== undefined ? String(body.opening_date || '') : undefined
    const nextPhase = body.phase !== undefined ? String(body.phase || '') : undefined
    if (body.due_date === undefined && (nextOpeningDate !== undefined || nextPhase !== undefined)) {
      const current = await OpeningChecklist.get(params.id)
      if (!current) return NextResponse.json({ error: 'Opening checklist item not found' }, { status: 404 })
      patch.dueDate = deriveDueDate(
        nextOpeningDate !== undefined ? nextOpeningDate : current.openingDate,
        nextPhase !== undefined ? nextPhase : current.phase,
      )
    }

    if (body.status !== undefined) {
      const normalizedStatus = normalizeOpeningChecklistStatus(String(body.status || 'pending'))
      patch.status = normalizedStatus
      patch.completedAt = normalizedStatus === 'complete' ? new Date().toISOString() : null
    }

    const updated = await OpeningChecklist.update(params.id, patch)
    const fullRecord = await OpeningChecklist.get(updated.id)
    if (!fullRecord) return NextResponse.json({ error: 'Opening checklist item not found' }, { status: 404 })
    return NextResponse.json({ item: await shapeOpeningChecklistItem(fullRecord) })
  } catch (err) {
    console.error('[opening-checklists/:id PATCH] error:', err)
    return NextResponse.json({ error: 'Failed to update opening checklist item' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'tech_support')
  if (isAuthError(auth)) return auth

  if (!isTwentyBackedEnabled('OPENING_CHECKLISTS')) {
    return NextResponse.json({ error: 'Opening checklist module is not enabled' }, { status: 503 })
  }

  try {
    await OpeningChecklist.delete(params.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[opening-checklists/:id DELETE] error:', err)
    return NextResponse.json({ error: 'Failed to delete opening checklist item' }, { status: 500 })
  }
}
