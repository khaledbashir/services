export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { brandedEmail } from '@/lib/email-templates'

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(d: string) {
  try {
    return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })
  } catch { return '' }
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function buildScheduleCSV(rows: any[]): string {
  const header = ['Date', 'Start Time', 'End Time', 'Event', 'League', 'Assigned Staff', 'Status']
  const lines = [header.join(',')]
  for (const r of rows) {
    const status = r.workflow_status === 'pending' ? 'Pending'
      : r.workflow_status === 'checked_in' ? 'Checked In'
      : r.workflow_status === 'game_ready' ? 'Game Ready'
      : r.workflow_status === 'post_game_submitted' ? 'Complete'
      : r.workflow_status || 'Pending'
    lines.push([
      csvEscape(r.event_date),
      csvEscape(r.start_time ? new Date(r.start_time).toISOString() : ''),
      csvEscape(r.end_time ? new Date(r.end_time).toISOString() : ''),
      csvEscape(r.summary || ''),
      csvEscape(r.league || ''),
      csvEscape(r.assigned_techs || ''),
      csvEscape(status),
    ].join(','))
  }
  // BOM for Excel UTF-8 compatibility
  return '﻿' + lines.join('\r\n') + '\r\n'
}

function icsEscape(v: string): string {
  return v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

function fmtIcsUtc(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

function foldIcsLine(line: string): string {
  // RFC 5545: lines >75 octets must be folded with CRLF + space.
  if (line.length <= 75) return line
  const out: string[] = []
  let i = 0
  while (i < line.length) {
    out.push((i === 0 ? '' : ' ') + line.slice(i, i + 73))
    i += 73
  }
  return out.join('\r\n')
}

function buildScheduleICS(venueName: string, rows: any[], _venueTimezone: string): string {
  const now = fmtIcsUtc(new Date())
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ANC Sports//Service Dashboard//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldIcsLine(`X-WR-CALNAME:${icsEscape(`Staff Schedule — ${venueName}`)}`),
  ]
  for (const r of rows) {
    const start = r.start_time ? new Date(r.start_time) : null
    if (!start || isNaN(start.getTime())) continue
    const end = r.end_time && !isNaN(new Date(r.end_time).getTime())
      ? new Date(r.end_time)
      : new Date(start.getTime() + 3 * 60 * 60 * 1000) // default 3h
    const summary = r.summary || 'Event'
    const desc = [
      r.league ? `League: ${r.league}` : '',
      r.assigned_techs ? `Assigned: ${r.assigned_techs}` : 'Unassigned',
    ].filter(Boolean).join(' | ')
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${r.id}@anc-services`)
    lines.push(`DTSTAMP:${now}`)
    lines.push(`DTSTART:${fmtIcsUtc(start)}`)
    lines.push(`DTEND:${fmtIcsUtc(end)}`)
    lines.push(foldIcsLine(`SUMMARY:${icsEscape(summary)}`))
    lines.push(foldIcsLine(`LOCATION:${icsEscape(venueName)}`))
    if (desc) lines.push(foldIcsLine(`DESCRIPTION:${icsEscape(desc)}`))
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

function buildScheduleHTML(venueName: string, rows: any[], startDate: string, endDate: string) {
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  const tableRows = rows.map((r: any, i: number) => `
    <tr style="background:${i % 2 === 0 ? '#fff' : '#f8fafc'}">
      <td style="padding:10px 16px;font-weight:500">${fmt(r.event_date)}</td>
      <td style="padding:10px 16px">${fmtTime(r.start_time)}</td>
      <td style="padding:10px 16px">${r.summary}</td>
      <td style="padding:10px 16px">${r.league || '—'}</td>
      <td style="padding:10px 16px">${r.assigned_techs || 'Unassigned'}</td>
      <td style="padding:10px 16px;text-align:center"><span style="color:${r.workflow_status === 'post_game_submitted' ? '#059669' : '#d97706'};font-weight:600">${r.workflow_status === 'pending' ? 'Pending' : r.workflow_status === 'checked_in' ? 'Checked In' : r.workflow_status === 'game_ready' ? 'Game Ready' : r.workflow_status === 'post_game_submitted' ? 'Complete' : r.workflow_status || 'Pending'}</span></td>
    </tr>
  `).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
@page{size:letter landscape;margin:0}*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',sans-serif;color:#1e293b;font-size:11px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.header{background:linear-gradient(135deg,#001845 0%,#002C73 40%,#0A52EF 100%);color:white;padding:32px 48px 24px;position:relative;overflow:hidden}
.slash{position:absolute;width:60px;height:200px;background:rgba(255,255,255,0.05);transform:skewX(-35deg)}
.header h1{font-size:18px;font-weight:800;position:relative;z-index:1}
.header .sub{font-size:11px;opacity:0.7;margin-top:3px;position:relative;z-index:1}
.content{padding:24px 48px}
table{width:100%;border-collapse:collapse;font-size:10px}
thead th{background:#f1f5f9;padding:10px 16px;text-align:left;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;border-bottom:2px solid #e2e8f0}
tbody td{border-bottom:1px solid #f1f5f9;color:#334155}
.footer{margin-top:20px;padding:16px 48px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:8px;color:#94a3b8}
.summary{display:flex;gap:32px;margin-bottom:20px;padding:12px 0;border-bottom:1px solid #e2e8f0}
.summary-item .label{font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#64748b}
.summary-item .value{font-size:20px;font-weight:800;color:#0A52EF;margin-top:2px}
</style></head><body>
<div class="header">
<div class="slash" style="top:-40px;right:30px"></div>
<div class="slash" style="top:-40px;right:110px"></div>
<div class="slash" style="top:-40px;right:190px"></div>
<h1>Staff Schedule — ${venueName}</h1>
<div class="sub">${fmt(startDate)} — ${fmt(endDate)}</div>
</div>
<div class="content">
<div class="summary">
<div class="summary-item"><div class="label">Total Events</div><div class="value">${rows.length}</div></div>
<div class="summary-item"><div class="label">Assigned</div><div class="value">${rows.filter((r: any) => r.assigned_techs).length}</div></div>
<div class="summary-item"><div class="label">Unassigned</div><div class="value">${rows.filter((r: any) => !r.assigned_techs).length}</div></div>
</div>
<table>
<thead><tr><th>Date</th><th>Time</th><th>Event</th><th>League</th><th>Assigned Staff</th><th style="text-align:center">Status</th></tr></thead>
<tbody>${tableRows.length > 0 ? tableRows : '<tr><td colspan="6" style="padding:24px;text-align:center;color:#94a3b8">No events scheduled</td></tr>'}</tbody>
</table>
</div>
<div class="footer"><span>ANC Sports — www.anc.com</span><span>Generated ${today}</span></div>
</body></html>`
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Allow access via API key (for bot/server calls) or via authenticated session
    const apiKey = searchParams.get('key')
    const token = request.cookies.get('token')?.value
    const validKey = process.env.JWT_SECRET || 'anc-services-secret-key-change-me'
    if (!token && apiKey !== validKey) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const venueId = searchParams.get('venue_id')
    const period = searchParams.get('period') || '30' // days
    const action = searchParams.get('action') || 'download' // download or email
    const format = (searchParams.get('format') || 'pdf').toLowerCase() // pdf | csv | ics

    if (!venueId) {
      return NextResponse.json({ error: 'venue_id is required' }, { status: 400 })
    }

    // Get venue info
    const venueResult = await query(
      `SELECT v.name, v.primary_contact_name, v.primary_contact_email, COALESCE(v.timezone, 'America/New_York') as timezone FROM venues v WHERE v.id = $1`,
      [venueId]
    )
    if (venueResult.rows.length === 0) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
    }
    const venue = venueResult.rows[0]

    const today = new Date().toISOString().split('T')[0]
    const endDate = new Date(Date.now() + parseInt(period) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    // Get events with assignments
    const eventsResult = await query(
      `SELECT
        e.id,
        e.summary,
        TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date,
        e.start_time,
        e.end_time,
        e.league,
        COALESCE(e.workflow_status, 'pending') as workflow_status,
        STRING_AGG(s.full_name, ', ' ORDER BY s.full_name) as assigned_techs
      FROM events e
      LEFT JOIN event_assignments ea ON e.id = ea.event_id
      LEFT JOIN staff s ON ea.staff_id = s.id
      WHERE e.venue_id = $1 AND e.event_date >= $2 AND e.event_date <= $3
      GROUP BY e.id, e.summary, e.event_date, e.start_time, e.end_time, e.league, e.workflow_status
      ORDER BY e.start_time`,
      [venueId, today, endDate]
    )

    const safeName = venue.name.replace(/[^a-zA-Z0-9]/g, '_')

    // CSV export — Joe 2026-05-04, for managers who want to scan in Excel.
    if (format === 'csv') {
      const csv = buildScheduleCSV(eventsResult.rows)
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="Staff_Schedule_${safeName}_${today}.csv"`,
        },
      })
    }

    // iCal export — Joe 2026-05-04, so contacts can subscribe in Google / Outlook.
    if (format === 'ics') {
      const ics = buildScheduleICS(venue.name, eventsResult.rows, venue.timezone)
      return new NextResponse(ics, {
        headers: {
          'Content-Type': 'text/calendar; charset=utf-8',
          'Content-Disposition': `attachment; filename="Staff_Schedule_${safeName}.ics"`,
        },
      })
    }

    const html = buildScheduleHTML(venue.name, eventsResult.rows, today, endDate)

    // Generate PDF via Browserless
    const pdfResponse = await fetch(`http://abc_browserless:3000/pdf?token=923fe7f9bc3ff7f94c8337be4c2ee0f2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html,
        options: { format: 'Letter', landscape: true, printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } },
        gotoOptions: { waitUntil: 'networkidle0' },
      }),
    })

    if (!pdfResponse.ok) {
      return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
    }

    const pdfBuffer = await pdfResponse.arrayBuffer()

    // If email action, send via SendGrid (shared sendEmail; Resend retired)
    if (action === 'email') {
      const recipientEmail = searchParams.get('email') || venue.primary_contact_email

      if (!recipientEmail) {
        return NextResponse.json({ error: 'No email address provided or configured for this venue' }, { status: 400 })
      }

      const filename = `Staff_Schedule_${venue.name.replace(/[^a-zA-Z0-9]/g, '_')}_${today}.pdf`

      const ok = await sendEmail(
        [recipientEmail],
        `Staff Schedule — ${venue.name} (${fmt(today)} – ${fmt(endDate)})`,
        brandedEmail({
          title: 'Staff Schedule',
          subtitle: `${venue.name} · ${fmt(today)} – ${fmt(endDate)}`,
          bodyHtml: `<p style="margin:0">Hi ${venue.primary_contact_name || 'there'}, the staff schedule for <strong>${venue.name}</strong> covering ${fmt(today)} through ${fmt(endDate)} is attached as a PDF.</p>`,
          footerNote: 'ANC Sports · staff schedule',
        }),
        undefined,
        { attachments: [{ filename, content: Buffer.from(pdfBuffer).toString('base64'), type: 'application/pdf' }] }
      )

      if (!ok) {
        return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
      }

      return NextResponse.json({ sent: true, to: recipientEmail })
    }

    // Otherwise, return PDF for download
    const filename = `Staff_Schedule_${venue.name.replace(/[^a-zA-Z0-9]/g, '_')}_${today}.pdf`
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    console.error('Error exporting schedule:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
