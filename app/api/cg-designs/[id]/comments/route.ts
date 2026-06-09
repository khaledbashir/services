export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const res = await query(
      `SELECT id, cg_design_request_id, author_id, author_name, body, mentions, created_at, updated_at
       FROM cg_design_comments
       WHERE cg_design_request_id = $1
       ORDER BY created_at DESC`,
      [params.id],
    )
    return NextResponse.json({ comments: res.rows })
  } catch (err) {
    console.error('Error reading CG comments:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const body = await request.json().catch(() => ({}))
    const text = typeof body.body === 'string' ? body.body.trim() : ''
    const mentions = Array.isArray(body.mentions)
      ? body.mentions.filter((m: any) => typeof m === 'string').map((m: string) => m.trim()).filter(Boolean)
      : []
    if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 })

    const res = await query(
      `INSERT INTO cg_design_comments (cg_design_request_id, author_id, author_name, body, mentions)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, cg_design_request_id, author_id, author_name, body, mentions, created_at, updated_at`,
      [params.id, auth.userId || null, auth.fullName || null, text, mentions],
    )
    return NextResponse.json({ comment: res.rows[0] })
  } catch (err) {
    console.error('Error creating CG comment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
