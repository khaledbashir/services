import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'
import { sendTicketDistributionEmail } from '@/lib/email'
import { dashboardUrl } from '@/lib/app-url'

const INTERNAL_KEY = process.env.INTERNAL_API_KEY || 'anc-internal-2026'

const fmtStatus = (s: string) => ({ new: 'New', on_hold: 'On Hold', in_progress: 'In Progress', escalated: 'Escalated', closed: 'Closed' }[s] || s)

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('x-api-key') || ''
    if (authHeader !== INTERNAL_KEY) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const body = await request.json()
    const { status, priority, category, assigned_to, resolution_notes } = body

    // Get current ticket
    const oldRes = await query(
      `SELECT t.*, v.name as venue_name, v.slack_channel_id FROM tickets t LEFT JOIN venues v ON t.venue_id = v.id WHERE t.id = $1`,
      [params.id]
    )
    if (oldRes.rows.length === 0) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }
    const oldTicket = oldRes.rows[0]

    // Build update
    const updates: string[] = []
    const values: any[] = []
    let idx = 1

    if (status && status !== oldTicket.status) {
      updates.push(`status = $${idx}`)
      values.push(status)
      idx++
      if (status === 'closed') {
        updates.push(`resolved_at = NOW()`)
        updates.push(`sla_resolution_met = (NOW() <= sla_resolution_due)`)
        if (resolution_notes) {
          updates.push(`resolution_notes = $${idx}`)
          values.push(resolution_notes)
          idx++
        }
      }
    }
    if (resolution_notes !== undefined && !(status === 'closed' && status !== oldTicket.status && resolution_notes)) {
      updates.push(`resolution_notes = $${idx}`)
      values.push(resolution_notes)
      idx++
    }
    if (priority) { updates.push(`priority = $${idx}`); values.push(priority); idx++ }
    if (category) { updates.push(`category = $${idx}`); values.push(category); idx++ }
    if (assigned_to !== undefined) { updates.push(`assigned_to = $${idx}`); values.push(assigned_to || null); idx++ }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    updates.push('updated_at = NOW()')
    values.push(params.id)

    const result = await query(
      `UPDATE tickets SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    )

    const ticket = result.rows[0]
    const caseNum = String(oldTicket.ticket_number).padStart(8, '0')
    const channelId = oldTicket.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
    const ticketUrl = dashboardUrl(`/tickets/${params.id}`)

    // Slack + email for status changes
    if (status && status !== oldTicket.status && channelId) {
      const action = status === 'closed' ? 'resolved' : 'updated'
      const emoji = action === 'resolved' ? ':white_check_mark:' : ':pencil2:'
      await sendSlackMessage({
        channel: channelId,
        text: `${emoji} Case #${caseNum} ${action}: ${oldTicket.title}`,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `${emoji} *Case #${caseNum} ${action}*\n*${oldTicket.title}*\nStatus: ${fmtStatus(oldTicket.status)} → ${fmtStatus(status)}` } },
          { type: 'section', text: { type: 'mrkdwn', text: `<${ticketUrl}|:link: View Ticket>` } },
        ],
      })

      sendTicketDistributionEmail({
        venueId: oldTicket.venue_id,
        ticketTitle: oldTicket.title,
        ticketNumber: oldTicket.ticket_number,
        type: 'updated',
        detail: `Status updated: ${fmtStatus(oldTicket.status)} → ${fmtStatus(status)}`,
        resolution: status === 'closed' ? (resolution_notes || oldTicket.resolution_notes) : undefined,
      }).catch(err => console.error('[email] Internal ticket update email failed:', err))
    }

    // Slack for assignment changes
    if (assigned_to !== undefined && assigned_to !== oldTicket.assigned_to && channelId) {
      const staffRes = await query('SELECT full_name FROM staff WHERE id = $1', [assigned_to])
      const name = staffRes.rows[0]?.full_name || 'Unassigned'
      await sendSlackMessage({
        channel: channelId,
        text: `:bust_in_silhouette: Case #${caseNum} assigned to ${name}`,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `:bust_in_silhouette: *Case #${caseNum} — Assigned*\n*${oldTicket.title}*\nOwner: ${name}` } },
          { type: 'section', text: { type: 'mrkdwn', text: `<${ticketUrl}|:link: View Ticket>` } },
        ],
      })
    }

    return NextResponse.json({ ok: true, ticket_number: oldTicket.ticket_number })
  } catch (err) {
    console.error('Error updating internal ticket:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
