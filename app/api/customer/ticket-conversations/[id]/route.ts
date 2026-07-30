export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getPortalSession, getPortalUserVenueIds } from '@/lib/portal-auth'

interface SenderIdentity {
  email: string
  displayName: string
}

interface CommentRow {
  id: string
  body: string
  created_at: string
  author_name: string | null
  author_email: string | null
  source_channel: string
  twenty_message_id: string | null
  staff_name: string | null
  activity_sender: string | null
}

const EMAIL_ADDRESS_PATTERN = /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

function normalizeEmail(value: string | null | undefined): string {
  return value?.match(EMAIL_ADDRESS_PATTERN)?.[0]?.trim().toLowerCase() || ''
}

function usableDisplayName(value: string | null | undefined): string {
  const name = value?.trim() || ''
  if (!name || normalizeEmail(name) === name.toLowerCase()) return ''
  return name
}

function parseSenderText(value: string | null | undefined): SenderIdentity | null {
  const text = value?.trim() || ''
  if (!text) return null
  const email = normalizeEmail(text)
  const parenthesizedName = text.match(/^Email from\s+(.+?)\s*\(/i)?.[1]
  const angleName = text.match(/^\s*(.+?)\s*<[^>]+>/)?.[1]
  const activityName = text.match(/^\s*(.+?)\s*\([^)]*@[^)]*\)\s*$/)?.[1]
  return {
    email,
    displayName: usableDisplayName(parenthesizedName || angleName || activityName),
  }
}

function senderFromStoredComment(comment: CommentRow): SenderIdentity | null {
  const header = comment.body.match(/^Email from[^\n]*/i)?.[0]
    || comment.body.match(/^From:\s*.+$/im)?.[0]
  const parsed = parseSenderText(comment.activity_sender) || parseSenderText(header)
  const email = normalizeEmail(comment.author_email) || parsed?.email || ''
  const storedAuthorIsStaff = Boolean(
    comment.author_name
    && comment.staff_name
    && comment.author_name.trim() === comment.staff_name.trim()
  )
  const displayName = (storedAuthorIsStaff ? '' : usableDisplayName(comment.author_name))
    || parsed?.displayName
    || ''
  return email || displayName ? { email, displayName } : null
}

function isInboundEmail(comment: CommentRow): boolean {
  return Boolean(comment.twenty_message_id)
    || Boolean(comment.activity_sender)
    || /^Email from\b/i.test(comment.body)
}

async function fetchMessageSender(messageId: string): Promise<SenderIdentity | null> {
  const baseUrl = (process.env.TWENTY_API_URL || '').replace(/\/$/, '')
  const apiKey = process.env.TWENTY_API_KEY || process.env.TWENTY_API_TOKEN || ''
  if (!baseUrl || !apiKey) {
    console.warn(`[customer-ticket-conversation] Cannot resolve sender for message ${messageId}: CRM API configuration is unavailable`)
    return null
  }

  try {
    const response = await fetch(`${baseUrl}/graphql`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `query ResolveCustomerEmailSender($id: UUID!) {
          message(filter: { id: { eq: $id } }) {
            messageParticipants { edges { node { role handle displayName } } }
          }
        }`,
        variables: { id: messageId },
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!response.ok) {
      throw new Error(`CRM sender lookup returned ${response.status}`)
    }
    const payload = await response.json()
    if (payload.errors) throw new Error('CRM sender lookup returned GraphQL errors')
    const participants = payload.data?.message?.messageParticipants?.edges || []
    const sender = participants
      .map((edge: any) => edge?.node)
      .find((participant: any) => participant?.role === 'FROM')
    if (!sender) return null
    return {
      email: normalizeEmail(sender.handle),
      displayName: usableDisplayName(sender.displayName),
    }
  } catch (error) {
    console.error(`[customer-ticket-conversation] Sender lookup failed for message ${messageId}:`, error)
    return null
  }
}

async function resolveKnownContactName(
  email: string,
  ticketId: string,
  venueId: string
): Promise<string> {
  if (!email) return ''
  const result = await query(
    `SELECT name
     FROM (
       SELECT pu.full_name AS name, 1 AS priority
       FROM portal_users pu
       WHERE LOWER(pu.email) = $1

       UNION ALL

       SELECT t.contact_name AS name, 2 AS priority
       FROM tickets t
       WHERE t.id = $2 AND LOWER(COALESCE(t.contact_email, '')) = $1

       UNION ALL

       SELECT v.primary_contact_name AS name, 3 AS priority
       FROM venues v
       WHERE v.id = $3 AND LOWER(COALESCE(v.primary_contact_email, '')) = $1

       UNION ALL

       SELECT c.primary_contact_name AS name, 4 AS priority
       FROM client_venues cv
       JOIN clients c ON c.id = cv.client_id
       WHERE cv.venue_id = $3 AND LOWER(COALESCE(c.primary_contact_email, '')) = $1
     ) known_contact
     WHERE NULLIF(BTRIM(name), '') IS NOT NULL
     ORDER BY priority
     LIMIT 1`,
    [email, ticketId, venueId]
  )
  return result.rows[0]?.name?.trim() || ''
}

