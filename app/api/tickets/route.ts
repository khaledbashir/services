export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage, formatTicketNotification, sendTicketNotification } from '@/lib/slack'
import { syncTicketsToTwenty } from '@/lib/twenty-sync'
import { jwtVerify } from 'jose'
import * as fs from 'fs'
import * as path from 'path'
import { getAuthUser } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'
import { sendTicketDistributionEmail } from '@/lib/email'
import { normalizeAttachment } from '@/lib/ticket-attachments'

async function getUserFromToken(request: NextRequest) {
  const token = request.cookies.get('token')?.value
  if (!token) return null
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'anc-services-secret-key-change-me')
    const { payload } = await jwtVerify(token, secret)
    return payload as any
  } catch { return null }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const venueIdFilter = searchParams.get('venue_id')
    const staffIdFilter = searchParams.get('staff_id')

    const user = await getAuthUser(request)
    const venueIds = user ? await getStaffVenueIds(user.userId, user.role) : null
    const vf = buildVenueFilterClause(venueIds, 't.venue_id', 1)

    const conditions: string[] = []
    const params: any[] = [...vf.params]

    if (vf.clause) {
      conditions.push(vf.clause.replace(/^AND /, ''))
    }
    if (venueIdFilter) {
      params.push(venueIdFilter)
      conditions.push(`t.venue_id = $${params.length}`)
    }
    if (staffIdFilter) {
      params.push(staffIdFilter)
      conditions.push(`t.assigned_to = $${params.length}`)
    }

    const whereClause = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

    const result = await query(
      `SELECT t.id, t.ticket_number, t.title, t.description, t.priority, t.status, t.category, t.subcategory,
              t.resolution_notes, t.event_id, t.venue_id, t.assigned_to,
              t.created_at,
              COALESCE(t.source, 'web') as source,
              t.contact_phone, t.contact_name,
              v.name as venue_name,
              COALESCE(v.venue_type, 'sports') as venue_type,
              e.summary as event_name,
              s1.full_name as created_by_name,
              s2.full_name as assigned_to_name,
              TO_CHAR(t.created_at AT TIME ZONE 'America/New_York', 'Mon DD, YYYY') as created_date,
              TO_CHAR(t.created_at AT TIME ZONE 'America/New_York', 'HH12:MI AM') as created_time,
              TO_CHAR(t.updated_at AT TIME ZONE 'America/New_York', 'Mon DD, YYYY') as updated_date
       FROM tickets t
       LEFT JOIN venues v ON t.venue_id = v.id
       LEFT JOIN events e ON t.event_id = e.id
       LEFT JOIN staff s1 ON t.created_by = s1.id
       LEFT JOIN staff s2 ON t.assigned_to = s2.id
       ${whereClause}
       ORDER BY t.created_at DESC`,
      params
    )
    return NextResponse.json({ tickets: result.rows })
  } catch (err) {
    console.error('Error fetching tickets:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUserFromToken(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { venue_id, event_id, title, description, priority, assigned_to, category, status, resolution_notes, source, ticket_type, contact_name, contact_email, contact_phone, parent_ticket_id, image } = await request.json()
    if (!venue_id || !title) {
      return NextResponse.json({ error: 'venue_id and title are required' }, { status: 400 })
    }

    const allowedStatuses = ['new', 'on_hold', 'in_progress', 'escalated', 'closed'] as const
    const initialStatus = (allowedStatuses as readonly string[]).includes(status) ? status : 'new'

    // Auto-assignment: find matching rule if no assignee specified
    let effectiveAssignee = assigned_to || null
    if (!effectiveAssignee) {
      const ruleResult = await query(
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
        [category || 'general', venue_id]
      )
      if (ruleResult.rows.length > 0) {
        effectiveAssignee = ruleResult.rows[0].assign_to
      }
    }

    // SLA: calculate response and resolution deadlines
    const ticketPriority = priority || 'medium'
    const slaResult = await query(
      `SELECT response_hours, resolution_hours FROM sla_policies WHERE priority = $1 LIMIT 1`,
      [ticketPriority]
    )
    const sla = slaResult.rows[0]
    const now = new Date()
    const slaResponseDue = sla ? new Date(now.getTime() + sla.response_hours * 3600000) : null
    const slaResolutionDue = sla ? new Date(now.getTime() + sla.resolution_hours * 3600000) : null

    const result = await query(
      `INSERT INTO tickets (venue_id, event_id, created_by, assigned_to, title, description, priority, status, category, resolution_notes, sla_response_due, sla_resolution_due, source, ticket_type, contact_name, contact_email, contact_phone, parent_ticket_id, resolved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, ${initialStatus === 'closed' ? 'NOW()' : 'NULL'})
       RETURNING id, ticket_number, title, priority, status, category, source, ticket_type`,
      [venue_id, event_id || null, user.userId, effectiveAssignee, title, description || '', ticketPriority, initialStatus, category || 'general', resolution_notes || null, slaResponseDue, slaResolutionDue, source || 'web', ticket_type || 'support', contact_name || null, contact_email || null, contact_phone || null, parent_ticket_id || null]
    )

    // Save attachment if provided (image, video, PDF, doc). Always recorded
    // in ticket_attachments. tickets.image_url stays image-only because
    // Slack/portal/gallery consume it as a real image — using it for video
    // or PDF data would break those surfaces.
    let imageUrl: string | null = null
    const normalizedAttachment = normalizeAttachment(image)
    if (normalizedAttachment) {
      try {
        if (normalizedAttachment.mimeType.startsWith('image/')) {
          imageUrl = normalizedAttachment.imageUrl
          await query('UPDATE tickets SET image_url = $1 WHERE id = $2', [imageUrl, result.rows[0].id])
        }
        await query(
          `INSERT INTO ticket_attachments (ticket_id, filename, mime_type, image_url, uploaded_by, is_internal)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            result.rows[0].id,
            normalizedAttachment.filename,
            normalizedAttachment.mimeType,
            normalizedAttachment.imageUrl,
            user.userId,
            false,
          ]
        )
      } catch (err) { console.error('Attachment save failed:', err) }
    }

    // Get venue info for notification log
    const venueRes = await query('SELECT name FROM venues WHERE id = $1', [venue_id])
    const venueName = venueRes.rows[0]?.name || 'Unknown Venue'
    
    // Log creation to activity_log
    const ticket0 = result.rows[0]
    await query(
      `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
       VALUES ('ticket_created', 'ticket', $1, $2, $3)`,
      [ticket0.id, user.userId, JSON.stringify({
        entity_name: title,
        venue_name: venueName,
        priority: priority || 'medium',
        category: category || 'general',
      })]
    )

    // Write notification log for Claw
    const logEntry = `TICKET|created|${user.fullName || 'User'}|${title}|${venueName}|${new Date().toISOString()}\n`
    fs.appendFileSync('/tmp/anc-ticket-notifications.log', logEntry)

    // Notify venue's Slack channel (fallback to default channel)
    const slackChRes = await query('SELECT slack_channel_id FROM venues WHERE id = $1', [venue_id])
    const channelId = slackChRes.rows[0]?.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
    if (channelId) {
      const ticket = result.rows[0]
      sendTicketNotification({
        id: ticket.id,
        ticket_number: ticket.ticket_number,
        title: ticket.title,
        category: ticket.category,
        priority: ticket.priority,
        venue_name: venueName,
        description: description || undefined,
        image_url: imageUrl || undefined,
      }, 'created', channelId)
    }

    // Email distribution list
    const ticket = result.rows[0]
    sendTicketDistributionEmail({
      venueId: venue_id,
      ticketTitle: title,
      ticketNumber: ticket.ticket_number,
      type: 'created',
      detail: description || title,
    }).catch(err => console.error('[email] Ticket creation email failed:', err))

    syncTicketsToTwenty([{
      id: ticket.id,
      title: ticket.title,
      ticket_number: ticket.ticket_number,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      venue_name: venueName,
      venue_id: venue_id,
      assigned_to: effectiveAssignee || '',
      description: description || '',
      resolution_notes: resolution_notes || '',
    }]).catch(err => console.error('[twenty] real-time ticket sync failed:', err))

    return NextResponse.json({ ticket: result.rows[0] })
  } catch (err) {
    console.error('Error creating ticket:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
