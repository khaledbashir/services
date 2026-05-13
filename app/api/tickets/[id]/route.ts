export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'
import { jwtVerify } from 'jose'
import * as fs from 'fs'
import { sendTicketDistributionEmail } from '@/lib/email'
import { syncTicketsToTwenty } from '@/lib/twenty-sync'

const statusLabels: Record<string, string> = {
  new: 'New', on_hold: 'On Hold', in_progress: 'In Progress',
  escalated: 'Escalated', closed: 'Closed',
}
function fmtStatus(s: string) { return statusLabels[s] || s }

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
              t.venue_id, v.name as venue_name, v.primary_contact_email as venue_contact_email,
              COALESCE(array_length(v.distribution_emails, 1), 0) as venue_distribution_count,
              e.summary as event_name,
              s1.full_name as created_by_name, t.created_by,
              s2.full_name as assigned_to_name, t.assigned_to,
              TO_CHAR(t.created_at AT TIME ZONE 'America/New_York', 'Mon DD, YYYY HH12:MI AM') as created_date,
              TO_CHAR(t.updated_at AT TIME ZONE 'America/New_York', 'Mon DD, YYYY HH12:MI AM') as updated_date,
              TO_CHAR(t.resolved_at AT TIME ZONE 'America/New_York', 'Mon DD, YYYY HH12:MI AM') as resolved_date,
              t.sla_response_due, t.sla_resolution_due,
              t.sla_response_met, t.sla_resolution_met, t.first_response_at,
              t.original_message,
              COALESCE(t.source, 'web') as source,
              COALESCE(t.ticket_type, 'support') as ticket_type,
              t.contact_name, t.contact_email, t.contact_phone,
              t.parent_ticket_id, t.sf_case_number, t.image_url,
              pt.ticket_number as parent_ticket_number, pt.title as parent_ticket_title,
              t.merged_into_ticket_id,
              mt.ticket_number as merged_into_ticket_number, mt.title as merged_into_title,
              (SELECT COALESCE(array_agg(mfrom.ticket_number ORDER BY mfrom.ticket_number), ARRAY[]::int[])
                 FROM tickets mfrom WHERE mfrom.merged_into_ticket_id = t.id) as merged_from_numbers
       FROM tickets t
       LEFT JOIN venues v ON t.venue_id = v.id
       LEFT JOIN events e ON t.event_id = e.id
       LEFT JOIN staff s1 ON t.created_by = s1.id
       LEFT JOIN staff s2 ON t.assigned_to = s2.id
       LEFT JOIN tickets pt ON t.parent_ticket_id = pt.id
       LEFT JOIN tickets mt ON t.merged_into_ticket_id = mt.id
       WHERE t.id = $1`,
      [params.id]
    )

    if (ticketResult.rows.length === 0) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }

    const commentsResult = await query(
      `SELECT tc.id, tc.body, tc.is_internal,
              s.full_name as author_name,
              TO_CHAR(tc.created_at AT TIME ZONE 'America/New_York', 'Mon DD, YYYY HH12:MI AM') as created_date
       FROM ticket_comments tc
       LEFT JOIN staff s ON tc.author_id = s.id
       WHERE tc.ticket_id = $1
       ORDER BY tc.created_at ASC`,
      [params.id]
    )

    const attachmentsResult = await query(
      `SELECT
         ta.id,
         ta.ticket_id,
         ta.comment_id,
         ta.filename,
         ta.mime_type,
         ta.image_url,
         ta.caption,
         ta.is_internal,
         ta.uploaded_by,
         s.full_name as uploaded_by_name,
         TO_CHAR(ta.created_at AT TIME ZONE 'America/New_York', 'Mon DD, YYYY HH12:MI AM') as created_date
       FROM ticket_attachments ta
       LEFT JOIN staff s ON s.id = ta.uploaded_by
       WHERE ta.ticket_id = $1
       ORDER BY ta.created_at DESC`,
      [params.id]
    )

    const activityResult = await query(
      `SELECT action, staff_id, details, created_at
       FROM activity_log
       WHERE entity_type = 'ticket' AND entity_id = $1
       ORDER BY created_at ASC`,
      [params.id]
    )

    // Related tickets (children + siblings)
    const relatedResult = await query(
      `SELECT id, ticket_number, title, status, priority,
              CASE WHEN parent_ticket_id = $1 THEN 'child' ELSE 'related' END as relation
       FROM tickets
       WHERE parent_ticket_id = $1
          OR (parent_ticket_id IS NOT NULL AND parent_ticket_id = (SELECT parent_ticket_id FROM tickets WHERE id = $1) AND id != $1)
       ORDER BY created_at DESC
       LIMIT 10`,
      [params.id]
    )

    return NextResponse.json({
      ticket: ticketResult.rows[0],
      comments: commentsResult.rows,
      attachments: attachmentsResult.rows,
      activity: activityResult.rows || [],
      related_tickets: relatedResult.rows || []
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
    const body = await request.json()
    const { status, priority, assigned_to, category, resolution_notes } = body

    // Handle direct field updates (title, source, ticket_type, contact info, venue)
    const directFields: Record<string, string> = {
      title: 'title', source: 'source', ticket_type: 'ticket_type',
      contact_name: 'contact_name', contact_email: 'contact_email', contact_phone: 'contact_phone',
      venue_id: 'venue_id', description: 'description',
    }
    for (const [key, col] of Object.entries(directFields)) {
      if (body[key] !== undefined) {
        await query(`UPDATE tickets SET ${col} = $1, updated_at = NOW() WHERE id = $2`, [body[key], params.id])
      }
    }

    // Get current ticket state for logging
    const current = await query('SELECT ticket_number, status, priority, assigned_to, title, venue_id, category FROM tickets WHERE id = $1', [params.id])
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
    if (status === 'closed') {
      updates.push(`resolved_at = NOW()`)
      updates.push(`sla_resolution_met = (NOW() <= sla_resolution_due OR sla_resolution_due IS NULL)`)
    }

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

      // Write notification log
      const caseNum = String(oldTicket.ticket_number).padStart(8, '0')
      const logEntry = `TICKET|status_changed|${user?.fullName || 'User'}|${oldTicket.title}|${venueName}|from ${fmtStatus(oldTicket.status)} to ${fmtStatus(status)}|${new Date().toISOString()}\n`
      fs.appendFileSync('/tmp/anc-ticket-notifications.log', logEntry)

      // Notify venue's Slack channel
      const slackChRes = await query('SELECT slack_channel_id FROM venues WHERE id = $1', [oldTicket.venue_id])
      const channelId = slackChRes.rows[0]?.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
      if (channelId) {
        const action = status === 'closed' ? 'resolved' : 'updated'
        const emoji = action === 'resolved' ? ':white_check_mark:' : ':pencil2:'
        const ticketUrl = `https://abc-anc-services.izcgmb.easypanel.host/tickets/${params.id}`
        sendSlackMessage({
          channel: channelId,
          text: `${emoji} Case #${caseNum} ${action}: ${oldTicket.title}`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `${emoji} *Case #${caseNum} ${action}*\n*${oldTicket.title}*\nStatus: ${fmtStatus(oldTicket.status)} → ${fmtStatus(status)}` } },
            { type: 'section', text: { type: 'mrkdwn', text: `<${ticketUrl}|:link: View Ticket>` } },
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

      // Write notification log
      const logEntry = `TICKET|assigned|${user?.fullName || 'User'}|${oldTicket.title}|${venueName}|to ${assignedName}|${new Date().toISOString()}\n`
      fs.appendFileSync('/tmp/anc-ticket-notifications.log', logEntry)

      // Slack notification for assignment
      const assignCaseNum = String(oldTicket.ticket_number).padStart(8, '0')
      const assignChRes = await query('SELECT slack_channel_id FROM venues WHERE id = $1', [oldTicket.venue_id])
      const assignChannelId = assignChRes.rows[0]?.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
      if (assignChannelId) {
        const assignUrl = `https://abc-anc-services.izcgmb.easypanel.host/tickets/${params.id}`
        sendSlackMessage({
          channel: assignChannelId,
          text: `:bust_in_silhouette: Case #${assignCaseNum} assigned to ${assignedName}`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `:bust_in_silhouette: *Case #${assignCaseNum} — Assigned*\n*${oldTicket.title}*\nOwner: ${assignedName}` } },
            { type: 'section', text: { type: 'mrkdwn', text: `<${assignUrl}|:link: View Ticket>` } },
          ],
        })
      }
    }

    // Log and notify priority changes
    if (priority && oldTicket && priority !== oldTicket.priority) {
      await query(
        `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
         VALUES ('ticket_priority_change', 'ticket', $1, $2, $3)`,
        [params.id, user?.userId || null, JSON.stringify({
          entity_name: oldTicket.title,
          venue_name: venueName,
          old_priority: oldTicket.priority,
          new_priority: priority,
        })]
      )

      const priCaseNum = String(oldTicket.ticket_number).padStart(8, '0')
      const priChRes = await query('SELECT slack_channel_id FROM venues WHERE id = $1', [oldTicket.venue_id])
      const priChannelId = priChRes.rows[0]?.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
      if (priChannelId) {
        const priEmoji = priority === 'critical' ? ':red_circle:' : priority === 'high' ? ':large_orange_circle:' : ':large_yellow_circle:'
        const priUrl = `https://abc-anc-services.izcgmb.easypanel.host/tickets/${params.id}`
        sendSlackMessage({
          channel: priChannelId,
          text: `${priEmoji} Case #${priCaseNum} priority changed to ${priority}`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `${priEmoji} *Case #${priCaseNum} — Priority Changed*\n*${oldTicket.title}*\n${oldTicket.priority} → ${priority}` } },
            { type: 'section', text: { type: 'mrkdwn', text: `<${priUrl}|:link: View Ticket>` } },
          ],
        })
      }
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

    // Auto-email distribution list on status change or resolution
    if (status && oldTicket && status !== oldTicket.status) {
      sendTicketDistributionEmail({
        venueId: oldTicket.venue_id,
        ticketTitle: oldTicket.title,
        ticketNumber: oldTicket.ticket_number || result.rows[0]?.ticket_number,
        type: 'updated',
        detail: `Status updated: ${oldTicket.status} → ${status}`,
        resolution: status === 'closed' ? resolution_notes : undefined,
      }).catch(err => console.error('[email] Ticket update email failed:', err))
    }

    // --- CRM SYNC: push updated ticket to Twenty ---
    ;(async () => {
      try {
        const freshTicket = await query(
          `SELECT t.id, t.title, t.ticket_number, t.status, t.priority, t.category,
                  t.description, t.resolution_notes,
                  v.name as venue_name, t.venue_id,
                  s.full_name as assigned_to_name
           FROM tickets t
           LEFT JOIN venues v ON t.venue_id = v.id
           LEFT JOIN staff s ON t.assigned_to = s.id
           WHERE t.id = $1`,
          [params.id]
        )
        if (freshTicket.rows[0]) {
          const ft = freshTicket.rows[0]
          await syncTicketsToTwenty([{
            id: ft.id,
            title: ft.title,
            ticket_number: ft.ticket_number,
            status: ft.status,
            priority: ft.priority,
            category: ft.category,
            venue_name: ft.venue_name || '',
            venue_id: ft.venue_id,
            assigned_to: ft.assigned_to_name || '',
            description: ft.description || '',
            resolution_notes: ft.resolution_notes || '',
          }])
        }
      } catch (crmErr) {
        console.error('[twenty] ticket update sync error:', crmErr)
      }
    })()

    return NextResponse.json({ ticket: result.rows[0] })
  } catch (err) {
    console.error('Error updating ticket:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Chris D asked for this in Slack on 2026-04-22: "could we add a delete option
// for tickets? We get spam calls and emails and would like to just be able to
// delete them instead of closing them."
//
// Hard delete, manager+ role only — cascades to ticket_comments via the FK.
// We clear merged_into_ticket_id references first so the parent ticket doesn't
// blow up an FK constraint.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromToken(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = String(user.role || '')
    // Tightened 2026-04-23 at Chris D's ask: admin-only (was manager+).
    // Managers/support should still use "close" — delete is irrecoverable.
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin role required to delete tickets' }, { status: 403 })
    }

    // Detach any merged-child links pointing to this ticket so those
    // children don't orphan-reference a deleted parent.
    await query(
      `UPDATE tickets SET merged_into_ticket_id = NULL WHERE merged_into_ticket_id = $1`,
      [params.id]
    )
    const r = await query(
      `DELETE FROM tickets WHERE id = $1 RETURNING id, ticket_number, title`,
      [params.id]
    )
    if (r.rows.length === 0) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, deleted: r.rows[0] })
  } catch (err) {
    console.error('Error deleting ticket:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
