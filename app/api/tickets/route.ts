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

    const result = await query(
      `INSERT INTO tickets (venue_id, event_id, created_by, assigned_to, title, description, priority, status, category, resolution_notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'open', $8, $9)
       RETURNING id, ticket_number, title, priority, status, category`,
      [venue_id, event_id || null, user.userId, assigned_to || null, title, description || '', priority || 'medium', category || 'general', resolution_notes || null]
    )

    // Get venue info for notification log
    const venueRes = await query('SELECT name FROM venues WHERE id = $1', [venue_id])
    const venueName = venueRes.rows[0]?.name || 'Unknown Venue'
    
    // Write notification log for Claw
    const logEntry = `TICKET|created|${user.fullName || 'User'}|${title}|${venueName}|${new Date().toISOString()}\n`
    fs.appendFileSync('/tmp/anc-ticket-notifications.log', logEntry)

    // Notify venue's Slack channel
    const slackChRes = await query('SELECT slack_channel_id FROM venues WHERE id = $1', [venue_id])
    const channelId = slackChRes.rows[0]?.slack_channel_id
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
