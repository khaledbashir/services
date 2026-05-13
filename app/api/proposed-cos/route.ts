export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth
  const url = new URL(request.url)
  const workType = url.searchParams.get('work_type')
  const excludeId = url.searchParams.get('exclude_id')
  const params: any[] = []
  const where: string[] = [`status <> 'archived'`]
  if (workType) {
    params.push(workType)
    where.push(`work_type = $${params.length}`)
  }
  if (excludeId) {
    params.push(excludeId)
    where.push(`id <> $${params.length}`)
  }
  const r = await query(
    `SELECT id, name, pitch, bullets, price_usd, timeline_label, benefit,
            category, target_project, status, pitched_to, promoted_request_id,
            is_placeholder, sort_order, work_type, scope_band, created_at, updated_at
       FROM proposed_change_orders
      WHERE ${where.join(' AND ')}
      ORDER BY is_placeholder ASC, sort_order ASC, created_at DESC
      LIMIT 100`,
    params,
  )
  return NextResponse.json({ items: r.rows })
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth
  const authedUser = auth as { userId: string; email: string; fullName: string }
  const body = await request.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

  const bullets = Array.isArray(body.bullets) ? body.bullets.map((b: unknown) => String(b)).filter(Boolean) : []
  const pitchedTo = Array.isArray(body.pitched_to) ? body.pitched_to.map((p: unknown) => String(p)).filter(Boolean) : []

  const r = await query(
    `INSERT INTO proposed_change_orders
       (name, pitch, bullets, price_usd, timeline_label, benefit,
        category, target_project, status, pitched_to, is_placeholder, sort_order, notes,
        created_by_user_id, created_by_name, created_by_email)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     RETURNING *`,
    [
      name,
      typeof body.pitch === 'string' ? body.pitch : null,
      bullets,
      Number.isFinite(Number(body.price_usd)) ? Number(body.price_usd) : null,
      typeof body.timeline_label === 'string' ? body.timeline_label : null,
      typeof body.benefit === 'string' ? body.benefit : null,
      ['bundle', 'individual'].includes(String(body.category)) ? String(body.category) : 'individual',
      typeof body.target_project === 'string' ? body.target_project : null,
      ['draft', 'available', 'pitched', 'in_progress', 'won'].includes(String(body.status))
        ? String(body.status)
        : 'available',
      pitchedTo,
      Boolean(body.is_placeholder),
      Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
      null,
      authedUser.userId || null,
      authedUser.fullName || null,
      authedUser.email || null,
    ],
  )
  return NextResponse.json(r.rows[0])
}
