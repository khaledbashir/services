export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const designers = await query(
    `SELECT s.id, s.full_name, s.email, cgd.is_primary, cgd.assigned_at
     FROM cg_design_designers cgd
     JOIN staff s ON s.id = cgd.staff_id
     WHERE cgd.cg_design_request_id = $1
     ORDER BY cgd.is_primary DESC, cgd.assigned_at ASC`,
    [params.id],
  )
  const enterpriseContacts = await query(
    `SELECT s.id, s.full_name, s.email, cgec.assigned_at
     FROM cg_design_enterprise_contacts cgec
     JOIN staff s ON s.id = cgec.staff_id
     WHERE cgec.cg_design_request_id = $1
     ORDER BY cgec.assigned_at ASC`,
    [params.id],
  )

  return NextResponse.json({
    designers: designers.rows,
    enterprise_contacts: enterpriseContacts.rows,
  })
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({}))
  const designerIds = Array.isArray(body.designer_ids) ? body.designer_ids.filter((s: any) => typeof s === 'string') : null
  const entIds = Array.isArray(body.enterprise_contact_ids) ? body.enterprise_contact_ids.filter((s: any) => typeof s === 'string') : null
  const primaryDesignerId = typeof body.primary_designer_id === 'string' ? body.primary_designer_id : null

  try {
    if (designerIds !== null) {
      await query(`DELETE FROM cg_design_designers WHERE cg_design_request_id = $1`, [params.id])
      for (const sid of designerIds) {
        const isPrimary = primaryDesignerId ? sid === primaryDesignerId : sid === designerIds[0]
        await query(
          `INSERT INTO cg_design_designers (cg_design_request_id, staff_id, is_primary, assigned_by)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (cg_design_request_id, staff_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
          [params.id, sid, isPrimary, auth.userId],
        )
      }
      await query(
        `UPDATE cg_design_requests SET designer_id = $1, updated_at = NOW() WHERE id = $2`,
        [primaryDesignerId || designerIds[0] || null, params.id],
      )
    }

    if (entIds !== null) {
      await query(`DELETE FROM cg_design_enterprise_contacts WHERE cg_design_request_id = $1`, [params.id])
      for (const sid of entIds) {
        await query(
          `INSERT INTO cg_design_enterprise_contacts (cg_design_request_id, staff_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [params.id, sid],
        )
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[cg assignees POST] error:', err)
    return NextResponse.json({ error: 'Failed to update CG assignments' }, { status: 500 })
  }
}
