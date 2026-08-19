import { query } from '@/lib/db'
import { assessNotificationHealth, failureRate } from '@/lib/notification-health-rules'

/**
 * Durable record of who was told what, on which channel, and whether it landed.
 *
 * The failure this exists to prevent: status-change notices were Slack-DM-only
 * and silently skipped anyone without a Slack id — no throw, no log, no row.
 * 99 of 189 active staff heard nothing for months and there was no way to see
 * it from the outside. A notification system that can fail quietly is not a
 * notification system, so every attempt is now written down and read back by
 * `/api/health/notifications` and the watchdog cron.
 *
 * Writing is always best-effort: an audit row must never break, delay or mask
 * the thing it is auditing.
 */

/**
 * `none` is not a channel — it is the record of a person nobody could reach on
 * any channel. It is the single most important row in this table.
 */
export type DeliveryChannel = 'email' | 'slack' | 'none'

export type DeliveryAttempt = {
  kind: string
  recordId?: string | null
  staffId?: string | null
  channel: DeliveryChannel
  recipient?: string | null
  ok: boolean
  /** Why it did not land, or why it was never tried. Short and greppable. */
  reason?: string | null
}

export async function recordDeliveries(attempts: DeliveryAttempt[]): Promise<void> {
  if (!attempts.length) return
  try {
    const values: unknown[] = []
    const rows = attempts.map((a, i) => {
      const o = i * 7
      values.push(
        a.kind,
        a.recordId ?? null,
        a.staffId ?? null,
        a.channel,
        a.recipient ?? null,
        a.ok,
        a.reason ?? null,
      )
      return `($${o + 1},$${o + 2},$${o + 3}::uuid,$${o + 4},$${o + 5},$${o + 6},$${o + 7})`
    })
    await query(
      `INSERT INTO notification_deliveries (kind, record_id, staff_id, channel, recipient, ok, reason)
       VALUES ${rows.join(',')}`,
      values,
    )
  } catch (err) {
    console.error('[notification-log] could not record delivery attempts:', err)
  }
}

export type NotificationHealth = {
  healthy: boolean
  problems: string[]
  mail_configured: boolean
  window_hours: number
  attempts: number
  delivered: number
  failed: number
  failure_rate: number
  unreachable_events: number
  active_staff: number
  staff_without_email: number
  staff_without_slack: number
  last_delivery_at: string | null
}

/** True when a mail credential is actually present, not merely expected. */
export function mailConfigured(): boolean {
  return Boolean(process.env.SENDGRID_API_KEY || process.env.EMAIL_SMTP_PASSWORD)
}

/**
 * Read the last `windowHours` of attempts and decide whether notifications are
 * actually working. Deliberately opinionated — a caller should be able to act on
 * `healthy` alone without interpreting the numbers.
 */
export async function notificationHealth(windowHours = 24): Promise<NotificationHealth> {
  const problems: string[] = []
  const configured = mailConfigured()

  let attempts = 0
  let delivered = 0
  let failed = 0
  let unreachable = 0
  let lastAt: string | null = null
  let logUnreadable = false
  let activeStaff = 0
  let noEmail = 0
  let noSlack = 0

  try {
    const stats = await query(
      `SELECT
         count(*)::int AS attempts,
         count(*) FILTER (WHERE ok)::int AS delivered,
         count(*) FILTER (WHERE NOT ok)::int AS failed,
         count(*) FILTER (WHERE NOT ok AND channel = 'none')::int AS unreachable,
         max(created_at) AS last_at
       FROM notification_deliveries
       WHERE created_at >= NOW() - ($1 || ' hours')::interval`,
      [String(windowHours)],
    )
    const row = stats.rows[0] || {}
    attempts = row.attempts || 0
    delivered = row.delivered || 0
    failed = row.failed || 0
    unreachable = row.unreachable || 0
    lastAt = row.last_at ? new Date(row.last_at).toISOString() : null
  } catch (err) {
    logUnreadable = true
    console.error('[notification-log] health read failed:', err)
  }

  try {
    const roster = await query(
      `SELECT
         count(*)::int AS active,
         count(*) FILTER (WHERE email IS NULL OR btrim(email) = '' OR email NOT LIKE '%@%')::int AS no_email,
         count(*) FILTER (WHERE slack_user_ids IS NULL OR array_length(slack_user_ids, 1) IS NULL)::int AS no_slack
       FROM staff
       WHERE COALESCE(is_active, true) = true`,
    )
    const row = roster.rows[0] || {}
    activeStaff = row.active || 0
    noEmail = row.no_email || 0
    noSlack = row.no_slack || 0
  } catch (err) {
    console.error('[notification-log] roster read failed:', err)
  }

  const rate = failureRate(attempts, failed)
  problems.push(
    ...assessNotificationHealth({
      mailConfigured: configured,
      windowHours,
      attempts,
      failed,
      unreachableEvents: unreachable,
      staffWithoutEmail: noEmail,
      logUnreadable,
    }),
  )

  return {
    healthy: problems.length === 0,
    problems,
    mail_configured: configured,
    window_hours: windowHours,
    attempts,
    delivered,
    failed,
    failure_rate: Number(rate.toFixed(4)),
    unreachable_events: unreachable,
    active_staff: activeStaff,
    staff_without_email: noEmail,
    staff_without_slack: noSlack,
    last_delivery_at: lastAt,
  }
}
