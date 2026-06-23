export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

async function ensureTemplateTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS content_schedule_templates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL,
      description TEXT,
      venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
      company_name TEXT,
      content_name TEXT NOT NULL,
      operator_id UUID REFERENCES staff(id) ON DELETE SET NULL,
      files_ready BOOLEAN NOT NULL DEFAULT false,
      file_location TEXT,
      notes TEXT,
      created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS idx_content_schedule_templates_name ON content_schedule_templates(LOWER(name))`)
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth
    await ensureTemplateTable()

    const result = await query(
      `SELECT t.id, t.name, t.description, t.venue_id, v.name AS venue_name,
              t.company_name, t.content_name, t.operator_id, s.full_name AS operator_name,
              t.files_ready, t.file_location, t.notes, t.created_by,
              cb.full_name AS created_by_name, t.created_at, t.updated_at
       FROM content_schedule_templates t
       LEFT JOIN venues v ON v.id = t.venue_id
       LEFT JOIN staff s ON s.id = t.operator_id
       LEFT JOIN staff cb ON cb.id = t.created_by
       ORDER BY LOWER(t.name), t.created_at DESC`,
    )

    return NextResponse.json({ templates: result.rows })
  } catch (err) {
    console.error('Error listing content schedule templates:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth
    await ensureTemplateTable()

    const body = await request.json()
    const name = String(body.name || '').trim()
    const contentName = String(body.content_name || '').trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
    if (!contentName) return NextResponse.json({ error: 'content_name is required' }, { status: 400 })

    const result = await query(
      `INSERT INTO content_schedule_templates (
        name, description, venue_id, company_name, content_name,
        operator_id, files_ready, file_location, notes, created_by
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10
      )
      RETURNING id, name`,
      [
        name,
        nullify(body.description),
        body.venue_id || null,
        nullify(body.company_name),
        contentName,
        body.operator_id || null,
        Boolean(body.files_ready),
        nullify(body.file_location),
        nullify(body.notes),
        auth.userId || null,
      ],
    )

    return NextResponse.json({ template: result.rows[0] })
  } catch (err) {
    console.error('Error creating content schedule template:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function nullify(value: unknown): string | null {
  if (typeof value !== 'string') return value == null ? null : String(value)
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}
