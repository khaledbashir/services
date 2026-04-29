import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'
import { ContentSchedule, isTwentyBackedEnabled } from '@/lib/twenty-ops'

/**
 * Day-before launch + takedown reminders for content schedules.
 * From Alexis on the 2026-04-29 call: "On May 1 we get a reminder that all of
 * these things are set to go live, and the day before takedown we get a
 * reminder that these three things would be taken down for tomorrow."
 *
 * Trigger: GET /api/cron/content-schedule-reminders (EasyPanel cron daily)
 *   0 16 * * *  curl -s https://services.ancsports.net/api/cron/content-schedule-reminders
 *
 * The dedup log (content_schedule_reminders_log) guarantees the same
 * schedule + kind + target-date combo never sends twice — safe to re-run.
 */

const LAUNCH_INACTIVE = new Set(['confirmed_live', 'completed', 'cancelled', 'archived'])
const TAKEDOWN_ACTIVE = new Set(['content_live', 'in_queue', 'in_progress', 'scheduled', 'ready', 'pending', 'request_submitted'])

interface Reminder {
  id: string
  title: string
  venue: string | null
  client: string | null
}

const targetChannel = (): string => {
  const explicit = process.env.SLACK_DESIGN_CHANNEL || process.env.SLACK_CONTENT_CHANNEL
  if (explicit && explicit.trim().length) return explicit
  return process.env.SLACK_DEFAULT_CHANNEL || ''
}

