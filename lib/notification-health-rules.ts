/**
 * When are notifications "unhealthy"?
 *
 * Pure, import-free, and therefore loadable by `node --test` — the rules that
 * decide whether somebody gets woken up should be the most testable code in the
 * system, not the least. `notification-log.ts` gathers the numbers; this decides
 * what they mean.
 */

export type NotificationStats = {
  mailConfigured: boolean
  windowHours: number
  attempts: number
  failed: number
  /** Assignees who were reached on no channel at all. */
  unreachableEvents: number
  /** Active staff with no usable email address. */
  staffWithoutEmail: number
  /** Set when the delivery log could not be read. */
  logUnreadable?: boolean
}

/** Below this many attempts a failure percentage is noise, not signal. */
export const RATE_MIN_ATTEMPTS = 10
/** Above this share of failed attempts, something is wrong upstream. */
export const RATE_THRESHOLD = 0.25

export function assessNotificationHealth(stats: NotificationStats): string[] {
  const problems: string[] = []

  if (!stats.mailConfigured) {
    problems.push('No mail credential is set — every status email will be dropped before it is sent.')
  }

  if (stats.logUnreadable) {
    problems.push('The delivery log could not be read, so notification health is unknown.')
  }

  // One person nobody could reach is the exact shape of the original bug, and
  // it disappears inside a percentage. Always name it.
  if (stats.unreachableEvents > 0) {
    problems.push(
      `${stats.unreachableEvents} notification${stats.unreachableEvents === 1 ? '' : 's'} in the last ${stats.windowHours}h reached nobody at all.`,
    )
  }

  const rate = stats.attempts > 0 ? stats.failed / stats.attempts : 0
  if (stats.attempts >= RATE_MIN_ATTEMPTS && rate > RATE_THRESHOLD) {
    problems.push(`${Math.round(rate * 100)}% of notification attempts failed in the last ${stats.windowHours}h.`)
  }

  if (stats.staffWithoutEmail > 0) {
    problems.push(
      `${stats.staffWithoutEmail} active staff have no email address on file and can only be reached by Slack.`,
    )
  }

  return problems
}

export function failureRate(attempts: number, failed: number): number {
  return attempts > 0 ? failed / attempts : 0
}
