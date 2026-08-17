export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { approvedOnly } from '@/lib/event-approval'
import { sendSlackMessage } from '@/lib/slack'

// Scheduler: run hourly. Finds events crossing the ~24h-out mark
// (start_time within next 23–25h) that still need staffing and have
// zero assignments. Each event hits this window exactly once, so no
// dedupe table is needed — running hourly catches every event the
// hour it crosses 24h-out.
//
// Replaces the per-assignment Slack pings that Joe + Alexis + Nick + Gianni
// agreed were too noisy on 2026-05-01.
//
// ?force=1 widens the window to "next 7 days" for verification — same
// digest format, just lets you SEE it land without waiting for a real
// event to cross the 24h boundary.

export async function GET(request: NextRequest) {
  const force = request.nextUrl.searchParams.get('force') === '1'
  const windowSql = force
    ? "BETWEEN NOW() AND NOW() + INTERVAL '7 days'"
    : "BETWEEN NOW() + INTERVAL '23 hours' AND NOW() + INTERVAL '25 hours'"

  try {
    const result = await query(
      `SELECT
         e.id,
         e.summary,
         e.start_time,
         v.name AS venue_name,
         COALESCE(v.timezone, 'America/New_York') AS venue_timezone,
         COALESCE(v.requires_assignment, true) AS venue_requires_assignment,
         e.requires_staffing AS event_requires_staffing,
         COUNT(ea.id)::int AS assigned_count
       FROM events e
       LEFT JOIN venues v ON e.venue_id = v.id
       LEFT JOIN event_assignments ea ON ea.event_id = e.id
       WHERE e.start_time ${windowSql}
         AND ${approvedOnly('e')}
       GROUP BY e.id, v.name, v.timezone, v.requires_assignment
       HAVING COUNT(ea.id) = 0
       ORDER BY e.start_time ASC
       LIMIT 25`
    )

    // Per Joe 2026-04-29: venue.requires_assignment is the source of truth,
    // event.requires_staffing (nullable) is a per-event override.
    const unassigned = result.rows.filter((row) => {
      const requiresStaffing =
        row.event_requires_staffing !== null && row.event_requires_staffing !== undefined
          ? row.event_requires_staffing
          : row.venue_requires_assignment !== false
      return requiresStaffing
    })

    if (unassigned.length === 0) {
      return NextResponse.json({ ok: true, sent: false, count: 0, mode: force ? 'force' : 'normal' })
    }

    const channel = process.env.SLACK_DEFAULT_CHANNEL || ''
    if (!channel) {
      return NextResponse.json({ error: 'SLACK_DEFAULT_CHANNEL not configured' }, { status: 500 })
    }

    const dashboardBase = process.env.NEXT_PUBLIC_URL || 'https://abc-anc-services.izcgmb.easypanel.host'

    const lines = unassigned.map((e: any) => {
      const when = new Date(e.start_time).toLocaleString('en-US', {
        timeZone: e.venue_timezone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
      return `• *${e.summary}* at *${e.venue_name}* — ${when}`
    })

    const headline = force
      ? `:warning: *${unassigned.length} unassigned event${unassigned.length === 1 ? '' : 's'} in the next 7 days* (test fire)`
      : `:warning: *${unassigned.length} event${unassigned.length === 1 ? '' : 's'} need staffing — starting in ~24h*`

    const sent = await sendSlackMessage({
      channel,
      text: `${unassigned.length} event${unassigned.length === 1 ? '' : 's'} unassigned${force ? ' (test fire)' : ' ~24h out'}`,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: headline },
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
              text: { type: 'plain_text', text: 'Open Events' },
              url: `${dashboardBase}/events`,
            },
          ],
        },
      ],
    })

    if (!sent) {
      return NextResponse.json({ error: 'Failed to send Slack alert', mode: force ? 'force' : 'normal' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, sent: true, count: unassigned.length, mode: force ? 'force' : 'normal' })
  } catch (err) {
    console.error('Error in events-unassigned-24h cron:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
