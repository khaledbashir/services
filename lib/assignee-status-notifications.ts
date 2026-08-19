import { query } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { brandedEmail } from '@/lib/email-templates'
import { sendSlackMessage } from '@/lib/slack'
import {
  renderStatusEmail,
  resolveStatusDelivery,
  type WorkKind,
} from '@/lib/assignee-status-email'

export { renderStatusEmail, resolveStatusDelivery } from '@/lib/assignee-status-email'

type NotificationInput = {
  kind: WorkKind
  recordId: string
  title: string | null | undefined
  status: string
  previousStatus?: string | null
  path: string
  assigneeIds: string[]
}

type NotificationSummary = {
  target_count: number
  /** Reached on at least one channel. */
  sent_count: number
  /** Reached on no channel at all — no Slack id AND no email on file. */
  skipped_count: number
  slack_sent_count: number
  email_sent_count: number
}

/** Zeroed summary for the "status did not actually change" branches. */
export function emptyStatusNotification(): NotificationSummary {
  return { target_count: 0, sent_count: 0, skipped_count: 0, slack_sent_count: 0, email_sent_count: 0 }
}

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_URL ||
    process.env.PUBLIC_APP_URL ||
    'https://services.ancsports.net'
  ).replace(/\/+$/, '')
}

function labelStatus(status: string) {
  return status
    .replace(/^STATUS_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export async function getDesignRequestAssigneeIds(recordId: string, fallbackIds: Array<string | null | undefined> = []) {
  const result = await query(
    `SELECT staff_id
     FROM (
       SELECT designer_id::text AS staff_id FROM design_requests WHERE id::text = $1 AND designer_id IS NOT NULL
       UNION
       SELECT enterprise_contact_id::text AS staff_id FROM design_requests WHERE id::text = $1 AND enterprise_contact_id IS NOT NULL
       UNION
       SELECT staff_id::text FROM design_request_designers WHERE design_request_id::text = $1
       UNION
       SELECT staff_id::text FROM design_request_enterprise_contacts WHERE design_request_id::text = $1
     ) assignees
     WHERE staff_id IS NOT NULL`,
    [recordId],
  )
  return uniqueIds([...fallbackIds, ...result.rows.map((row) => row.staff_id)])
}

export async function getCgDesignAssigneeIds(recordId: string, fallbackIds: Array<string | null | undefined> = []) {
  const result = await query(
    `SELECT staff_id
     FROM (
       SELECT designer_id::text AS staff_id FROM cg_design_requests WHERE id::text = $1 AND designer_id IS NOT NULL
       UNION
       SELECT staff_id::text FROM cg_design_designers WHERE cg_design_request_id::text = $1
       UNION
       SELECT staff_id::text FROM cg_design_enterprise_contacts WHERE cg_design_request_id::text = $1
     ) assignees
     WHERE staff_id IS NOT NULL`,
    [recordId],
  )
  return uniqueIds([...fallbackIds, ...result.rows.map((row) => row.staff_id)])
}

export async function getContentScheduleAssigneeIds(recordId: string, fallbackIds: Array<string | null | undefined> = []) {
  const result = await query(
    `SELECT staff_id
     FROM (
       SELECT operator_id::text AS staff_id FROM content_schedules WHERE id::text = $1 AND operator_id IS NOT NULL
       UNION
       SELECT staff_id::text FROM content_schedule_operators WHERE content_schedule_id::text = $1
       UNION
       SELECT staff_id::text FROM content_schedule_enterprise_contacts WHERE content_schedule_id::text = $1
     ) assignees
     WHERE staff_id IS NOT NULL`,
    [recordId],
  )
  return uniqueIds([...fallbackIds, ...result.rows.map((row) => row.staff_id)])
}

/**
 * Tell everyone assigned to a ticket that its status moved.
 *
 * This used to be Slack-DM-only, and silently dropped anyone without a Slack id
 * linked — 99 of 189 active staff at the time of writing, every one of whom has
 * an email address on file. Half the company was working a dashboard that never
 * told them anything had changed, which is why Alexis's team kept working in the
 * old tracker instead (asked 2026-08-19, with Joe endorsing: "anything is moved
 * from status to status. If anyone's assigned to something" — and email
 * explicitly preferred over Slack).
 *
 * Email is now the channel everyone gets. The Slack DM is left exactly as it was
 * for the people who already had it, so nobody loses a notification they relied
 * on. Someone with both gets both.
 */
export async function notifyAssigneesOfStatusChange(input: NotificationInput): Promise<NotificationSummary> {
  const empty: NotificationSummary = {
    target_count: 0,
    sent_count: 0,
    skipped_count: 0,
    slack_sent_count: 0,
    email_sent_count: 0,
  }

  const assigneeIds = uniqueIds(input.assigneeIds)
  if (!assigneeIds.length) return empty

  const staff = await query(
    `SELECT id, full_name, slack_user_ids, email
     FROM staff
     WHERE id::text = ANY($1::text[])
       AND COALESCE(is_active, true) = true`,
    [assigneeIds],
  )

  const title = input.title?.trim() || input.recordId
  const statusLabel = labelStatus(input.status)
  const previousLabel = input.previousStatus ? labelStatus(input.previousStatus) : null
  const previous = previousLabel ? ` from ${previousLabel}` : ''
  const url = `${appBaseUrl()}${input.path}`

  const summary: NotificationSummary = { ...empty, target_count: staff.rows.length }
  const emailedAlready = new Set<string>()

  for (const person of staff.rows) {
    let reached = false
    const { slackUserId, email } = resolveStatusDelivery(person)

    if (slackUserId) {
      const ok = await sendSlackMessage({
        channel: slackUserId,
        text: `${input.kind} status changed${previous} to ${statusLabel}: ${title}\n${url}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${input.kind} status changed*${previous} to *${statusLabel}*\n${title}`,
            },
          },
          { type: 'section', text: { type: 'mrkdwn', text: `<${url}|Open in dashboard>` } },
        ],
      })
      if (ok) {
        summary.slack_sent_count += 1
        reached = true
      }
    }

    const emailKey = email ? email.toLowerCase() : ''
    if (email && !emailedAlready.has(emailKey)) {
      emailedAlready.add(emailKey)
      const rendered = renderStatusEmail({
        fullName: typeof person.full_name === 'string' ? person.full_name : null,
        kind: input.kind,
        title,
        statusLabel,
        previousLabel,
        url,
      })
      const subject = rendered.subject
      const html = brandedEmail({
        title: rendered.title,
        subtitle: rendered.subtitle,
        bodyHtml: rendered.bodyHtml,
      })
      // Best effort: a mail failure must never mask the status change itself.
      const ok = await sendEmail([email], subject, html).catch((err) => {
        console.error('[assignee-status-notifications] status email failed:', err)
        return false
      })
      if (ok) {
        summary.email_sent_count += 1
        reached = true
      }
    }

    if (reached) summary.sent_count += 1
    else summary.skipped_count += 1
  }

  return summary
}

function uniqueIds(ids: Array<string | null | undefined>) {
  return Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)))
}
