export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getPortalSession, getPortalUserVenueIds } from '@/lib/portal-auth'
import { sendSlackMessage, formatTicketNotification } from '@/lib/slack'
import { sendTicketDistributionEmail } from '@/lib/email'

// Service account used as created_by/author_id for customer-originated rows
// (tickets.created_by is a non-null FK to staff). Same account the token
// portal uses, so downstream joins and reports treat both paths identically.
const PORTAL_SERVICE_STAFF_ID = '7fb556c3-5d2d-430a-b3dc-42f58d79be33'

const OPEN_STATUSES = ['new', 'open', 'in_progress', 'waiting', 'on_hold', 'pending']

// GET /api/customer/tickets?status=open|closed|all&venue=<id>&q=<search>
export async function GET(request: NextRequest) {
  try {
    const session = await getPortalSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const venueIds = await getPortalUserVenueIds(session)
    if (venueIds.length === 0) return NextResponse.json({ tickets: [], stats: { open: 0, closed: 0, total: 0 } })

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'all'
    const venue = searchParams.get('venue')
    const q = searchParams.get('q')

    const conditions = ['t.venue_id = ANY($1::uuid[])']
    const params: any[] = [venueIds]

    if (status === 'open') {
      conditions.push(`t.status <> 'closed' AND t.status <> 'resolved'`)
    } else if (status === 'closed') {
      conditions.push(`(t.status = 'closed' OR t.status = 'resolved')`)
    }
    if (venue) {
      params.push(venue)
      conditions.push(`t.venue_id = $${params.length}::uuid`)
    }
    if (q) {
      params.push(`%${q}%`)
      conditions.push(`(t.title ILIKE $${params.length} OR t.description ILIKE $${params.length} OR CAST(t.ticket_number AS TEXT) ILIKE $${params.length})`)
    }

    const ticketsResult = await query(
      `SELECT t.id, t.ticket_number, t.title, t.priority, t.status, t.category,
              t.created_at, t.updated_at, t.resolved_at,
              v.name AS venue_name,
              (SELECT COUNT(*)::int FROM ticket_comments tc
                WHERE tc.ticket_id = t.id AND tc.is_internal = false) AS comment_count
       FROM tickets t
       JOIN venues v ON v.id = t.venue_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY t.created_at DESC
       LIMIT 200`,
      params
    )

    const statsResult = await query(
      `SELECT
         COUNT(*) FILTER (WHERE status <> 'closed' AND status <> 'resolved')::int AS open,
         COUNT(*) FILTER (WHERE status = 'closed' OR status = 'resolved')::int AS closed,
         COUNT(*)::int AS total
       FROM tickets WHERE venue_id = ANY($1::uuid[])`,
      [venueIds]
    )

    return NextResponse.json({
      tickets: ticketsResult.rows,
      stats: statsResult.rows[0] || { open: 0, closed: 0, total: 0 },
    })
  } catch (err) {
    console.error('Customer tickets list error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/customer/tickets — submit a new ticket
export async function POST(request: NextRequest) {
  try {
    const session = await getPortalSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { venue_id, title, description, category, priority } = await request.json()
    if (!title || !venue_id) {
      return NextResponse.json({ error: 'Venue and title are required' }, { status: 400 })
    }

    const venueIds = await getPortalUserVenueIds(session)
    if (!venueIds.includes(venue_id)) {
      return NextResponse.json({ error: 'Venue not in your account' }, { status: 403 })
    }

    const result = await query(
      `INSERT INTO tickets (venue_id, title, description, category, priority, status,
                            created_by, source, contact_name, contact_email)
       VALUES ($1, $2, $3, $4, $5, 'new', $6, 'customer_portal', $7, $8)
       RETURNING id, ticket_number, title, category, priority, status, created_at`,
      [venue_id, title, description || '', category || 'general', priority || 'medium',
       PORTAL_SERVICE_STAFF_ID, session.fullName, session.email]
    )
    const ticket = result.rows[0]

    const venueResult = await query('SELECT name, slack_channel_id FROM venues WHERE id = $1', [venue_id])
    const venueName = venueResult.rows[0]?.name || 'Unknown venue'

    const channelId = venueResult.rows[0]?.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
    if (channelId) {
      const msg = formatTicketNotification({
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        title: ticket.title,
        category: category || 'general',
        priority: priority || 'medium',
        venue_name: venueName,
        description: description ? `${description}\n— submitted by ${session.fullName} (${session.email})` : `Submitted by ${session.fullName} (${session.email})`,
      }, 'created')
      msg.channel = channelId
      sendSlackMessage(msg)
    }

    sendTicketDistributionEmail({
      venueId: venue_id,
      ticketTitle: title,
      ticketNumber: ticket.ticket_number,
      type: 'created',
      detail: description || title,
    }).catch(err => console.error('[email] Customer ticket creation email failed:', err))

    return NextResponse.json({ ticket })
  } catch (err) {
    console.error('Customer ticket create error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
