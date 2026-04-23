import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request)
    if (isAuthError(auth)) return auth

    const venueId = params.id
    const result = await query(
      `SELECT n.id, n.body, n.created_at, n.author_id,
              COALESCE(s.full_name, 'Unknown') as author_name
       FROM venue_notes n
       LEFT JOIN staff s ON s.id = n.author_id
       WHERE n.venue_id = $1
       ORDER BY n.created_at DESC
       LIMIT 200`,
      [venueId]
    )
    return NextResponse.json({ notes: result.rows })
  } catch (err) {
    console.error('Error fetching venue notes:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request)
    if (isAuthError(auth)) return auth

    const venueId = params.id
    const { body } = await request.json()
    const text = typeof body === 'string' ? body.trim() : ''
    if (!text) {
      return NextResponse.json({ error: 'Note body is required' }, { status: 400 })
    }
    if (text.length > 4000) {
      return NextResponse.json({ error: 'Note is too long (max 4000 chars)' }, { status: 400 })
    }

    const inserted = await query(
      `INSERT INTO venue_notes (venue_id, author_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, body, created_at, author_id`,
      [venueId, auth.userId, text]
    )
    const row = inserted.rows[0]
    return NextResponse.json({
      note: {
        id: row.id,
        body: row.body,
        created_at: row.created_at,
        author_id: row.author_id,
        author_name: auth.fullName,
      },
    })
  } catch (err) {
    console.error('Error creating venue note:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
