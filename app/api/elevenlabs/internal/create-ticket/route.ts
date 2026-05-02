import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import { query as dbQuery } from '@/lib/db'
import { sendSlackMessage, formatTicketNotification } from '@/lib/slack'
import { syncTicketsToTwenty } from '@/lib/twenty-sync'
import { sendTicketDistributionEmail } from '@/lib/email'
import { authorizeVoiceCall, cleanQuery } from '@/lib/elevenlabs-internal-auth'

const PROD_BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://services.ancsports.net'

async function resolveVenueByName(query: string) {
  const cleaned = query.trim()
  if (!cleaned) return null
  const exact = await dbQuery(
    `SELECT id, name FROM venues WHERE LOWER(name) = LOWER($1) LIMIT 1`,
    [cleaned]
  )
  if (exact.rows.length) return exact.rows[0]
  const fuzzy = await dbQuery(
    `SELECT id, name
     FROM venues
     WHERE name ILIKE $1
     ORDER BY CASE WHEN LOWER(name) = LOWER($2) THEN 0
                   WHEN LOWER(name) LIKE LOWER($2) || '%' THEN 1
                   ELSE 2 END,
              LENGTH(name) ASC
     LIMIT 1`,
    [`%${cleaned}%`, cleaned]
  )
  return fuzzy.rows[0] || null
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json_body' }, { status: 400 })
  }

  const auth = await authorizeVoiceCall(request, typeof body.staff_email === 'string' ? body.staff_email : null)
  if (!auth.ok) return auth.response

  if (!auth.staff) {
    return NextResponse.json(
      { ok: false, error: 'staff_email_unrecognized', voiceBrief: 'I cannot create a ticket without a recognized staff identity. Tell the dashboard who is calling and try again.' },
      { status: 400 }
    )
  }

  const venueQuery = cleanQuery(typeof body.venue === 'string' ? body.venue : '', 80)
  const title = cleanQuery(typeof body.title === 'string' ? body.title : '', 200)
  const description = cleanQuery(typeof body.description === 'string' ? body.description : '', 2000)
  const priorityRaw = cleanQuery(typeof body.priority === 'string' ? body.priority : '', 20).toLowerCase()
  const category = cleanQuery(typeof body.category === 'string' ? body.category : '', 40).toLowerCase() || 'general'

  if (!venueQuery) {
    return NextResponse.json({ ok: false, error: 'venue_required', voiceBrief: 'I need the venue name to file the ticket.' }, { status: 400 })
  }
  if (!title) {
    return NextResponse.json({ ok: false, error: 'title_required', voiceBrief: 'I need a one-line title for the ticket.' }, { status: 400 })
  }

  const allowedPriority = ['low', 'medium', 'high', 'urgent']
  const priority = allowedPriority.includes(priorityRaw) ? priorityRaw : 'medium'

  try {
    const venue = await resolveVenueByName(venueQuery)
    if (!venue) {
      return NextResponse.json(
        {
          ok: false,
          error: 'venue_not_found',
          query: venueQuery,
          voiceBrief: `I could not match a venue named "${venueQuery}". Confirm the venue and try again.`,
        },
        { status: 404 }
      )
    }

    const ruleResult = await dbQuery(
      `SELECT assign_to FROM assignment_rules
       WHERE is_active = true
         AND (category IS NULL OR category = $1)
         AND (venue_id IS NULL OR venue_id = $2)
       ORDER BY
         CASE WHEN venue_id IS NOT NULL AND category IS NOT NULL THEN 1
              WHEN venue_id IS NOT NULL THEN 2
              WHEN category IS NOT NULL THEN 3
              ELSE 4 END,
         priority DESC
       LIMIT 1`,
      [category, venue.id]
    )
    const effectiveAssignee = ruleResult.rows[0]?.assign_to || null

    const slaResult = await dbQuery(
      `SELECT response_hours, resolution_hours FROM sla_policies WHERE priority = $1 LIMIT 1`,
      [priority]
    )
    const sla = slaResult.rows[0]
    const now = new Date()
    const slaResponseDue = sla ? new Date(now.getTime() + sla.response_hours * 3600000) : null
    const slaResolutionDue = sla ? new Date(now.getTime() + sla.resolution_hours * 3600000) : null

    const insert = await dbQuery(
      `INSERT INTO tickets
        (venue_id, created_by, assigned_to, title, description, priority, status, category,
         sla_response_due, sla_resolution_due, source, ticket_type)
       VALUES ($1, $2, $3, $4, $5, $6, 'new', $7, $8, $9, 'voice', 'support')
       RETURNING id, ticket_number, title, priority, status, category`,
      [venue.id, auth.staff.id, effectiveAssignee, title, description, priority, category, slaResponseDue, slaResolutionDue]
    )
    const ticket = insert.rows[0]

    await dbQuery(
      `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
       VALUES ('ticket_created', 'ticket', $1, $2, $3)`,
      [ticket.id, auth.staff.id, JSON.stringify({
        entity_name: title,
        venue_name: venue.name,
        priority,
        category,
        source: 'voice',
      })]
    )

    let assigneeName: string | null = null
    if (effectiveAssignee) {
      const a = await dbQuery(`SELECT full_name FROM staff WHERE id = $1`, [effectiveAssignee])
      assigneeName = a.rows[0]?.full_name || null
    }

    try {
      const logEntry = `TICKET|created|${auth.staff.fullName}|${title}|${venue.name}|${new Date().toISOString()}\n`
      fs.appendFileSync('/tmp/anc-ticket-notifications.log', logEntry)
    } catch (err) {
      console.error('[voice] notif log append failed:', err)
    }

    const channelRow = await dbQuery('SELECT slack_channel_id FROM venues WHERE id = $1', [venue.id])
    const channelId = channelRow.rows[0]?.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
    if (channelId) {
      const msg = formatTicketNotification({
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        title: ticket.title,
        category: ticket.category,
        priority: ticket.priority,
        venue_name: venue.name,
        description: description || undefined,
      }, 'created')
      msg.channel = channelId
      sendSlackMessage(msg).catch(err => console.error('[voice] slack notify failed:', err))
    }

    sendTicketDistributionEmail({
      venueId: venue.id,
      ticketTitle: title,
      ticketNumber: ticket.ticket_number,
      type: 'created',
      detail: description || title,
    }).catch(err => console.error('[voice] dist email failed:', err))

    syncTicketsToTwenty([{
      id: ticket.id,
      title: ticket.title,
      ticket_number: ticket.ticket_number,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      venue_name: venue.name,
      venue_id: venue.id,
      assigned_to: effectiveAssignee || '',
      description: description || '',
      resolution_notes: '',
    }]).catch(err => console.error('[voice] twenty sync failed:', err))

    const ticketLabel = String(ticket.ticket_number).padStart(4, '0')
    const url = `${PROD_BASE}/tickets/${ticket.id}`
    const voiceBrief = [
      `Ticket ${ticketLabel} created for ${venue.name}.`,
      assigneeName ? `Assigned to ${assigneeName}.` : 'Unassigned — auto-routing rule did not match, ops will pick it up.',
      `Priority ${priority}. Slack notified.`,
    ].join(' ')

    return NextResponse.json({
      ok: true,
      created: true,
      caller: auth.staff.fullName,
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        ticketLabel,
        title: ticket.title,
        venue: venue.name,
        venueId: venue.id,
        priority: ticket.priority,
        status: ticket.status,
        category: ticket.category,
        assignedTo: assigneeName,
        url,
      },
      voiceBrief,
    })
  } catch (error) {
    console.error('voice create-ticket error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'create_failed' },
      { status: 500 }
    )
  }
}
