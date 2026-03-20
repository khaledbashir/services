import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { jwtVerify } from 'jose'

async function getUserFromToken(request: NextRequest) {
  const token = request.cookies.get('token')?.value
  if (!token) return null
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'anc-services-secret-key-change-me')
    const { payload } = await jwtVerify(token, secret)
    return payload as any
  } catch { return null }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromToken(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { body, is_internal } = await request.json()
    if (!body || !body.trim()) {
      return NextResponse.json({ error: 'Comment body is required' }, { status: 400 })
    }

    const result = await query(
      `INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING id, body, is_internal, created_at`,
      [params.id, user.userId, body, is_internal || false]
    )

    // Track first response for SLA (external comments only)
    if (!is_internal) {
      await query(
        `UPDATE tickets SET first_response_at = NOW(), sla_response_met = (NOW() <= sla_response_due)
         WHERE id = $1 AND first_response_at IS NULL`,
        [params.id]
      )
    }

    return NextResponse.json({ comment: result.rows[0] })
  } catch (err) {
    console.error('Error creating comment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
