export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET() {
  const r = await query(
    `SELECT id, slug, name, tagline, delivered_at, warranty_days, sort_order
       FROM platforms
      ORDER BY sort_order ASC, name ASC`,
  ).catch(() => ({ rows: [] }))
  return NextResponse.json({ platforms: r.rows })
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth
  const body = await request.json().catch(() => ({}))
  const slug = String(body.slug || '').trim()
  const name = String(body.name || '').trim()
  if (!slug || !name) return NextResponse.json({ error: 'slug + name required' }, { status: 400 })
  const r = await query(
    `INSERT INTO platforms (slug, name, tagline, delivered_at, warranty_days, sort_order)
     VALUES ($1, $2, $3, COALESCE($4::timestamptz, NOW()), COALESCE($5::int, 30), COALESCE($6::int, 0))
     ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name,
           tagline = EXCLUDED.tagline,
           delivered_at = EXCLUDED.delivered_at,
           warranty_days = EXCLUDED.warranty_days,
           sort_order = EXCLUDED.sort_order,
           updated_at = NOW()
     RETURNING *`,
    [slug, name, body.tagline || null, body.delivered_at || null, body.warranty_days || 30, body.sort_order || 0],
  )
  return NextResponse.json(r.rows[0])
}
