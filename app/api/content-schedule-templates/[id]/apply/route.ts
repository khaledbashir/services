export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const body = await request.json().catch(() => ({}))
    const tplRes = await query(
      `SELECT id, name, venue_id, company_name, content_name, operator_id,
              files_ready, file_location, notes
       FROM content_schedule_templates
       WHERE id = $1`,
      [params.id],
    )
    const tpl = tplRes.rows[0]
    if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })

    const result = await query(
      `INSERT INTO content_schedules (
        venue_id, company_name, content_name, launch_date, end_date,
        operator_id, files_ready, status, file_location, notes, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, 'in_queue', $8, $9, NOW()
      )
      RETURNING id, content_name, status`,
      [
        body.venue_id || tpl.venue_id || null,
        body.company_name || tpl.company_name || null,
        body.content_name || tpl.content_name,
        body.launch_date || null,
        body.end_date || null,
        body.operator_id || tpl.operator_id || null,
        Boolean(tpl.files_ready),
        tpl.file_location || null,
        tpl.notes || null,
      ],
    )

    return NextResponse.json({ content_schedule: result.rows[0] })
  } catch (err) {
    console.error('Error applying content schedule template:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
