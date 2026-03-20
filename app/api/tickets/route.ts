import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage, formatTicketNotification } from '@/lib/slack'
import { jwtVerify } from 'jose'
import * as fs from 'fs'
import * as path from 'path'

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
    const result = await query(
      `SELECT t.id, t.ticket_number, t.title, t.description, t.priority, t.status, t.category,
              t.resolution_notes, t.event_id,
              v.name as venue_name, 
              e.summary as event_name,
              s1.full_name as created_by_name,
              s2.full_name as assigned_to_name,
              TO_CHAR(t.created_at, 'Mon DD, YYYY') as created_date,
              TO_CHAR(t.updated_at, 'Mon DD, YYYY') as updated_date
       FROM tickets t
       LEFT JOIN venues v ON t.venue_id = v.id
       LEFT JOIN events e ON t.event_id = e.id
       LEFT JOIN staff s1 ON t.created_by = s1.id
       LEFT JOIN staff s2 ON t.assigned_to = s2.id
       ORDER BY t.created_at DESC`
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

    const { venue_id, event_id, title, description, priority, assigned_to, category, resolution_notes } = await request.json()
    if (!venue_id || !title) {
      return NextResponse.json({ error: 'venue_id and title are required' }, { status: 400 })
    }

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
      `INSERT INTO tickets (venue_id, event_id, created_by, assigned_to, title, description, priority, status, category, resolution_notes, sla_response_due, sla_resolution_due)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8, $9, $10, $11)
       RETURNING id, ticket_number, title, priority, status, category`,
      [venue_id, event_id || null, user.userId, effectiveAssignee, title, description || '', ticketPriority, category || 'general', resolution_notes || null, slaResponseDue, slaResolutionDue]
    )

    // Get venue info for notification log
    const venueRes = await query('SELECT name FROM venues WHERE id = $1', [venue_id])
    const venueName = venueRes.rows[0]?.name || 'Unknown Venue'
    
    // Write notification log for Claw
    const logEntry = `TICKET|created|${user.fullName || 'User'}|${title}|${venueName}|${new Date().toISOString()}\n`
    fs.appendFileSync('/tmp/anc-ticket-notifications.log', logEntry)

    // Notify venue's Slack channel (fallback to default channel)
    const slackChRes = await query('SELECT slack_channel_id FROM venues WHERE id = $1', [venue_id])
    const channelId = slackChRes.rows[0]?.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
    if (channelId) {
      const ticket = result.rows[0]
      const msg = formatTicketNotification({
        ticket_number: ticket.ticket_number,
        title: ticket.title,
        category: ticket.category,
        priority: ticket.priority,
        venue_name: venueName,
        description: description || undefined,
      }, 'created')
      msg.channel = channelId
      sendSlackMessage(msg)
    }

    return NextResponse.json({ ticket: result.rows[0] })
  } catch (err) {
    console.error('Error creating ticket:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
