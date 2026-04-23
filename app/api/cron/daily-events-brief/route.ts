import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'

// Joe's 2026-04-22 ask: daily event digest into a private channel — 9am ET
// shows today's schedule, 5pm ET shows the same list with current workflow
// status so leadership can see what's closed out vs outstanding.
//
// Scheduler (root crontab, see /root/anc-services/docs/CRON_EVENT_DIGESTS.md):
//   0 13 * * * curl -s 'https://services.ancsports.net/api/cron/daily-events-brief?window=morning'
//   0 21 * * * curl -s 'https://services.ancsports.net/api/cron/daily-events-brief?window=evening'
//   (9am ET = 13:00 UTC during EDT, 5pm ET = 21:00 UTC)
//
// Target channel(s): SLACK_WORKFLOW_DIGEST_CHANNEL env var. Accepts either a
// single channel ID or a comma-separated list (e.g. "C0B00BH7GRW,C09UAFMH9PG")
// so the digest can fan out to multiple rooms — Joe's 2026-04-23 ask: post
// today's summary to #anc-events in addition to the ops audit channel.
// Falls back to SLACK_WORKFLOW_AUDIT_CHANNEL, then SLACK_DEFAULT_CHANNEL.

type Window = 'morning' | 'evening'

function resolveDigestChannels(): string[] {
  const raw =
    process.env.SLACK_WORKFLOW_DIGEST_CHANNEL ||
    process.env.SLACK_WORKFLOW_AUDIT_CHANNEL ||
    process.env.SLACK_DEFAULT_CHANNEL ||
    ''
  return raw
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const window: Window = url.searchParams.get('window') === 'evening' ? 'evening' : 'morning'

    const channels = resolveDigestChannels()
    if (channels.length === 0) {
      return NextResponse.json({ ok: false, error: 'No Slack channel configured' }, { status: 400 })
    }

    // Pull today's events (ET) + venue + assigned techs + workflow state.
    const r = await query(
      `SELECT e.id, e.summary, e.workflow_status,
              CASE WHEN TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH24:MI') = '00:00'
                   THEN 'TBD'
                   ELSE TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') END as start_et,
              CASE WHEN TO_CHAR(e.end_time AT TIME ZONE 'America/New_York', 'HH24:MI') = '00:00'
                   THEN 'TBD'
                   ELSE TO_CHAR(e.end_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') END as end_et,
              v.name as venue_name,
              COALESCE(string_agg(DISTINCT s.full_name, ', ') FILTER (WHERE s.full_name IS NOT NULL), '') as techs,
              COUNT(DISTINCT ea.staff_id) FILTER (WHERE ea.staff_id IS NOT NULL) as assigned_count,
              BOOL_OR(ws.type = 'check_in') as has_check_in,
              BOOL_OR(ws.type = 'game_ready') as has_game_ready,
              BOOL_OR(ws.type = 'post_game_report') as has_post_game
       FROM events e
       LEFT JOIN venues v ON v.id = e.venue_id
       LEFT JOIN event_assignments ea ON ea.event_id = e.id
       LEFT JOIN staff s ON s.id = ea.staff_id
       LEFT JOIN workflow_submissions ws ON ws.event_id = e.id
       WHERE e.event_date = (NOW() AT TIME ZONE 'America/New_York')::date
       GROUP BY e.id, v.name
       ORDER BY e.start_time ASC`
    )

    const events = r.rows
    const baseUrl = (process.env.NEXT_PUBLIC_URL || 'https://services.ancsports.net').replace(/\/+$/, '')
    const dashboardUrl = `${baseUrl}/events`

    async function fanOut(body: { text: string; blocks?: any[] }) {
      const results = await Promise.all(channels.map((ch) => sendSlackMessage({ ...body, channel: ch })))
      return results.filter(Boolean).length
    }

    if (events.length === 0) {
      const text = window === 'morning'
        ? `:sunrise: *No ANC events scheduled today* — enjoy the quiet.\n<${dashboardUrl}|Open dashboard>`
        : `:crescent_moon: *No ANC events today* — nothing to recap.\n<${dashboardUrl}|Open dashboard>`
      const delivered = await fanOut({
        text: window === 'morning' ? 'No ANC events scheduled for today.' : 'No ANC events today — nothing to recap.',
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }],
      })
      return NextResponse.json({ ok: true, window, events_posted: 0, channels: channels.length, delivered })
    }

    // Summary counters for the header pill row — "at a glance" for Joe.
    const assignedCount = events.filter((e: any) => (e.assigned_count || 0) > 0).length
    const unassignedCount = events.length - assignedCount
    const checkedInCount = events.filter((e: any) => e.has_check_in).length
    const gameReadyCount = events.filter((e: any) => e.has_game_ready).length
    const postGameCount = events.filter((e: any) => e.has_post_game).length

    // Morning: unassigned risk first, then by start time. Evening: sort
    // missing-post-game first so leadership sees the close-out gap instantly.
    const sorted = [...events].sort((a: any, b: any) => {
      if (window === 'morning') {
        const au = (a.assigned_count || 0) === 0 ? 0 : 1
        const bu = (b.assigned_count || 0) === 0 ? 0 : 1
        if (au !== bu) return au - bu
      } else {
        const ap = a.has_post_game ? 1 : 0
        const bp = b.has_post_game ? 1 : 0
        if (ap !== bp) return ap - bp
      }
      return String(a.start_et || '').localeCompare(String(b.start_et || ''))
    })

    const title = window === 'morning'
      ? `:sunrise: *ANC Events — Today (${events.length})*`
      : `:crescent_moon: *ANC End-of-Day Recap — Today (${events.length})*`

    const summaryPills = window === 'morning'
      ? [
          unassignedCount > 0
            ? `:red_circle: *${unassignedCount} unassigned*`
            : ':white_check_mark: *all staffed*',
          `:busts_in_silhouette: ${assignedCount} staffed`,
        ]
      : [
          `:white_check_mark: ${checkedInCount}/${events.length} checked in`,
          `:stadium: ${gameReadyCount}/${events.length} game-ready`,
          `:clipboard: ${postGameCount}/${events.length} post-game`,
        ]

    const header = `${title}\n${summaryPills.join('  ·  ')}\n<${dashboardUrl}|Open dashboard →>`

    const lines = sorted.map((e: any) => {
      const statusFlags: string[] = []
      if (e.has_check_in) statusFlags.push(':white_check_mark: check-in')
      if (e.has_game_ready) statusFlags.push(':stadium: ready')
      if (e.has_post_game) statusFlags.push(':clipboard: post-game')
      const missing: string[] = []
      if (!e.has_check_in) missing.push('check-in')
      if (!e.has_game_ready) missing.push('game-ready')
      if (window === 'evening' && !e.has_post_game) missing.push('post-game')
      const techs = e.techs ? `_${e.techs}_` : e.assigned_count > 0 ? `${e.assigned_count} assigned` : ':red_circle: *unassigned*'
      const time = `${e.start_et}${e.end_et ? ` → ${e.end_et}` : ''}`
      const eventLink = e.id ? `<${baseUrl}/workflow/${e.id}|open>` : ''
      const eventLabel = eventLink ? `${e.summary} · ${eventLink}` : e.summary

      if (window === 'morning') {
        return `• *${time}* — ${eventLabel} @ ${e.venue_name || 'venue tbd'}\n   ${techs}`
      }
      const statusText = statusFlags.length ? statusFlags.join(' · ') : ':hourglass_flowing_sand: pending'
      const missingText = missing.length ? `  _missing: ${missing.join(', ')}_` : ''
      return `• *${eventLabel}* @ ${e.venue_name || 'venue tbd'} — ${techs}\n   ${statusText}${missingText}`
    })

    // Slack blocks have a 3000-char text limit per section; chunk if needed.
    const chunks: string[] = []
    let current = ''
    for (const line of lines) {
      if (current.length + line.length + 2 > 2800) {
        chunks.push(current)
        current = line
      } else {
        current = current ? `${current}\n${line}` : line
      }
    }
    if (current) chunks.push(current)

    const delivered = await fanOut({
      text: window === 'morning' ? 'ANC events today' : 'ANC events end-of-day recap',
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: header } },
        { type: 'divider' },
        ...chunks.map((c) => ({ type: 'section', text: { type: 'mrkdwn', text: c } })),
      ],
    })

    return NextResponse.json({ ok: true, window, events_posted: events.length, channels: channels.length, delivered })
  } catch (err) {
    console.error('[daily-events-brief] error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal' }, { status: 500 })
  }
}