async function resolveInboundComment(
  comment: CommentRow,
  ticket: { id: string; venue_id: string }
) {
  let sender = senderFromStoredComment(comment)
  if ((!sender?.email || !sender.displayName) && comment.twenty_message_id) {
    const sourceSender = await fetchMessageSender(comment.twenty_message_id)
    if (sourceSender) {
      sender = {
        email: sender?.email || sourceSender.email,
        displayName: sender?.displayName || sourceSender.displayName,
      }
    }
  }

  const knownContactName = await resolveKnownContactName(sender?.email || '', ticket.id, ticket.venue_id)
  const author = knownContactName
    || sender?.displayName
    || sender?.email
    || 'Client reply — sender unavailable'

  try {
    await query(
      `UPDATE ticket_comments
       SET source_channel = 'email',
           author_email = CASE
             WHEN NULLIF(BTRIM(COALESCE(author_email, '')), '') IS NULL THEN NULLIF($2, '')
             ELSE author_email
           END,
           author_name = $3
       WHERE id = $1`,
      [comment.id, sender?.email || '', author]
    )
  } catch (error) {
    console.error(`[customer-ticket-conversation] Could not persist sender metadata for comment ${comment.id}:`, error)
  }

  return {
    id: comment.id,
    body: comment.body,
    created_at: comment.created_at,
    author,
    is_customer: true,
    source_label: 'Email response' as const,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getPortalSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const venueIds = await getPortalUserVenueIds(session)
    if (venueIds.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const ticketResult = await query(
      `SELECT t.id, t.ticket_number, t.title, t.description, t.category, t.subcategory,
              t.priority, t.status, t.resolution_notes, t.image_url, t.created_at,
              t.updated_at, t.resolved_at, t.venue_id, v.name AS venue_name
       FROM tickets t
       JOIN venues v ON v.id = t.venue_id
       WHERE t.id = $1 AND t.venue_id = ANY($2::uuid[])`,
      [params.id, venueIds]
    )
    const ticket = ticketResult.rows[0]
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const [commentsResult, attachmentsResult] = await Promise.all([
      query(
        `SELECT tc.id, tc.body, tc.created_at, tc.author_name, tc.author_email,
                tc.source_channel, tc.twenty_message_id, staff_author.full_name AS staff_name,
                email_activity.details->>'from' AS activity_sender
         FROM ticket_comments tc
         LEFT JOIN staff staff_author ON staff_author.id = tc.author_id
         LEFT JOIN LATERAL (
           SELECT al.details
           FROM activity_log al
           WHERE al.entity_type = 'ticket'
             AND al.entity_id = tc.ticket_id
             AND al.action = 'email_reply'
             AND ABS(EXTRACT(EPOCH FROM (al.created_at - tc.created_at))) <= 30
             AND tc.id = (
               SELECT matched_comment.id
               FROM ticket_comments matched_comment
               WHERE matched_comment.ticket_id = al.entity_id
                 AND matched_comment.is_internal = false
                 AND matched_comment.deleted_at IS NULL
                 AND ABS(EXTRACT(EPOCH FROM (al.created_at - matched_comment.created_at))) <= 30
               ORDER BY ABS(EXTRACT(EPOCH FROM (al.created_at - matched_comment.created_at)))
               LIMIT 1
             )
           ORDER BY ABS(EXTRACT(EPOCH FROM (al.created_at - tc.created_at)))
           LIMIT 1
         ) email_activity ON TRUE
         WHERE tc.ticket_id = $1
           AND tc.is_internal = false
           AND tc.deleted_at IS NULL
         ORDER BY tc.created_at ASC`,
        [params.id]
      ),
      query(
        `SELECT id, comment_id, filename, mime_type, image_url, caption, created_at
         FROM ticket_attachments
         WHERE ticket_id = $1 AND is_internal = false
         ORDER BY created_at ASC`,
        [params.id]
      ),
    ])

    const comments = await Promise.all(commentsResult.rows.map(async (comment: CommentRow) => {
      if (isInboundEmail(comment)) return resolveInboundComment(comment, ticket)
      return {
        id: comment.id,
        body: comment.body,
        created_at: comment.created_at,
        author: usableDisplayName(comment.author_name) || comment.staff_name || 'ANC Support',
        is_customer: Boolean(usableDisplayName(comment.author_name)),
        source_label: 'Ticket Update' as const,
      }
    }))

    return NextResponse.json({
      ticket,
      comments,
      attachments: attachmentsResult.rows,
    })
  } catch (error) {
    console.error('Customer ticket conversation error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
