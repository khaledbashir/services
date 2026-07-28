export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'
import { getHubConfig } from '@/lib/request-hub/config'
import { resolveHubPermissions, canSeeAll } from '@/lib/request-hub/roles'
import {
  getRequestDetail,
  updateRequestFields,
  REQUESTER_EDITABLE,
  ASSESSOR_EDITABLE,
  logHubActivity,
} from '@/lib/request-hub/core'
import { notifyOwnerAssigned } from '@/lib/request-hub/slack'

function isOwnRequest(req: any, userId: string): boolean {
  return req.requester_id === userId
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth

  const detail = await getRequestDetail(params.id)
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const config = await getHubConfig()
  const perms = resolveHubPermissions(
    { userId: auth.userId, fullName: auth.fullName, role: auth.role },
    config
  )
  if (!canSeeAll(perms) && !isOwnRequest(detail, auth.userId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ request: detail, permissions: perms, config })
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const existing = await query(`SELECT * FROM request_hub_items WHERE id = $1`, [params.id])
  const row = existing.rows[0]
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const config = await getHubConfig()
  const perms = resolveHubPermissions(
    { userId: auth.userId, fullName: auth.fullName, role: auth.role },
    config
  )

  let allowed: Set<string>
  if (perms.isAssessor || perms.isApprover) {
    allowed = ASSESSOR_EDITABLE
  } else if (isOwnRequest(row, auth.userId)) {
    // Requesters may edit their own request until leadership has decided.
    const editableStatuses = ['draft', 'submitted', 'needs_clarification']
    if (!editableStatuses.includes(row.status)) {
      return NextResponse.json(
        { error: 'This request is already under review — add a comment instead.' },
        { status: 403 }
      )
    }
    allowed = REQUESTER_EDITABLE
  } else {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const prevOwner = row.owner_id
  const isAssessmentEdit = ['assessment', 'feasibility', 'effort', 'business_value', 'confidence', 'recommendation']
    .some((k) => k in body)
  const updated = await updateRequestFields(
    params.id,
    body,
    allowed,
    { userId: auth.userId, fullName: auth.fullName },
    { logEvent: body._silent ? undefined : isAssessmentEdit ? 'assessment' : 'field_change' }
  )
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // A human editing assessment fields clears the "AI draft" flag unless the
  // caller explicitly keeps it (applying an AI suggestion verbatim).
  if (isAssessmentEdit && body.assessment_ai === undefined) {
    await query(
      `UPDATE request_hub_items SET assessment_ai = false, assessment_updated_by = $2, assessment_updated_at = NOW() WHERE id = $1`,
      [params.id, auth.userId]
    )
  }

  if (body.owner_id && body.owner_id !== prevOwner) {
    await logHubActivity({
      requestId: params.id,
      eventType: 'assigned',
      actor: { userId: auth.userId, fullName: auth.fullName },
      toValue: String(body.owner_id),
    })
    notifyOwnerAssigned(updated, body.owner_id).catch(() => {})
  }

  return NextResponse.json({ request: updated })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth

  const existing = await query(`SELECT id, status, requester_id FROM request_hub_items WHERE id = $1`, [params.id])
  const row = existing.rows[0]
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Only drafts can be deleted, and only by their author or an admin.
  const isAdmin = auth.role === 'admin'
  if (row.status !== 'draft' || (!isAdmin && row.requester_id !== auth.userId)) {
    return NextResponse.json({ error: 'Only your own drafts can be deleted' }, { status: 403 })
  }
  await query(`DELETE FROM request_hub_items WHERE id = $1`, [params.id])
  return NextResponse.json({ ok: true })
}
