import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Designs, isTwentyBackedEnabled } from '@/lib/twenty-ops'

// Save an existing design request as a reusable template. The template
// becomes the recipe for future "applies" — proof links, hours_spent,
// status, due dates aren't part of a template since they're cycle-specific.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const body = await request.json().catch(() => ({}))
    const name = String(body?.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    let source: {
      job_title: string | null
      company_name: string | null
      tricode: string | null
      notes: string | null
      boards_requested: string | null
      sizes_requested: string | null
      venue_id: string | null
      designer_id: string | null
      enterprise_contact_id: string | null
      hours_estimated: number | null
      is_rando: boolean
    }

    if (isTwentyBackedEnabled('DESIGNS')) {
      const d = await Designs.get(params.id) as any
      if (!d) {
        return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
      }
      const notesText = typeof d.notes === 'object'
        ? (d.notes?.markdown || d.notes?.blocknote || '')
        : (d.notes || d.aiPrompt || '')
      source = {
        job_title: d.name || null,
        company_name: d.designClient?.name || null,
        tricode: d.clientTriCode || null,
        notes: notesText || null,
        boards_requested: d.boardSection || null,
        sizes_requested: d.sizes || null,
        // Twenty designs have no venue relation — leave null.
        venue_id: null,
        designer_id: d.designAssigneeId || null,
        enterprise_contact_id: null,
        hours_estimated: d.effortHours ?? null,
        is_rando: false,
      }
    } else {
      const sourceRes = await query(
        `SELECT job_title, company_name, tricode, notes,
                boards_requested, sizes_requested,
                venue_id, designer_id, enterprise_contact_id,
                hours_estimated, is_rando
         FROM design_requests WHERE id = $1`,
        [params.id],
      )
      const row = sourceRes.rows[0]
      if (!row) {
        return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
      }
      source = row
    }

    const result = await query(
      `INSERT INTO design_request_templates (
        name, description, job_title, company_name, tricode,
        notes, boards_requested, sizes_requested,
        venue_id, designer_id, enterprise_contact_id,
        hours_estimated, is_rando, created_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14
      )
      RETURNING id, name`,
      [
        name,
        body?.description ? String(body.description).trim() || null : null,
        source.job_title,
        source.company_name,
        source.tricode,
        source.notes,
        source.boards_requested,
        source.sizes_requested,
        source.venue_id,
        source.designer_id,
        source.enterprise_contact_id,
        source.hours_estimated,
        !!source.is_rando,
        auth.userId || null,
      ],
    )

    return NextResponse.json({ template: result.rows[0] })
  } catch (err) {
    console.error('Error saving design request as template:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
