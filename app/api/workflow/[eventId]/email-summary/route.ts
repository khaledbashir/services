export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { sendEmail } from '@/lib/email'

// Client-facing event/service summary email, sent from the workflow page
// (Jireh ask 2026-07-26). GET returns suggested recipients (portal accounts
// tied to the event's venue) + last-sent info; POST composes the summary
// server-side from the live workflow record and sends it.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_RECIPIENTS = 10

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function fmtEt(dateStr: string | null | undefined, withDate = false): string | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  const opts: Intl.DateTimeFormatOptions = withDate
    ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }
    : { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }
  return `${d.toLocaleString('en-US', opts)} ET`
}

interface EventRow {
  id: string
  summary: string
  venue_id: string
  venue_name: string
  league: string | null
  start_time: string
  end_time: string | null
  event_date: string
}

async function loadEvent(eventId: string): Promise<EventRow | null> {
  const result = await query(
    `SELECT e.id, e.summary, e.venue_id, v.name AS venue_name, e.league,
            e.start_time, e.end_time, TO_CHAR(e.event_date, 'YYYY-MM-DD') AS event_date
     FROM events e LEFT JOIN venues v ON e.venue_id = v.id
     WHERE e.id = $1`,
    [eventId]
  )
  return result.rows[0] || null
}

