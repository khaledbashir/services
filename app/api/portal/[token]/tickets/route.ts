import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage, formatTicketNotification } from '@/lib/slack'
import { sendTicketDistributionEmail } from '@/lib/email'
import fs from 'fs'

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
      `INSERT INTO tickets (venue_id, title, description, category, priority, status, created_by, source)
       VALUES ($1, $2, $3, $4, $5, 'new', $6, 'portal')
       RETURNING id, ticket_number, title, category, priority, status`,
      [venueId, title, description || '', category || 'general', priority || 'medium', CLAW_STAFF_ID]
    )

    const ticket = result.rows[0]
    const venueName = venueResult.rows[0].name

    // Write notification log for Claw
    const logEntry = `TICKET|portal_created|Portal User|${title}|${venueName}|${new Date().toISOString()}\n`
    fs.appendFileSync('/tmp/anc-ticket-notifications.log', logEntry)

    // Notify venue's Slack channel (fallback to default channel)
    const slackChRes = await query('SELECT slack_channel_id FROM venues WHERE id = $1', [venueId])
    const channelId = slackChRes.rows[0]?.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
    if (channelId) {
      const msg = formatTicketNotification({
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        title: ticket.title,
        category: category || 'general',
        priority: priority || 'medium',
        venue_name: venueName,
        description: description || undefined,
      }, 'created')
      msg.channel = channelId
      sendSlackMessage(msg)
    }

    // Email distribution list
    sendTicketDistributionEmail({
      venueId,
      ticketTitle: title,
      ticketNumber: ticket.ticket_number,
      type: 'created',
      detail: description || title,
    }).catch(err => console.error('[email] Portal ticket creation email failed:', err))

    return NextResponse.json({ ticket })
  } catch (err) {
    console.error('Error creating ticket:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
