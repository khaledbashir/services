import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const params: unknown[] = []
  let where = ''
  if (status) { params.push(status); where = `WHERE o.status = $1` }

  const r = await query(
    `SELECT o.*, v.name AS venue_name, p.part_name, p.part_number
     FROM parts_orders o
     LEFT JOIN venues v ON v.id = o.venue_id
     LEFT JOIN parts p ON p.id = o.part_id
     ${where} ORDER BY o.created_at DESC LIMIT 500`,
    params
  )
  return NextResponse.json({ orders: r.rows })
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  const body = await request.json()
  const {
    venue_id = null, part_id = null, parts_needed, quantity = 1,
    requestor_name = null, requestor_email = null, shipping_address = null,
    notes = null, photo_url = null, status = 'requested',
  } = body
  if (!parts_needed) return NextResponse.json({ error: 'parts_needed required' }, { status: 400 })
  const r = await query(
    `INSERT INTO parts_orders (venue_id, part_id, parts_needed, quantity, requestor_name,
       requestor_email, shipping_address, notes, photo_url, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [venue_id, part_id, parts_needed, quantity, requestor_name, requestor_email,
     shipping_address, notes, photo_url, status]
  )
  return NextResponse.json({ order: r.rows[0] })
}
