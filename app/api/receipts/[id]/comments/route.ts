export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const { id } = await params
  const result = await query(
    `SELECT c.id, c.body, c.author_name, c.author_id, c.created_at,
            s.full_name as staff_full_name
     FROM infra_receipt_comments c
     LEFT JOIN staff s ON s.id = c.author_id
     WHERE c.receipt_id = $1
     ORDER BY c.created_at ASC`,
    [id]
  )
  return NextResponse.json({
    comments: result.rows.map((r) => ({
      id: r.id,
      body: r.body,
      author_name: r.staff_full_name || r.author_name || 'Someone',
      created_at: r.created_at,
    })),
  })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const { id } = await params
  const body = await request.json().catch(() => ({})) as { body?: string }
  const text = (body.body || '').trim()
  if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 })
  if (text.length > 5000) return NextResponse.json({ error: 'body too long' }, { status: 400 })

  // Confirm the receipt exists
  const check = await query(`SELECT id FROM infra_receipts WHERE id = $1`, [id])
  if (check.rows.length === 0) return NextResponse.json({ error: 'Receipt not found' }, { status: 404 })

  const inserted = await query(
    `INSERT INTO infra_receipt_comments (receipt_id, author_id, author_name, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id, created_at`,
    [id, auth.userId, auth.fullName || auth.email || 'Someone', text]
  )

  return NextResponse.json({
    id: inserted.rows[0].id,
    created_at: inserted.rows[0].created_at,
    author_name: auth.fullName || auth.email || 'Someone',
    body: text,
  })
}
