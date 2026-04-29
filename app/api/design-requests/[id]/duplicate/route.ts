import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'
import { Designs, isTwentyBackedEnabled } from '@/lib/twenty-ops'

// Alexis's South Street workflow: open an existing template-style request,
// hit Duplicate, fill in the new concert date + asset link + designer, push
// to In Queue. Cloning copies the brief (notes, boards, sizes, client/venue,
// estimated hours, designer) but resets cycle-specific fields so the copy
// starts as a fresh Submitted request, not as a half-done duplicate.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    if (isTwentyBackedEnabled('DESIGNS')) {
      const source = await Designs.get(params.id) as any
      if (!source) {
        return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
      }
      const created = await Designs.create({
        name: appendCopySuffix(source.name),
        aiPrompt: source.aiPrompt || null,
        boardSection: source.boardSection || null,
        // Cycle-specific — reset on the copy so a fresh proof gets minted on
        // the next Client Review transition rather than reusing the source's.
        proofLink: null,
        localFilePath: null,
        status: 'STATUS_REQUEST_SUBMITTED' as any,
        // Carry the relations + brief metadata forward.
        designClientId: source.designClientId || null,
        designAssigneeId: source.designAssigneeId || null,
      } as any)
      return NextResponse.json({ design_request: { id: created.id, job_title: created.name, status: 'request_submitted' } })
    }

    const venueIds = await getStaffVenueIds(auth.userId, auth.role)
    const vf = buildVenueFilterClause(venueIds, 'dr.venue_id', 2)
    const sourceRes = await query(
      `SELECT dr.id, dr.venue_id, dr.company_name, dr.job_title, dr.tricode,
              dr.notes, dr.boards_requested, dr.sizes_requested,
              dr.designer_id, dr.enterprise_contact_id,
              dr.hours_estimated, dr.is_rando
       FROM design_requests dr
       WHERE dr.id = $1 ${vf.clause}`,
      [params.id, ...vf.params],
    )
    const source = sourceRes.rows[0]
    if (!source) {
      return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
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
        source.venue_id,
        source.company_name,
        appendCopySuffix(source.job_title),
        source.tricode,
        source.notes,
        source.boards_requested,
        source.sizes_requested,
        source.designer_id,
        source.enterprise_contact_id,
        source.hours_estimated,
        !!source.is_rando,
      ],
    )

    return NextResponse.json({ design_request: result.rows[0] })
  } catch (err) {
    console.error('Error duplicating design request:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Idempotent suffix — duplicating "Foo (Copy)" gives "Foo (Copy 2)" rather
// than "Foo (Copy) (Copy)". Keeps the kanban readable when Alexis duplicates
// the same template twice in a row.
function appendCopySuffix(name: string | null | undefined): string {
  const base = (name || 'Untitled').trim()
  const match = base.match(/^(.*) \(Copy(?: (\d+))?\)$/)
  if (match) {
    const prefix = match[1]
    const n = match[2] ? parseInt(match[2], 10) + 1 : 2
    return `${prefix} (Copy ${n})`
  }
  return `${base} (Copy)`
}
