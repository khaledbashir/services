#!/usr/bin/env node
/**
 * Fire a ticket digest on demand, outside the 8 AM schedule.
 *
 * Runs the exact SQL, mapping and renderer the scheduled send uses — the only
 * difference is where the rows come from (psql on the host instead of the app's
 * pool), so what this prints is byte-for-byte what the cron will mail.
 *
 *   node scripts/fire-ticket-digest.mjs --report open-review --out /tmp/review.html
 *   node scripts/fire-ticket-digest.mjs --report open-review --send you@anc.com
 */

import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import {
  TICKET_DIGEST_SELECT,
  mapTicketRow,
  renderActivityEmail,
  renderOpenReviewEmail,
  renderOpenReviewSlack,
  REPORT_SUBJECTS,
  sortForReview,
  summariseReview,
} from '../lib/ticket-digest-format.ts'

const args = process.argv.slice(2)
const flag = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const report = flag('report', 'open-review')
const outPath = flag('out')
const sendTo = (flag('send') || '').split(',').map((s) => s.trim()).filter((s) => s.includes('@'))
const slackChannel = flag('slack')
const skipEmpty = args.includes('--skip-empty')
const baseUrl = flag('base-url', 'https://services.ancsports.net')

const DB_CONTAINER = 'anc-services-db-standalone'
const WHERE = {
  'open-review': `WHERE t.status <> 'closed' AND t.merged_into_ticket_id IS NULL`,
  escalated: `WHERE t.status = 'escalated' AND t.merged_into_ticket_id IS NULL`,
  'new-24h': `WHERE t.merged_into_ticket_id IS NULL AND t.created_at >= NOW() - INTERVAL '24 hours' ORDER BY t.ticket_number DESC`,
  'closed-24h': `WHERE t.merged_into_ticket_id IS NULL AND t.status = 'closed' AND COALESCE(t.resolved_at, t.updated_at) >= NOW() - INTERVAL '24 hours' ORDER BY t.ticket_number DESC`,
}
if (!WHERE[report]) throw new Error(`unknown report: ${report}`)

const sql = `SELECT COALESCE(json_agg(row_to_json(d)), '[]'::json)::text FROM (${TICKET_DIGEST_SELECT} ${WHERE[report]}) d`
const raw = execFileSync(
  'docker',
  ['exec', '-i', DB_CONTAINER, 'psql', '-U', 'ancservices', '-d', 'anc_services', '-t', '-A', '-c', sql],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
)

const now = new Date()
const rows = JSON.parse(raw.trim()).map((r) => mapTicketRow(r, now, baseUrl))
const ordered = report === 'open-review' || report === 'escalated' ? sortForReview(rows) : rows

const ctx = {
  dateLabel: new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(now),
  baseUrl,
}

const html = report === 'open-review' ? renderOpenReviewEmail(ordered, ctx) : renderActivityEmail(report, ordered, ctx)
const summary = summariseReview(ordered)
const subject = REPORT_SUBJECTS[report](ordered.length, ctx.dateLabel)

if (skipEmpty && ordered.length === 0) {
  console.log(JSON.stringify({ report, rows: 0, skipped: 'nothing to report' }))
  process.exit(0)
}

if (outPath) {
  writeFileSync(outPath, html)
  console.log(`wrote ${outPath} (${html.length} bytes)`)
}

if (sendTo.length > 0) {
  const key = process.env.SENDGRID_API_KEY || process.env.EMAIL_SMTP_PASSWORD
  if (!key) throw new Error('no SendGrid key in env')
  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      personalizations: [{ to: sendTo.map((email) => ({ email })) }],
      from: { email: process.env.EMAIL_FROM_ADDRESS || 'noreply@anc.com', name: 'ANC' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }),
  })
  console.log(`email -> ${sendTo.join(', ')} : ${res.status} ${res.status === 202 ? 'accepted' : await res.text()}`)
}

if (slackChannel) {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) throw new Error('no SLACK_BOT_TOKEN in env')
  const msg = renderOpenReviewSlack(ordered, ctx)
  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel: slackChannel, text: msg.text, blocks: msg.blocks }),
  })
  const body = await res.json()
  console.log(`slack -> ${slackChannel} : ${body.ok ? 'posted' : JSON.stringify(body)}`)
}

console.log(JSON.stringify({ report, rows: ordered.length, summary, subject }, null, 2))
