import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const result = await query(
      `SELECT t.id, t.name, t.description, t.job_title, t.company_name, t.tricode,
              t.notes, t.boards_requested, t.sizes_requested,
              t.hours_estimated, t.is_rando,
              t.venue_id, v.name as venue_name,
              t.designer_id, d.full_name as designer_name,
              t.enterprise_contact_id, ec.full_name as enterprise_contact_name,
              t.created_at, t.updated_at,
              t.created_by, cb.full_name as created_by_name
       FROM design_request_templates t
       LEFT JOIN venues v ON t.venue_id = v.id
       LEFT JOIN staff d ON t.designer_id = d.id
       LEFT JOIN staff ec ON t.enterprise_contact_id = ec.id
       LEFT JOIN staff cb ON t.created_by = cb.id
       ORDER BY LOWER(t.name) ASC`,
    )

    return NextResponse.json({ templates: result.rows })
  } catch (err) {
    console.error('Error listing design request templates:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const name = String(body.name || '').trim()
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
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
        nullify(body.description),
        nullify(body.job_title),
        nullify(body.company_name),
        nullify(body.tricode),
        nullify(body.notes),
        nullify(body.boards_requested),
        nullify(body.sizes_requested),
        body.venue_id || null,
        body.designer_id || null,
        body.enterprise_contact_id || null,
        body.hours_estimated === '' || body.hours_estimated == null ? null : Number(body.hours_estimated),
        !!body.is_rando,
        auth.userId || null,
      ],
    )

    return NextResponse.json({ template: result.rows[0] })
  } catch (err) {
    console.error('Error creating design request template:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function nullify(value: unknown): string | null {
  if (typeof value !== 'string') return value == null ? null : String(value)
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}
