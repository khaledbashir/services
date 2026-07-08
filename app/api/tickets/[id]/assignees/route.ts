export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'
import { jwtVerify } from 'jose'
import * as fs from 'fs'

// Multiple assignees per ticket (Chris D, 2026-07-08): "If someone starts a
// ticket but another tech finishes on a different shift, I'd like a record of
// both working on the ticket." The roster lives in ticket_assignees; the legacy
// tickets.assigned_to column stays as the primary owner so list filters, Slack
// routing and auto-assignment keep working. We keep them in sync here.

async function getUserFromToken(request: NextRequest) {
  const token = request.cookies.get('token')?.value
  if (!token) return null
  try {
    const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'anc-services-secret-key-change-me')
    const { payload } = await jwtVerify(token, secret)
    return payload as any
  } catch { return null }
}

async function loadRoster(ticketId: string) {
  const r = await query(
    `SELECT s.id, s.full_name
       FROM ticket_assignees ta JOIN staff s ON ta.staff_id = s.id
      WHERE ta.ticket_id = $1
      ORDER BY ta.added_at`,
    [ticketId]
  )
  return r.rows
}

// POST — add a tech to the ticket's assignee roster.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromToken(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { staff_id } = await request.json()
    if (!staff_id) return NextResponse.json({ error: 'staff_id is required' }, { status: 400 })

    const ticketRes = await query(
      `SELECT t.ticket_number, t.title, t.assigned_to, t.venue_id, v.name as venue_name, v.slack_channel_id
         FROM tickets t LEFT JOIN venues v ON t.venue_id = v.id WHERE t.id = $1`,
      [params.id]
    )
    const t = ticketRes.rows[0]
    if (!t) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

    const staffRes = await query('SELECT full_name FROM staff WHERE id = $1', [staff_id])
    if (staffRes.rows.length === 0) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
    const assignedName = staffRes.rows[0].full_name

    const ins = await query(
      `INSERT INTO ticket_assignees (ticket_id, staff_id, added_by)
       VALUES ($1, $2, $3) ON CONFLICT DO NOTHING RETURNING staff_id`,
      [params.id, staff_id, user.userId || null]
    )
    const wasNew = ins.rows.length > 0

    // If the ticket had no primary owner, promote this tech to it so filters
    // and Slack routing have someone to point at.
    if (!t.assigned_to) {
      await query(`UPDATE tickets SET assigned_to = $1, updated_at = NOW() WHERE id = $2`, [staff_id, params.id])
    }

    if (wasNew) {
      await query(
        `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
         VALUES ('ticket_assigned', 'ticket', $1, $2, $3)`,
        [params.id, user.userId || null, JSON.stringify({
          entity_name: t.title, venue_name: t.venue_name || '', assigned_to: assignedName,
        })]
      )
      try {
        const logEntry = `TICKET|assigned|${user.fullName || 'User'}|${t.title}|${t.venue_name || ''}|to ${assignedName}|${new Date().toISOString()}\n`
        fs.appendFileSync('/tmp/anc-ticket-notifications.log', logEntry)
      } catch {}

      const channelId = t.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
      if (channelId) {
        const caseNum = String(t.ticket_number).padStart(8, '0')
        const url = `https://abc-anc-services.izcgmb.easypanel.host/tickets/${params.id}`
        sendSlackMessage({
          channel: channelId,
          text: `:bust_in_silhouette: Case #${caseNum} — ${assignedName} added as assignee`,
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `:bust_in_silhouette: *Case #${caseNum} — Assignee Added*\n*${t.title}*\nNow also assigned to: ${assignedName}` } },
            { type: 'section', text: { type: 'mrkdwn', text: `<${url}|:link: View Ticket>` } },
          ],
        })
      }
    }

    return NextResponse.json({ assignees: await loadRoster(params.id) })
  } catch (err) {
    console.error('Error adding assignee:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE — remove a tech from the roster. If they were the primary owner,
// hand ownership to the next assignee (or null it out).
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getUserFromToken(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const staffId = request.nextUrl.searchParams.get('staff_id')
    if (!staffId) return NextResponse.json({ error: 'staff_id is required' }, { status: 400 })

    await query(`DELETE FROM ticket_assignees WHERE ticket_id = $1 AND staff_id = $2`, [params.id, staffId])

    // Reconcile primary owner if we just removed them.
    const cur = await query('SELECT assigned_to FROM tickets WHERE id = $1', [params.id])
    if (cur.rows[0]?.assigned_to === staffId) {
      const next = await query(
        `SELECT staff_id FROM ticket_assignees WHERE ticket_id = $1 ORDER BY added_at LIMIT 1`,
        [params.id]
      )
      const newOwner = next.rows[0]?.staff_id || null
      await query(`UPDATE tickets SET assigned_to = $1, updated_at = NOW() WHERE id = $2`, [newOwner, params.id])
    }

    return NextResponse.json({ assignees: await loadRoster(params.id) })
  } catch (err) {
    console.error('Error removing assignee:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
