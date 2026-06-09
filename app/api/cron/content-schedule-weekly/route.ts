export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'

type ChangeKind = 'launch' | 'takedown'

interface WeeklyChange {
  id: string
  kind: ChangeKind
  title: string
  client: string | null
  venue: string | null
  change_date: string
}

const targetChannel = (): string => {
  const explicit = process.env.SLACK_CONTENT_CHANNEL || process.env.SLACK_DESIGN_CHANNEL
  if (explicit && explicit.trim().length) return explicit
  return process.env.SLACK_DEFAULT_CHANNEL || ''
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function nextSevenDays() {
  const start = new Date()
  const end = new Date()
  end.setDate(end.getDate() + 7)
  return { start: isoDate(start), end: isoDate(end) }
}

function fmtDate(iso: string): string {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

async function loadChanges(start: string, end: string): Promise<WeeklyChange[]> {
  const res = await query(
    `SELECT *
     FROM (
       SELECT cs.id::text, 'launch'::text as kind, cs.content_name as title,
              cs.company_name as client, v.name as venue, cs.launch_date as change_date
       FROM content_schedules cs
       LEFT JOIN venues v ON v.id = cs.venue_id
       WHERE cs.launch_date >= $1::date
         AND cs.launch_date < $2::date
         AND COALESCE(cs.status, 'in_queue') NOT IN ('done', 'content_removed', 'cancelled', 'archived')
       UNION ALL
       SELECT cs.id::text, 'takedown'::text as kind, cs.content_name as title,
              cs.company_name as client, v.name as venue, cs.end_date as change_date
       FROM content_schedules cs
       LEFT JOIN venues v ON v.id = cs.venue_id
       WHERE cs.end_date >= $1::date
         AND cs.end_date < $2::date
         AND COALESCE(cs.status, 'in_queue') NOT IN ('done', 'cancelled', 'archived')
     ) changes
     ORDER BY change_date ASC, kind ASC, title ASC`,
    [start, end],
  )
  return res.rows.map((row: any) => ({
    id: row.id,
    kind: row.kind,
    title: row.title || '(untitled)',
    client: row.client || null,
    venue: row.venue || null,
    change_date: isoDate(new Date(row.change_date)),
  }))
}

async function alreadySent(start: string): Promise<boolean> {
  const res = await query(
    `SELECT 1
     FROM content_schedule_reminders_log
     WHERE kind = 'weekly' AND reminder_for_date = $1
     LIMIT 1`,
    [start],
  )
  return res.rows.length > 0
}

async function recordSent(start: string) {
  await query(
    `INSERT INTO content_schedule_reminders_log (schedule_id, kind, reminder_for_date)
     VALUES ($1, 'weekly', $2::date)
     ON CONFLICT (schedule_id, kind, reminder_for_date) DO NOTHING`,
    [`weekly-${start}`, start],
  )
}

function formatBlocks(start: string, end: string, changes: WeeklyChange[]) {
  const lines = changes.map((change) => {
    const action = change.kind === 'launch' ? 'Launch' : 'Remove'
    const meta = [change.client, change.venue].filter(Boolean).join(' · ')
    const tail = meta ? ` — ${meta}` : ''
    return `• *${fmtDate(change.change_date)}* — ${action}: *${change.title}*${tail}`
  })
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Content changes next week* (${fmtDate(start)} through ${fmtDate(end)}) — ${changes.length} ${changes.length === 1 ? 'change' : 'changes'}`,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: lines.length ? lines.join('\n') : 'No launches or removals scheduled for the next seven days.' },
    },
  ]
}

export async function GET() {
  const { start, end } = nextSevenDays()
  try {
    const channel = targetChannel()
    if (!channel) {
      return NextResponse.json({ ok: false, error: 'No Slack channel configured', start, end }, { status: 500 })
    }
    const sent = await alreadySent(start)
    if (sent) return NextResponse.json({ ok: true, skipped: true, reason: 'weekly reminder already sent', start, end })

    const changes = await loadChanges(start, end)
    const delivered = await sendSlackMessage({
      channel,
      text: `${changes.length} content changes scheduled over the next week`,
      blocks: formatBlocks(start, end, changes),
    })
    if (delivered) await recordSent(start)

    return NextResponse.json({ ok: true, start, end, changes: changes.length, sent: delivered, channel })
  } catch (err: any) {
    console.error('[cron/content-schedule-weekly] fatal:', err)
    return NextResponse.json({ ok: false, error: err?.message || 'Unknown error' }, { status: 500 })
  }
}
