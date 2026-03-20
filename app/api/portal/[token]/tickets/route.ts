import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// Get ticket detail with external comments
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const ticketId = searchParams.get('id')
    if (!ticketId) return NextResponse.json({ error: 'Ticket ID required' }, { status: 400 })

    // Validate token
    const venueResult = await query(
      `SELECT id FROM venues WHERE portal_token = $1`,
      [params.token]
    )
    if (venueResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid portal' }, { status: 404 })
    }

    const venueId = venueResult.rows[0].id

    // Get ticket (must belong to this venue)
    const ticketResult = await query(
      `SELECT t.id, t.ticket_number, t.title, t.description, t.category, t.priority, t.status,
              t.resolution_notes,
              TO_CHAR(t.created_at, 'Mon DD, YYYY HH12:MI AM') as created_at,
              TO_CHAR(t.resolved_at, 'Mon DD, YYYY HH12:MI AM') as resolved_at
       FROM tickets t
       WHERE t.id = $1 AND t.venue_id = $2`,
      [ticketId, venueId]
    )

    if (ticketResult.rows.length === 0) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    // External comments only
    const commentsResult = await query(
      `SELECT tc.body, tc.created_at, s.full_name as author
       FROM ticket_comments tc
       LEFT JOIN staff s ON tc.author_id = s.id
       WHERE tc.ticket_id = $1 AND tc.is_internal = false
       ORDER BY tc.created_at ASC`,
      [ticketId]
    )

    return NextResponse.json({
      ticket: ticketResult.rows[0],
      comments: commentsResult.rows,
    })
  } catch (err) {
    console.error('Error fetching ticket:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Submit a new ticket from the portal
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    // Validate token
    const venueResult = await query(
      `SELECT id, name FROM venues WHERE portal_token = $1`,
      [params.token]
    )
    if (venueResult.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid portal' }, { status: 404 })
    }

    const venueId = venueResult.rows[0].id
    const { title, description, category, priority } = await request.json()

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    // Use Claw's staff ID for portal-created tickets
    const CLAW_STAFF_ID = '7fb556c3-5d2d-430a-b3dc-42f58d79be33'
    const result = await query(
      `INSERT INTO tickets (venue_id, title, description, category, priority, status, created_by)
       VALUES ($1, $2, $3, $4, $5, 'open', $6)
       RETURNING id, ticket_number, title, status`,
      [venueId, title, description || '', category || 'general', priority || 'medium', CLAW_STAFF_ID]
    )

    return NextResponse.json({ ticket: result.rows[0] })
  } catch (err) {
    console.error('Error creating ticket:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
