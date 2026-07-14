export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { sendAssignmentEmail } from '@/lib/assignment-emails'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const operators = await query(
    `SELECT s.id, s.full_name, s.email, cso.is_primary, cso.assigned_at
     FROM content_schedule_operators cso
     JOIN staff s ON s.id = cso.staff_id
     WHERE cso.content_schedule_id = $1
     ORDER BY cso.is_primary DESC, cso.assigned_at ASC`,
    [params.id],
  )
  const enterpriseContacts = await query(
    `SELECT s.id, s.full_name, s.email, csec.assigned_at
     FROM content_schedule_enterprise_contacts csec
     JOIN staff s ON s.id = csec.staff_id
     WHERE csec.content_schedule_id = $1
     ORDER BY csec.assigned_at ASC`,
    [params.id],
  )

  return NextResponse.json({
    operators: operators.rows,
    enterprise_contacts: enterpriseContacts.rows,
  })
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({}))
  const operatorIds = Array.isArray(body.operator_ids) ? body.operator_ids.filter((s: any) => typeof s === 'string') : null
  const entIds = Array.isArray(body.enterprise_contact_ids) ? body.enterprise_contact_ids.filter((s: any) => typeof s === 'string') : null
  const primaryOperatorId = typeof body.primary_operator_id === 'string' ? body.primary_operator_id : null

  try {
    // Snapshot current assignees BEFORE the wipe+reinsert so we can email only
    // the people who are genuinely NEW — re-saving the same list stays silent.
    const priorOperators = operatorIds !== null
      ? new Set(
          (await query(`SELECT staff_id::text AS staff_id FROM content_schedule_operators WHERE content_schedule_id = $1`, [params.id]))
            .rows.map((r: any) => r.staff_id),
        )
      : null
    const priorEnts = entIds !== null
      ? new Set(
          (await query(`SELECT staff_id::text AS staff_id FROM content_schedule_enterprise_contacts WHERE content_schedule_id = $1`, [params.id]))
            .rows.map((r: any) => r.staff_id),
        )
      : null

    if (operatorIds !== null) {
      await query(`DELETE FROM content_schedule_operators WHERE content_schedule_id = $1`, [params.id])
      for (const sid of operatorIds) {
        const isPrimary = primaryOperatorId ? sid === primaryOperatorId : sid === operatorIds[0]
        await query(
          `INSERT INTO content_schedule_operators (content_schedule_id, staff_id, is_primary, assigned_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (content_schedule_id, staff_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
          [params.id, sid, isPrimary, auth.userId],
        )
      }
      await query(
        `UPDATE content_schedules SET operator_id = $1, updated_at = NOW() WHERE id = $2`,
        [primaryOperatorId || operatorIds[0] || null, params.id],
      )
    }

    if (entIds !== null) {
      await query(`DELETE FROM content_schedule_enterprise_contacts WHERE content_schedule_id = $1`, [params.id])
      for (const sid of entIds) {
        await query(
          `INSERT INTO content_schedule_enterprise_contacts (content_schedule_id, staff_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [params.id, sid],
        )
      }
    }

    // Email only the newly-added people (fire-and-forget — never blocks the response).
    const newlyAssignedIds = [
      ...(operatorIds || []).filter((sid: string) => priorOperators && !priorOperators.has(sid)),
      ...(entIds || []).filter((sid: string) => priorEnts && !priorEnts.has(sid)),
    ]
    if (newlyAssignedIds.length) {
      sendAssignmentEmail({
        kind: 'content',
        recordId: params.id,
        assigneeUserIds: newlyAssignedIds,
        assignedByName: auth.fullName,
        assignedByUserId: auth.userId,
        assignedByEmail: auth.email,
      }).catch((err) => console.error('[content assignees POST] assignment email failed:', err))
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[content assignees POST] error:', err)
    return NextResponse.json({ error: 'Failed to update content assignments' }, { status: 500 })
  }
}