function tomorrowIso(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

async function loadLaunchesPostgres(date: string): Promise<Reminder[]> {
  const res = await query(
    `SELECT cs.id::text, cs.content_name as title, cs.company_name as client,
            v.name as venue
     FROM content_schedules cs
     LEFT JOIN venues v ON cs.venue_id = v.id
     WHERE cs.launch_date = $1
       AND COALESCE(cs.status, 'in_queue') NOT IN ('confirmed_live', 'completed', 'cancelled', 'archived')`,
    [date],
  )
  return res.rows.map((r) => ({ id: r.id, title: r.title || '(untitled)', venue: r.venue, client: r.client }))
}

async function loadTakedownsPostgres(date: string): Promise<Reminder[]> {
  const res = await query(
    `SELECT cs.id::text, cs.content_name as title, cs.company_name as client,
            v.name as venue
     FROM content_schedules cs
     LEFT JOIN venues v ON cs.venue_id = v.id
     WHERE cs.end_date = $1
       AND COALESCE(cs.status, 'in_queue') NOT IN ('confirmed_live', 'completed', 'cancelled', 'archived')`,
    [date],
  )
  return res.rows.map((r) => ({ id: r.id, title: r.title || '(untitled)', venue: r.venue, client: r.client }))
}

async function loadLaunchesTwenty(date: string): Promise<Reminder[]> {
  const out: Reminder[] = []
  let cursor: string | null = null
  for (let page = 0; page < 20; page++) {
    const batch = await ContentSchedule.list({
      limit: 60,
      startingAfter: cursor || undefined,
      filter: `startDate[eq]:"${date}"`,
      orderBy: 'startDate[AscNullsLast]',
    })
    for (const cs of batch.items) {
      const status = ((cs.status || '') + '').replace(/^STATUS_/i, '').toLowerCase()
      if (LAUNCH_INACTIVE.has(status)) continue
      out.push({
        id: cs.id,
        title: cs.contentTitle || cs.name || '(untitled)',
        venue: null, // Twenty contentSchedules have no venue relation.
        client: cs.scheduleClient?.name || null,
      })
    }
    if (!batch.hasNextPage || !batch.nextCursor) break
    cursor = batch.nextCursor
  }
  return out
}

async function loadTakedownsTwenty(date: string): Promise<Reminder[]> {
  const out: Reminder[] = []
  let cursor: string | null = null
  for (let page = 0; page < 20; page++) {
    const batch = await ContentSchedule.list({
      limit: 60,
      startingAfter: cursor || undefined,
      filter: `endDate[eq]:"${date}"`,
      orderBy: 'endDate[AscNullsLast]',
    })
    for (const cs of batch.items) {
      const status = ((cs.status || '') + '').replace(/^STATUS_/i, '').toLowerCase()
      if (LAUNCH_INACTIVE.has(status)) continue
      out.push({
        id: cs.id,
        title: cs.contentTitle || cs.name || '(untitled)',
        venue: null,
        client: cs.scheduleClient?.name || null,
      })
    }
    if (!batch.hasNextPage || !batch.nextCursor) break
    cursor = batch.nextCursor
  }
  return out
}

async function filterAlreadySent(items: Reminder[], kind: 'launch' | 'takedown', forDate: string): Promise<Reminder[]> {
  if (items.length === 0) return []
  const sentRes = await query(
    `SELECT schedule_id FROM content_schedule_reminders_log
     WHERE kind = $1 AND reminder_for_date = $2 AND schedule_id = ANY($3::text[])`,
    [kind, forDate, items.map((i) => i.id)],
  )
  const sent = new Set(sentRes.rows.map((r: any) => r.schedule_id))
  return items.filter((i) => !sent.has(i.id))
}

async function recordSent(items: Reminder[], kind: 'launch' | 'takedown', forDate: string) {
  if (items.length === 0) return
  const valuesSql = items.map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`).join(', ')
  const params: any[] = []
  items.forEach((i) => params.push(i.id, kind, forDate))
  await query(
    `INSERT INTO content_schedule_reminders_log (schedule_id, kind, reminder_for_date)
     VALUES ${valuesSql}
     ON CONFLICT (schedule_id, kind, reminder_for_date) DO NOTHING`,
    params,
  )
}

function formatBlocks(kind: 'launch' | 'takedown', date: string, items: Reminder[]) {
  const emoji = kind === 'launch' ? '🚀' : '📦'
  const verb = kind === 'launch' ? 'Going live' : 'Coming down'
  const headline = `${emoji} *${verb} tomorrow* (${fmtDate(date)}) — ${items.length} ${items.length === 1 ? 'item' : 'items'}`
  const lines = items.map((i) => {
    const meta = [i.client, i.venue].filter(Boolean).join(' · ')
    return meta ? `• *${i.title}* — ${meta}` : `• *${i.title}*`
  })
  return [
    { type: 'section', text: { type: 'mrkdwn', text: headline } },
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ]
}

export async function GET() {
  const date = tomorrowIso()
  const useTwenty = isTwentyBackedEnabled('CONTENT_SCHEDULES')

  try {
    const [launchesAll, takedownsAll] = await Promise.all([
      useTwenty ? loadLaunchesTwenty(date) : loadLaunchesPostgres(date),
      useTwenty ? loadTakedownsTwenty(date) : loadTakedownsPostgres(date),
    ])

    const launches = await filterAlreadySent(launchesAll, 'launch', date)
    const takedowns = await filterAlreadySent(takedownsAll, 'takedown', date)

    const channel = targetChannel()
    if (!channel) {
      return NextResponse.json({
        ok: false,
        error: 'No Slack channel configured (set SLACK_DESIGN_CHANNEL or SLACK_DEFAULT_CHANNEL)',
        reminder_for_date: date,
        launches: { found: launchesAll.length, new: launches.length },
        takedowns: { found: takedownsAll.length, new: takedowns.length },
      }, { status: 500 })
    }

    let launchSent = false
    let takedownSent = false

    if (launches.length > 0) {
      const blocks = formatBlocks('launch', date, launches)
      launchSent = await sendSlackMessage({
        channel,
        text: `${launches.length} content ${launches.length === 1 ? 'piece is' : 'pieces are'} going live tomorrow`,
        blocks,
      })
      if (launchSent) await recordSent(launches, 'launch', date)
    }

    if (takedowns.length > 0) {
      const blocks = formatBlocks('takedown', date, takedowns)
      takedownSent = await sendSlackMessage({
        channel,
        text: `${takedowns.length} content ${takedowns.length === 1 ? 'piece is' : 'pieces are'} taking down tomorrow`,
        blocks,
      })
      if (takedownSent) await recordSent(takedowns, 'takedown', date)
    }

    return NextResponse.json({
      ok: true,
      reminder_for_date: date,
      backend: useTwenty ? 'twenty' : 'postgres',
      launches: { found: launchesAll.length, new: launches.length, sent: launchSent },
      takedowns: { found: takedownsAll.length, new: takedowns.length, sent: takedownSent },
      channel: channel || 'default',
    })
  } catch (err: any) {
    console.error('[cron/content-schedule-reminders] fatal:', err)
    return NextResponse.json(
      { ok: false, error: err?.message || 'Unknown error' },
      { status: 500 },
    )
  }
}
