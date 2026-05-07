export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

// Multi-designer + multi-enterprise-contact assignments on a design request.
// Alexis 2026-04-23: "can we make it so there can be multiple Enterprise
// Solutions reps are assigned and multiple designers can be assigned?"
//
// Data model: join tables design_request_designers + design_request_enterprise_contacts.
// Legacy single columns design_requests.designer_id / enterprise_contact_id
// stay as a denormalized "primary" — the join table is the truth, and the
// primary is whichever row has is_primary=true for the designer side or the
// first-assigned for the ent-contact side. That way legacy callers still see
// an answer; new UIs read the full list.

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const designers = await query(
    `SELECT s.id, s.full_name, s.email, drd.is_primary, drd.assigned_at
     FROM design_request_designers drd
     JOIN staff s ON s.id = drd.staff_id
     WHERE drd.design_request_id = $1
     ORDER BY drd.is_primary DESC, drd.assigned_at ASC`,
    [params.id]
  )
  const enterpriseContacts = await query(
    `SELECT s.id, s.full_name, s.email, drec.assigned_at
     FROM design_request_enterprise_contacts drec
     JOIN staff s ON s.id = drec.staff_id
     WHERE drec.design_request_id = $1
     ORDER BY drec.assigned_at ASC`,
    [params.id]
  )
  return NextResponse.json({
    designers: designers.rows,
    enterprise_contacts: enterpriseContacts.rows,
  })
}

// POST body: { designer_ids?: string[], enterprise_contact_ids?: string[], primary_designer_id?: string }
// Replaces the full assignment set — simpler than diff-based add/remove. UI
// sends the whole list every time.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({}))
  const designerIds = Array.isArray(body.designer_ids) ? body.designer_ids.filter((s: any) => typeof s === 'string') : null
  const entIds = Array.isArray(body.enterprise_contact_ids) ? body.enterprise_contact_ids.filter((s: any) => typeof s === 'string') : null
  const primaryDesignerId = typeof body.primary_designer_id === 'string' ? body.primary_designer_id : null

  try {
    if (designerIds !== null) {
      // Wipe + reinsert — atomic if wrapped in a transaction; here we're OK
      // with a tiny race because the UI serializes on the frontend.
      await query(`DELETE FROM design_request_designers WHERE design_request_id = $1`, [params.id])
      for (const sid of designerIds) {
        const isPrim = primaryDesignerId ? sid === primaryDesignerId : sid === designerIds[0]
        await query(
          `INSERT INTO design_request_designers (design_request_id, staff_id, is_primary, assigned_by)
           VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
          [params.id, sid, isPrim, auth.userId]
        )
      }
      // Keep legacy column in sync for backward-compat: set to the primary.
      const newPrimary = primaryDesignerId || designerIds[0] || null
      await query(
        `UPDATE design_requests SET designer_id = $1, updated_at = NOW() WHERE id = $2`,
        [newPrimary, params.id]
      )
    }
    if (entIds !== null) {
      await query(`DELETE FROM design_request_enterprise_contacts WHERE design_request_id = $1`, [params.id])
      for (const sid of entIds) {
        await query(
          `INSERT INTO design_request_enterprise_contacts (design_request_id, staff_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [params.id, sid]
        )
      }
      const newPrimary = entIds[0] || null
      await query(
        `UPDATE design_requests SET enterprise_contact_id = $1, updated_at = NOW() WHERE id = $2`,
        [newPrimary, params.id]
      )
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[assignees POST] error:', err)
    return NextResponse.json({ error: 'Failed to update assignments' }, { status: 500 })
  }
}
