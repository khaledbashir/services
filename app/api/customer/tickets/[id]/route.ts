export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getPortalSession, getPortalUserVenueIds } from '@/lib/portal-auth'
import { notifyOps } from '@/lib/slack'
import { normalizeAttachment } from '@/lib/ticket-attachments'

const PORTAL_SERVICE_STAFF_ID = '7fb556c3-5d2d-430a-b3dc-42f58d79be33'

async function loadScopedTicket(ticketId: string, venueIds: string[]) {
  const result = await query(
    `SELECT t.id, t.ticket_number, t.title, t.description, t.category, t.subcategory, t.priority,
            t.status, t.resolution_notes, t.image_url, t.created_at, t.updated_at,
            t.resolved_at, t.venue_id, v.name AS venue_name, v.slack_channel_id
     FROM tickets t
     JOIN venues v ON v.id = t.venue_id
     WHERE t.id = $1 AND t.venue_id = ANY($2::uuid[])`,
    [ticketId, venueIds]
  )
  return result.rows[0] || null
}

// GET /api/customer/tickets/:id — detail + external thread
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getPortalSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const venueIds = await getPortalUserVenueIds(session)
    if (venueIds.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ticket = await loadScopedTicket(params.id, venueIds)
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const [commentsResult, attachmentsResult] = await Promise.all([
      query(
        `SELECT tc.id, tc.body, tc.created_at,
                CASE
                  WHEN tc.source_channel = 'email'
                    THEN COALESCE(
                      NULLIF(tc.author_name, ''),
                      NULLIF(tc.author_email, ''),
                      NULLIF(t.contact_name, ''),
                      NULLIF(t.contact_email, ''),
                      s.full_name,
                      'ANC Support'
                    )
                  ELSE COALESCE(NULLIF(tc.author_name, ''), s.full_name, 'ANC Support')
                END AS author,
                (
                  NULLIF(tc.author_name, '') IS NOT NULL
                  OR (
                    tc.source_channel = 'email'
                    AND tc.author_id = $2::uuid
                  )
                ) AS is_customer,
                CASE
                  WHEN tc.source_channel = 'email' THEN 'Email response'
                  ELSE 'Ticket Update'
                END AS source_label
         FROM ticket_comments tc
         JOIN tickets t ON t.id = tc.ticket_id
         LEFT JOIN staff s ON tc.author_id = s.id
         WHERE tc.ticket_id = $1 AND tc.is_internal = false
         ORDER BY tc.created_at ASC`,
        [params.id, PORTAL_SERVICE_STAFF_ID]
      ),
      query(
        `SELECT id, comment_id, filename, mime_type, image_url, caption, created_at
         FROM ticket_attachments
         WHERE ticket_id = $1 AND is_internal = false
         ORDER BY created_at ASC`,
        [params.id]
      ),
    ])

    return NextResponse.json({
      ticket,
      comments: commentsResult.rows,
      attachments: attachmentsResult.rows,
    })
  } catch (err) {
    console.error('Customer ticket detail error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/customer/tickets/:id — add a reply to the thread
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getPortalSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const venueIds = await getPortalUserVenueIds(session)
    if (venueIds.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ticket = await loadScopedTicket(params.id, venueIds)
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const { body, attachment, image, caption } = await request.json()
    const normalizedAttachment = normalizeAttachment(attachment ?? image)
    const commentBody = typeof body === 'string' ? body.trim() : ''
    if (!commentBody && !normalizedAttachment) {
      return NextResponse.json({ error: 'Reply or attachment required' }, { status: 400 })
    }

    const comment = await query(
      `INSERT INTO ticket_comments (
         ticket_id, author_id, author_name, author_email, body, is_internal, source_channel
       )
       VALUES ($1, $2, $3, $4, $5, false, 'ticket_update')
       RETURNING id, body, created_at`,
      [
        params.id,
        PORTAL_SERVICE_STAFF_ID,
        `${session.fullName} (${session.clientName || 'Customer'})`,
        session.email,
        commentBody || (caption ? `Attachment: ${caption}` : 'Attachment added'),
      ]
    )
    if (normalizedAttachment) {
      await query(
        `INSERT INTO ticket_attachments (ticket_id, comment_id, filename, mime_type, image_url, caption, uploaded_by, is_internal)
         VALUES ($1, $2, $3, $4, $5, $6, $7, false)`,
        [
          params.id,
          comment.rows[0].id,
          normalizedAttachment.filename,
          normalizedAttachment.mimeType,
          normalizedAttachment.imageUrl,
          typeof caption === 'string' ? caption.trim().slice(0, 500) || null : null,
          PORTAL_SERVICE_STAFF_ID,
        ]
      )
    }

    const caseNum = String(ticket.ticket_number).padStart(8, '0')
    const preview = commentBody || (normalizedAttachment ? `Attachment added: ${normalizedAttachment.filename || normalizedAttachment.mimeType}` : '')
    notifyOps(
      ':speech_balloon:',
      `*Customer reply* from ${session.fullName} on Case #${caseNum} (${ticket.venue_name}):\n> ${preview.substring(0, 200)}${preview.length > 200 ? '...' : ''}`,
      { label: 'View Ticket', url: `https://services.ancsports.net/tickets/${ticket.id}` },
      ticket.slack_channel_id
    )

    return NextResponse.json({
      comment: {
        ...comment.rows[0],
        author: `${session.fullName} (${session.clientName || 'Customer'})`,
        is_customer: true,
        source_label: 'Ticket Update',
      },
    })
  } catch (err) {
    console.error('Customer comment error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
