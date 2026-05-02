import { NextRequest, NextResponse } from 'next/server'
import * as fs from 'fs'
import { query as dbQuery } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'
import { authorizeVoiceCall, cleanQuery } from '@/lib/elevenlabs-internal-auth'

const PROD_BASE = process.env.NEXT_PUBLIC_BASE_URL || 'https://services.ancsports.net'

function fmtStatus(s: string): string {
  return s.replace(/_/g, ' ')
}

async function findTicket(numberOrId: string) {
  const trimmed = numberOrId.replace(/^#/, '').trim()
  if (!trimmed) return null
  if (/^\d+$/.test(trimmed)) {
    const r = await dbQuery(
      `SELECT t.id, t.ticket_number, t.title, t.status, t.priority, t.venue_id, v.name as venue_name
       FROM tickets t LEFT JOIN venues v ON v.id = t.venue_id
       WHERE t.ticket_number = $1 LIMIT 1`,
      [parseInt(trimmed, 10)]
    )
    return r.rows[0] || null
  }
  const r = await dbQuery(
    `SELECT t.id, t.ticket_number, t.title, t.status, t.priority, t.venue_id, v.name as venue_name
     FROM tickets t LEFT JOIN venues v ON v.id = t.venue_id
     WHERE t.id = $1::uuid LIMIT 1`,
    [trimmed]
  )
  return r.rows[0] || null
}

async function findStaffByName(nameQuery: string) {
  const cleaned = nameQuery.trim()
  if (!cleaned) return null
  const r = await dbQuery(
    `SELECT id, full_name FROM staff
     WHERE is_active = true AND full_name ILIKE $1
     ORDER BY CASE WHEN LOWER(full_name) = LOWER($2) THEN 0 ELSE 1 END,
              LENGTH(full_name) ASC
     LIMIT 1`,
    [`%${cleaned}%`, cleaned]
  )
  return r.rows[0] || null
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
    return NextResponse.json({ ok: false, error: 'staff_email_unrecognized' }, { status: 400 })
  }

  const ref = cleanQuery(typeof body.ticket === 'string' ? body.ticket : '', 60)
  const newStatus = cleanQuery(typeof body.status === 'string' ? body.status : '', 30).toLowerCase()
  const newPriority = cleanQuery(typeof body.priority === 'string' ? body.priority : '', 20).toLowerCase()
  const resolutionNotes = cleanQuery(typeof body.resolution_notes === 'string' ? body.resolution_notes : '', 2000)
  const assigneeName = cleanQuery(typeof body.assignee === 'string' ? body.assignee : '', 100)

  if (!ref) {
    return NextResponse.json({ ok: false, error: 'ticket_required', voiceBrief: 'I need the ticket number to update.' }, { status: 400 })
  }
  if (!newStatus && !newPriority && !resolutionNotes && !assigneeName) {
    return NextResponse.json({ ok: false, error: 'no_changes', voiceBrief: 'Nothing to change. Tell me a new status, priority, assignee, or resolution note.' }, { status: 400 })
  }

  const allowedStatus = ['new', 'on_hold', 'in_progress', 'escalated', 'closed']
  const allowedPriority = ['low', 'medium', 'high', 'urgent']
  if (newStatus && !allowedStatus.includes(newStatus)) {
    return NextResponse.json({ ok: false, error: 'invalid_status' }, { status: 400 })
  }
  if (newPriority && !allowedPriority.includes(newPriority)) {
    return NextResponse.json({ ok: false, error: 'invalid_priority' }, { status: 400 })
  }

  try {
    const ticket = await findTicket(ref)
    if (!ticket) {
      return NextResponse.json({ ok: false, error: 'ticket_not_found', voiceBrief: `No ticket matching ${ref}.` }, { status: 404 })
    }

    let assigneeId: string | null = null
    let assigneeFullName: string | null = null
    if (assigneeName) {
      const found = await findStaffByName(assigneeName)
      if (!found) {
        return NextResponse.json({ ok: false, error: 'assignee_not_found', voiceBrief: `I could not find staff matching ${assigneeName}.` }, { status: 404 })
      }
      assigneeId = found.id
      assigneeFullName = found.full_name
    }

    const updates: string[] = []
    const values: unknown[] = []
    let i = 1
    if (newStatus) { updates.push(`status = $${i++}`); values.push(newStatus) }
    if (newPriority) { updates.push(`priority = $${i++}`); values.push(newPriority) }
    if (resolutionNotes) { updates.push(`resolution_notes = $${i++}`); values.push(resolutionNotes) }
    if (assigneeId) { updates.push(`assigned_to = $${i++}`); values.push(assigneeId) }
    updates.push(`updated_at = NOW()`)
    if (newStatus === 'closed') {
      updates.push(`resolved_at = NOW()`)
      updates.push(`sla_resolution_met = (NOW() <= sla_resolution_due OR sla_resolution_due IS NULL)`)
    }
    values.push(ticket.id)

    await dbQuery(
      `UPDATE tickets SET ${updates.join(', ')} WHERE id = $${i}`,
      values
    )

    const caseNum = String(ticket.ticket_number).padStart(8, '0')
    const ticketUrl = `${PROD_BASE}/tickets/${ticket.id}`

    if (newStatus && newStatus !== ticket.status) {
      await dbQuery(
        `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
         VALUES ('ticket_status_change', 'ticket', $1, $2, $3)`,
        [ticket.id, auth.staff.id, JSON.stringify({
          entity_name: ticket.title,
          venue_name: ticket.venue_name,
          old_status: ticket.status,
          new_status: newStatus,
          source: 'voice',
        })]
      )
      try {
        const logEntry = `TICKET|status_changed|${auth.staff.fullName}|${ticket.title}|${ticket.venue_name}|from ${fmtStatus(ticket.status)} to ${fmtStatus(newStatus)}|${new Date().toISOString()}\n`
        fs.appendFileSync('/tmp/anc-ticket-notifications.log', logEntry)
      } catch {}
      const ch = await dbQuery('SELECT slack_channel_id FROM venues WHERE id = $1', [ticket.venue_id])
      const channelId = ch.rows[0]?.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
      if (channelId) {
        const action = newStatus === 'closed' ? 'resolved' : 'updated'
        const emoji = action === 'resolved' ? ':white_check_mark:' : ':pencil2:'
        sendSlackMessage({
          channel: channelId,
          text: `${emoji} Case #${caseNum} ${action} via voice: ${ticket.title}`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `${emoji} *Case #${caseNum} ${action}* (voice by ${auth.staff.fullName})\n*${ticket.title}*\nStatus: ${fmtStatus(ticket.status)} → ${fmtStatus(newStatus)}` } },
            { type: 'section', text: { type: 'mrkdwn', text: `<${ticketUrl}|:link: View Ticket>` } },
          ],
        }).catch(err => console.error('[voice] slack notify failed:', err))
      }
    }

    if (assigneeId) {
      await dbQuery(
        `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
         VALUES ('ticket_assigned', 'ticket', $1, $2, $3)`,
        [ticket.id, auth.staff.id, JSON.stringify({
          entity_name: ticket.title,
          venue_name: ticket.venue_name,
          assigned_to: assigneeFullName,
          source: 'voice',
        })]
      )
    }

    const parts: string[] = [`Ticket ${String(ticket.ticket_number).padStart(4, '0')} updated.`]
    if (newStatus) parts.push(`Status now ${fmtStatus(newStatus)}.`)
    if (newPriority) parts.push(`Priority ${newPriority}.`)
    if (assigneeFullName) parts.push(`Assigned to ${assigneeFullName}.`)
    if (resolutionNotes) parts.push(`Resolution note saved.`)

    return NextResponse.json({
      ok: true,
      updated: true,
      caller: auth.staff.fullName,
      ticket: {
        id: ticket.id,
        ticketNumber: ticket.ticket_number,
        ticketLabel: String(ticket.ticket_number).padStart(4, '0'),
        title: ticket.title,
        venue: ticket.venue_name,
        status: newStatus || ticket.status,
        priority: newPriority || ticket.priority,
        assignedTo: assigneeFullName,
        url: ticketUrl,
      },
      voiceBrief: parts.join(' '),
    })
  } catch (error) {
    console.error('voice update-ticket error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'update_failed' },
      { status: 500 }
    )
  }
}
