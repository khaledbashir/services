import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'

function formatDateLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

function formatTimeLabel(dateStr: string, timeZone: string) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  })
}

export async function GET() {
  try {
    const jobResult = await query(`SELECT enabled FROM automation_jobs WHERE id = 'daily-event-digest'`)
    let autoEnabled = false
    if (jobResult.rows.length > 0 && !jobResult.rows[0].enabled) {
      await query(`UPDATE automation_jobs SET enabled = true WHERE id = 'daily-event-digest'`)
      autoEnabled = true
    }

    const now = new Date()
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)

    const result = await query(
      `SELECT
        e.id,
        e.summary,
        e.start_time,
        TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date,
        COALESCE(e.workflow_status, 'pending') as workflow_status,
        v.name as venue_name,
        COALESCE(v.timezone, 'America/New_York') as venue_timezone,
        COALESCE(v.requires_assignment, true) as venue_requires_assignment,
        e.requires_staffing as event_requires_staffing,
        COUNT(ea.id)::int as assigned_count,
        COALESCE(STRING_AGG(s.full_name, ', ' ORDER BY s.full_name), '') as assigned_techs
      FROM events e
      LEFT JOIN venues v ON e.venue_id = v.id
      LEFT JOIN event_assignments ea ON ea.event_id = e.id
      LEFT JOIN staff s ON s.id = ea.staff_id
      WHERE e.event_date = $1
      GROUP BY e.id, v.name, v.timezone, v.requires_assignment
      ORDER BY e.start_time ASC, e.summary ASC`,
      [today]
    )

    const events = result.rows
    const defaultChannel = process.env.SLACK_DEFAULT_CHANNEL || ''
    if (!defaultChannel) {
      return NextResponse.json({ error: 'SLACK_DEFAULT_CHANNEL not configured' }, { status: 500 })
    }

    const dateLabel = formatDateLabel(now)
    const total = events.length
    const unassigned = events.filter((event) => {
      const requiresStaffing = event.event_requires_staffing ?? event.venue_requires_assignment
      return requiresStaffing && Number(event.assigned_count || 0) === 0
    })

    const lines = events.length === 0
      ? ['No events scheduled today.']
      : events.map((event: any) => {
          const requiresStaffing = event.event_requires_staffing ?? event.venue_requires_assignment
          const assignedCount = Number(event.assigned_count || 0)
          const assignmentLabel = assignedCount > 0
            ? `${assignedCount} assigned${event.assigned_techs ? ` — ${event.assigned_techs}` : ''}`
            : requiresStaffing
            ? 'UNASSIGNED'
            : 'Warranty only'

          return `• ${formatTimeLabel(event.start_time, event.venue_timezone)} — *${event.summary}* at *${event.venue_name}* (${assignmentLabel})`
        })

    const summary = total === 0
      ? `No events on the ANC dashboard for ${dateLabel}.`
      : `*${total} event${total === 1 ? '' : 's'}* on the ANC dashboard for *${dateLabel}*.${unassigned.length > 0 ? `\n:warning: *${unassigned.length} unassigned* and need staffing attention.` : ''}`

    const dashboardUrl = `${process.env.NEXT_PUBLIC_URL || 'https://abc-anc-services.izcgmb.easypanel.host'}/events?filter=today`

    const sent = await sendSlackMessage({
      channel: defaultChannel,
      text: `Today's ANC events — ${dateLabel}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `:calendar: *Today's ANC Events*\n${summary}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: lines.join('\n').slice(0, 2900),
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Open Dashboard Events' },
              url: dashboardUrl,
            },
          ],
        },
      ],
    })

    if (!sent) {
      return NextResponse.json({ error: 'Failed to send Slack digest' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      sent: true,
      date: today,
      total_events: total,
      unassigned_events: unassigned.length,
      source: 'dashboard_events_table',
      auto_enabled: autoEnabled,
    })
  } catch (err) {
    console.error('Error sending daily event digest:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