export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const event = await loadEvent(params.eventId)
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    // Portal accounts whose client org is linked to this venue, plus direct
    // per-venue grants — these are "the client" for this event.
    const suggestions = await query(
      `SELECT DISTINCT pu.email, pu.full_name, c.name AS client_name
       FROM portal_users pu
       LEFT JOIN clients c ON c.id = pu.client_id
       WHERE pu.is_active = true AND (
         pu.client_id IN (SELECT client_id FROM client_venues WHERE venue_id = $1)
         OR pu.id IN (SELECT portal_user_id FROM portal_user_venues WHERE venue_id = $1)
       )
       ORDER BY pu.full_name`,
      [event.venue_id]
    )

    const lastSent = await query(
      `SELECT recipients, sent_by_name, sent_at
       FROM event_summary_emails
       WHERE event_id = $1
       ORDER BY sent_at DESC
       LIMIT 1`,
      [params.eventId]
    )

    return NextResponse.json({
      suggestions: suggestions.rows,
      lastSent: lastSent.rows[0] || null,
    })
  } catch (err) {
    console.error('Email-summary GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } }
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json().catch(() => null)
    const rawTo: unknown = body?.to
    const note: string = typeof body?.note === 'string' ? body.note.trim() : ''

    const to = (Array.isArray(rawTo) ? rawTo : [])
      .map((e) => String(e).trim().toLowerCase())
      .filter((e, i, arr) => e && arr.indexOf(e) === i)
    if (to.length === 0) {
      return NextResponse.json({ error: 'At least one recipient is required' }, { status: 400 })
    }
    if (to.length > MAX_RECIPIENTS) {
      return NextResponse.json({ error: `Maximum ${MAX_RECIPIENTS} recipients` }, { status: 400 })
    }
    const bad = to.filter((e) => !EMAIL_RE.test(e))
    if (bad.length > 0) {
      return NextResponse.json({ error: `Invalid email address: ${bad[0]}` }, { status: 400 })
    }

    const event = await loadEvent(params.eventId)
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

    // Assigned on-site team
    const techs = await query(
      `SELECT DISTINCT s.full_name
       FROM staff s JOIN event_assignments ea ON s.id = ea.staff_id
       WHERE ea.event_id = $1 ORDER BY s.full_name`,
      [params.eventId]
    )

    // Workflow milestones (latest submission per type) + submitter names
    const subs = await query(
      `SELECT ws.type, ws.submitted_at, ws.data, s.full_name AS staff_name
       FROM workflow_submissions ws
       LEFT JOIN staff s ON s.id = ws.staff_id
       WHERE ws.event_id = $1
       ORDER BY ws.submitted_at DESC`,
      [params.eventId]
    )
    let checkIn: any = null
    let gameReady: any = null
    let postGame: any = null
    for (const row of subs.rows) {
      if (row.type === 'check_in' && !checkIn) checkIn = row
      else if (row.type === 'game_ready' && !gameReady) gameReady = row
      else if (row.type === 'post_game_report' && !postGame) postGame = row
    }

    const eventDateLabel = new Date(`${event.event_date}T12:00:00Z`).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    })

    const milestoneRow = (label: string, row: any) => {
      const time = row ? fmtEt(row.submitted_at, true) : null
      const status = row
        ? `<span style="color:#059669;font-weight:600">Completed</span>${time ? ` <span style="color:#64748b">· ${escapeHtml(time)}</span>` : ''}`
        : `<span style="color:#94a3b8">—</span>`
      return `<tr>
        <td style="padding:8px 0;font-size:13px;color:#0f172a;font-weight:600;white-space:nowrap">${escapeHtml(label)}</td>
        <td style="padding:8px 0 8px 16px;font-size:13px">${status}</td>
      </tr>`
    }

    const notes: string = postGame?.data?.notes?.trim() || ''
    const incidents: string = postGame?.data?.incidents?.trim() || ''
    const teamNames = techs.rows.map((r: any) => r.full_name).filter(Boolean)

    const html = `
  <div style="background:#f1f5f9;padding:32px 16px;font-family:'Inter',-apple-system,'Segoe UI',sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e8f0">
      <div style="background:#0A1628;padding:20px 28px">
        <span style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:0.04em">ANC</span>
        <span style="color:#94a3b8;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;margin-left:10px">Event Service Summary</span>
      </div>
      <div style="padding:28px">
        <h1 style="margin:0 0 4px;font-size:18px;color:#0f172a">${escapeHtml(event.summary)}</h1>
        <p style="margin:0 0 18px;font-size:13px;color:#64748b">${escapeHtml(event.venue_name || '')} · ${escapeHtml(eventDateLabel)}${event.league ? ` · ${escapeHtml(event.league)}` : ''}</p>
        ${note ? `<div style="margin:0 0 18px;padding:12px 16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:13px;color:#1e3a8a;white-space:pre-wrap">${escapeHtml(note)}</div>` : ''}
        ${teamNames.length > 0 ? `
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;font-weight:700">On-site team</p>
        <p style="margin:0 0 18px;font-size:13px;color:#0f172a">${teamNames.map((n: string) => escapeHtml(n)).join(', ')}</p>` : ''}
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;font-weight:700">Service milestones</p>
        <table style="border-collapse:collapse;width:100%;margin-bottom:18px">
          ${milestoneRow('On-site check-in', checkIn)}
          ${milestoneRow('Game ready', gameReady)}
          ${milestoneRow('Post-game report', postGame)}
        </table>
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;font-weight:700">Post-game notes</p>
        <p style="margin:0 0 14px;font-size:13px;color:#0f172a;white-space:pre-wrap">${notes ? escapeHtml(notes) : '<span style="color:#94a3b8">No additional notes.</span>'}</p>
        <p style="margin:0 0 4px;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#94a3b8;font-weight:700">Incidents</p>
        <p style="margin:0;font-size:13px;color:#0f172a;white-space:pre-wrap">${incidents ? escapeHtml(incidents) : '<span style="color:#059669">No incidents reported.</span>'}</p>
      </div>
      <div style="padding:14px 28px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8">
        Sent by the ANC service team. Reply to this email with any questions.
      </div>
    </div>
  </div>`

    const subject = `${event.venue_name ? `${event.venue_name} — ` : ''}${event.summary} · Service Summary`
    const sent = await sendEmail(to, subject, html)
    if (!sent) {
      return NextResponse.json({ error: 'Email could not be sent — try again or contact ops' }, { status: 502 })
    }

    await query(
      `INSERT INTO event_summary_emails (event_id, sent_by, sent_by_name, recipients, note, subject)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [params.eventId, auth.userId, auth.fullName || null, to, note || null, subject]
    ).catch((err) => console.error('event_summary_emails insert failed:', err))

    return NextResponse.json({ ok: true, recipients: to, sentAt: new Date().toISOString() })
  } catch (err) {
    console.error('Email-summary POST error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
