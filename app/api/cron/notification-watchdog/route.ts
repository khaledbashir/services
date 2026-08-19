export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { brandedEmail } from '@/lib/email-templates'
import { notificationHealth } from '@/lib/notification-log'
import { sendSlackMessage } from '@/lib/slack'

/**
 * Watchdog for the notification system.
 *
 * The original failure was not that notifications broke — it was that they broke
 * *quietly*, for months, until a stakeholder happened to mention it on a call.
 * This runs on a schedule and makes that impossible: if status notices are not
 * landing, somebody is told before Alexis notices.
 *
 * Alerts go to Slack and to `NOTIFY_WATCHDOG_EMAIL`. Healthy runs say nothing —
 * a watchdog that cries every day gets muted, and a muted watchdog is the bug
 * all over again.
 *
 * `?force=1` alerts even when healthy, so the alert path itself can be proven
 * without waiting for a real outage.
 */

const ALERT_CHANNEL = process.env.SLACK_ALERT_CHANNEL || process.env.SLACK_DEFAULT_CHANNEL || ''
const ALERT_EMAIL = process.env.NOTIFY_WATCHDOG_EMAIL || ''

export async function GET(request: NextRequest) {
  const force = request.nextUrl.searchParams.get('force') === '1'
  const rawHours = Number(request.nextUrl.searchParams.get('hours'))
  const hours = Number.isFinite(rawHours) && rawHours > 0 ? Math.min(Math.floor(rawHours), 720) : 24

  const health = await notificationHealth(hours)
  const shouldAlert = !health.healthy || force

  const result = {
    checked_at: new Date().toISOString(),
    alerted: false,
    slack_sent: false,
    email_sent: false,
    ...health,
  }

  if (!shouldAlert) return NextResponse.json(result)

  const headline = health.healthy
    ? 'Notification watchdog test (system is healthy)'
    : 'Notifications are not landing'
  const lines = health.problems.length ? health.problems : ['Forced check — no problems found.']
  const detail =
    `Window: last ${health.window_hours}h · ` +
    `${health.delivered} delivered, ${health.failed} failed, ${health.unreachable_events} reached nobody · ` +
    `mail credential ${health.mail_configured ? 'present' : 'MISSING'}`

  if (ALERT_CHANNEL) {
    result.slack_sent = await sendSlackMessage({
      channel: ALERT_CHANNEL,
      text: `${headline}\n${lines.join('\n')}\n${detail}`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `*${headline}*\n${lines.map((l) => `• ${l}`).join('\n')}` } },
        { type: 'context', elements: [{ type: 'mrkdwn', text: detail }] },
      ],
    }).catch(() => false)
  }

  if (ALERT_EMAIL) {
    const html = brandedEmail({
      title: headline,
      subtitle: detail,
      bodyHtml: `<ul style="margin:0 0 16px;padding-left:18px">${lines
        .map((l) => `<li style="margin-bottom:6px">${l}</li>`)
        .join('')}</ul>
        <p style="margin:0;font-size:13px;color:#6b7280">Full detail: https://services.ancsports.net/api/health/notifications</p>`,
    })
    result.email_sent = await sendEmail([ALERT_EMAIL], `[ANC] ${headline}`, html).catch(() => false)
  }

  result.alerted = result.slack_sent || result.email_sent

  if (!result.alerted) {
    // Nothing must be able to swallow this one. If the watchdog itself cannot
    // reach anybody, the log is the last line of defence.
    console.error('[notification-watchdog] UNHEALTHY AND COULD NOT ALERT:', JSON.stringify(health))
  }

  return NextResponse.json(result, { status: health.healthy ? 200 : 503 })
}
