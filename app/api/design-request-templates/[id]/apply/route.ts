import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Designs, isTwentyBackedEnabled } from '@/lib/twenty-ops'

// Materialize a template into a real design_request as a Submitted ticket.
// Same shape as duplicating a request — the brief carries forward, cycle
// fields stay empty so Alexis fills the date + asset link + designer in
// the new record.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const tplRes = await query(
      `SELECT id, name, job_title, company_name, tricode, notes,
              boards_requested, sizes_requested,
              venue_id, designer_id, enterprise_contact_id,
              hours_estimated, is_rando
       FROM design_request_templates WHERE id = $1`,
      [params.id],
    )
    const tpl = tplRes.rows[0]
    if (!tpl) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const jobTitle = (tpl.job_title || tpl.name || 'Untitled').toString().trim()

    // Board & Sizes is one field now — fold any legacy separate sizes into the
    // board field so applying an older template doesn't drop its sizing.
    const mergedBoards = [tpl.boards_requested, tpl.sizes_requested]
      .filter(Boolean)
      .join(' · ') || null

    if (isTwentyBackedEnabled('DESIGNS')) {
      const created = await Designs.create({
        name: jobTitle,
        aiPrompt: tpl.notes || null,
        boardSection: mergedBoards,
        proofLink: null,
        localFilePath: null,
        status: 'STATUS_REQUEST_SUBMITTED' as any,
        designAssigneeId: tpl.designer_id || null,
      } as any)
      return NextResponse.json({ design_request: { id: created.id, job_title: created.name, status: 'request_submitted' } })
    }

    const result = await query(
      `INSERT INTO design_requests (
        venue_id, company_name, job_title, tricode,
        notes, boards_requested, sizes_requested,
        designer_id, enterprise_contact_id,
        status, hours_estimated, hours_spent, is_rando, updated_at
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7,
        $8, $9,
        'request_submitted', $10, 0, $11, NOW()
      )
      RETURNING id, job_title, status`,
      [
        tpl.venue_id,
        tpl.company_name,
        jobTitle,
        tpl.tricode,
        tpl.notes,
        mergedBoards,
        null,
        tpl.designer_id,
        tpl.enterprise_contact_id,
        tpl.hours_estimated,
        !!tpl.is_rando,
      ],
    )

    return NextResponse.json({ design_request: result.rows[0] })
  } catch (err) {
    console.error('Error applying template:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
