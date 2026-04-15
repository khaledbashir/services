import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  const r = await query(`SELECT * FROM parts ORDER BY part_name ASC LIMIT 500`)
  return NextResponse.json({ parts: r.rows })
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth
  const body = await request.json()
  const {
    part_number = null, part_name, manufacturer = null, model_name = null,
    description = null, unit_cost = null, quantity_on_hand = 0, reorder_threshold = 5, notes = null,
  } = body
  if (!part_name) return NextResponse.json({ error: 'part_name required' }, { status: 400 })
  const r = await query(
    `INSERT INTO parts (part_number, part_name, manufacturer, model_name, description,
       unit_cost, quantity_on_hand, reorder_threshold, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [part_number, part_name, manufacturer, model_name, description, unit_cost, quantity_on_hand, reorder_threshold, notes]
  )
  return NextResponse.json({ part: r.rows[0] })
}
