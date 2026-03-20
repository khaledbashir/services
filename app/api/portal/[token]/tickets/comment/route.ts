import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    // Validate token
    const venueResult = await query(
      `SELECT id FROM venues WHERE portal_token = $1`,
      [params.token]
    )
    if (venueResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid portal' }, { status: 404 })
    }

    const { ticket_id, body } = await request.json()
    if (!ticket_id || !body) {
      return NextResponse.json({ error: 'ticket_id and body required' }, { status: 400 })
    }

    // Verify ticket belongs to this venue
    const ticketResult = await query(
      `SELECT id FROM tickets WHERE id = $1 AND venue_id = $2`,
      [ticket_id, venueResult.rows[0].id]
    )
    if (ticketResult.rows.length === 0) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // Add as external comment (visible to both sides) from Claw
    const CLAW_STAFF_ID = '7fb556c3-5d2d-430a-b3dc-42f58d79be33'
    await query(
      `INSERT INTO ticket_comments (ticket_id, author_id, body, is_internal, created_at)
       VALUES ($1, $2, $3, false, NOW())`,
      [ticket_id, CLAW_STAFF_ID, body]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error adding portal comment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
