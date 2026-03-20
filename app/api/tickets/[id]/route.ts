import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'
import { jwtVerify } from 'jose'
import * as fs from 'fs'

async function getUserFromToken(request: NextRequest) {
  const token = request.cookies.get('token')?.value
  if (!token) return null
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'anc-services-secret-key-change-me')
    const { payload } = await jwtVerify(token, secret)
    return payload as any
  } catch { return null }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const ticketResult = await query(
      `SELECT t.id, t.ticket_number, t.title, t.description, t.priority, t.status,
              t.category, t.resolution_notes, t.event_id,
              t.venue_id, v.name as venue_name,
              e.summary as event_name,
              s1.full_name as created_by_name, t.created_by,
              s2.full_name as assigned_to_name, t.assigned_to,
              TO_CHAR(t.created_at, 'Mon DD, YYYY HH12:MI AM') as created_date,
              TO_CHAR(t.updated_at, 'Mon DD, YYYY HH12:MI AM') as updated_date,
              TO_CHAR(t.resolved_at, 'Mon DD, YYYY HH12:MI AM') as resolved_date
       FROM tickets t
       LEFT JOIN venues v ON t.venue_id = v.id
       LEFT JOIN events e ON t.event_id = e.id
       LEFT JOIN staff s1 ON t.created_by = s1.id
       LEFT JOIN staff s2 ON t.assigned_to = s2.id
       WHERE t.id = $1`,
      [params.id]
    )

    if (ticketResult.rows.length === 0) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const commentsResult = await query(
      `SELECT tc.id, tc.body, tc.is_internal,
              s.full_name as author_name,
              TO_CHAR(tc.created_at, 'Mon DD, YYYY HH12:MI AM') as created_date
       FROM ticket_comments tc
       LEFT JOIN staff s ON tc.author_id = s.id
       WHERE tc.ticket_id = $1
       ORDER BY tc.created_at ASC`,
      [params.id]
    )

    const activityResult = await query(
      `SELECT action, staff_id, details, created_at
       FROM activity_log
       WHERE entity_type = 'ticket' AND entity_id = $1
       ORDER BY created_at ASC`,
      [params.id]
    )

    return NextResponse.json({
      ticket: ticketResult.rows[0],
      comments: commentsResult.rows,
      activity: activityResult.rows || []
    })
  } catch (err) {
    console.error('Error fetching ticket:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromToken(request)
    const { status, priority, assigned_to, category, resolution_notes } = await request.json()
    
    // Get current ticket state for logging
    const current = await query('SELECT status, priority, assigned_to, title, venue_id, category FROM tickets WHERE id = $1', [params.id])
    const oldTicket = current.rows[0]
    
    // Get venue name for activity log
    let venueName = ''
    if (oldTicket?.venue_id) {
      const v = await query('SELECT name FROM venues WHERE id = $1', [oldTicket.venue_id])
      venueName = v.rows[0]?.name || ''
    }

    const updates: string[] = []
    const values: any[] = []
    let idx = 1

    if (status) { updates.push(`status = $${idx++}`); values.push(status) }
    if (priority) { updates.push(`priority = $${idx++}`); values.push(priority) }
    if (category) { updates.push(`category = $${idx++}`); values.push(category) }
    if (resolution_notes !== undefined) { updates.push(`resolution_notes = $${idx++}`); values.push(resolution_notes) }
    if (assigned_to !== undefined) { updates.push(`assigned_to = $${idx++}`); values.push(assigned_to || null) }
    
    updates.push(`updated_at = NOW()`)
    if (status === 'resolved' || status === 'closed') updates.push(`resolved_at = NOW()`)

    values.push(params.id)
    const result = await query(
      `UPDATE tickets SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, ticket_number, status, priority, category, resolution_notes`,
      values
    )

    // Log status changes to activity_log
    if (status && oldTicket && status !== oldTicket.status) {
      await query(
        `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details) 
         VALUES ('ticket_status_change', 'ticket', $1, $2, $3)`,
        [params.id, user?.userId || null, JSON.stringify({
          entity_name: oldTicket.title,
          venue_name: venueName,
          old_status: oldTicket.status,
          new_status: status,
        })]
      )

      // Write notification log for Claw
      const logEntry = `TICKET|status_changed|${user?.fullName || 'User'}|${oldTicket.title}|${venueName}|from ${oldTicket.status} to ${status}|${new Date().toISOString()}\n`
      fs.appendFileSync('/tmp/anc-ticket-notifications.log', logEntry)

      // Notify venue's Slack channel
      const slackChRes = await query('SELECT slack_channel_id FROM venues WHERE id = $1', [oldTicket.venue_id])
      const channelId = slackChRes.rows[0]?.slack_channel_id
      if (channelId) {
        const action = status === 'resolved' || status === 'closed' ? 'resolved' : 'updated'
        const emoji = action === 'resolved' ? ':white_check_mark:' : ':pencil2:'
        sendSlackMessage({
          channel: channelId,
          text: `${emoji} Ticket #${oldTicket.ticket_number} ${action}: ${oldTicket.title}`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `${emoji} *Ticket #${oldTicket.ticket_number} ${action}*\n*${oldTicket.title}*\nStatus: ${oldTicket.status} → ${status}` } },
          ],
        })
      }
    }

    // Log assignment changes
    if (assigned_to !== undefined && oldTicket && assigned_to !== oldTicket.assigned_to) {
      const staffRes = await query('SELECT full_name FROM staff WHERE id = $1', [assigned_to])
      const assignedName = staffRes.rows[0]?.full_name || 'Unassigned'
      
      await query(
        `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details) 
         VALUES ('ticket_assigned', 'ticket', $1, $2, $3)`,
        [params.id, user?.userId || null, JSON.stringify({
          entity_name: oldTicket.title,
          venue_name: venueName,
          assigned_to: assignedName,
        })]
      )

      // Write notification log for Claw
      const logEntry = `TICKET|assigned|${user?.fullName || 'User'}|${oldTicket.title}|${venueName}|to ${assignedName}|${new Date().toISOString()}\n`
      fs.appendFileSync('/tmp/anc-ticket-notifications.log', logEntry)
    }

    // Log category changes
    if (category && oldTicket && category !== oldTicket.category) {
      await query(
        `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details) 
         VALUES ('ticket_category_change', 'ticket', $1, $2, $3)`,
        [params.id, user?.userId || null, JSON.stringify({
          entity_name: oldTicket.title,
          venue_name: venueName,
          old_category: oldTicket.category,
          new_category: category,
        })]
      )
    }

    return NextResponse.json({ ticket: result.rows[0] })
  } catch (err) {
    console.error('Error updating ticket:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
