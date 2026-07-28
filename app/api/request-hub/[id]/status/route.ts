export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'
import { getHubConfig, statusByKey } from '@/lib/request-hub/config'
import { resolveHubPermissions } from '@/lib/request-hub/roles'
import { setRequestStatus } from '@/lib/request-hub/core'
import { notifyStatusChange } from '@/lib/request-hub/slack'

// POST /api/request-hub/[id]/status — delivery/kanban moves.
// body: { status: string, kanban_order?: number }
// Decision statuses (approved/declined/on_hold/needs_clarification) must go
// through /decision so they carry a decision record; this endpoint refuses them
// unless the caller is an approver moving work on the board.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const status = String(body.status || '')
  const config = await getHubConfig()
  const target = statusByKey(config, status)
  if (!target) return NextResponse.json({ error: 'Unknown status' }, { status: 400 })

  const perms = resolveHubPermissions(
    { userId: auth.userId, fullName: auth.fullName, role: auth.role },
    config
  )

  const existing = await query(`SELECT * FROM request_hub_items WHERE id = $1`, [params.id])
  const row = existing.rows[0]
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isDeliveryMove = ['approved', 'in_progress', 'blocked', 'completed'].includes(status)
  const isDecisionStatus = ['declined', 'on_hold'].includes(status)
  const isBuilderOnRequest = perms.isBuilder && (row.builder_id === auth.userId || row.owner_id === auth.userId)

  if (isDecisionStatus && !perms.isApprover) {
    return NextResponse.json({ error: 'Use a leadership decision for that move' }, { status: 403 })
  }
  if (!isDecisionStatus && !(perms.isAssessor || perms.isApprover || (isDeliveryMove && isBuilderOnRequest))) {
    return NextResponse.json({ error: 'You do not have access to move this request' }, { status: 403 })
  }

  const updated = await setRequestStatus(
    params.id,
    status,
    { userId: auth.userId, fullName: auth.fullName },
    { config }
  )
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (body.kanban_order !== undefined && Number.isFinite(Number(body.kanban_order))) {
    await query(`UPDATE request_hub_items SET kanban_order = $2 WHERE id = $1`, [
      params.id,
      Number(body.kanban_order),
    ])
  }

  if (updated.status !== row.status) {
    notifyStatusChange(updated, updated.status).catch(() => {})
  }

  return NextResponse.json({ request: updated })
}
