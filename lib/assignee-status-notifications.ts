import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'

type WorkKind = 'Design Request' | 'CG Request' | 'Content Schedule'

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
  sent_count: number
  skipped_count: number
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

export async function notifyAssigneesOfStatusChange(input: NotificationInput): Promise<NotificationSummary> {
  const assigneeIds = uniqueIds(input.assigneeIds)
  if (!assigneeIds.length) {
    return { target_count: 0, sent_count: 0, skipped_count: 0 }
  }

  const staff = await query(
    `SELECT id, full_name, slack_user_ids
     FROM staff
     WHERE id::text = ANY($1::text[])
       AND COALESCE(is_active, true) = true`,
    [assigneeIds],
  )

  const title = input.title?.trim() || input.recordId
  const statusLabel = labelStatus(input.status)
  const previous = input.previousStatus ? ` from ${labelStatus(input.previousStatus)}` : ''
  const url = `${appBaseUrl()}${input.path}`
  let sent = 0
  let skipped = 0

  for (const person of staff.rows) {
    const slackUserIds = Array.isArray(person.slack_user_ids) ? person.slack_user_ids.filter(Boolean) : []
    const slackUserId = slackUserIds[0]
    if (!slackUserId) {
      skipped += 1
      continue
    }

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
    if (ok) sent += 1
    else skipped += 1
  }

  return { target_count: staff.rows.length, sent_count: sent, skipped_count: skipped }
}

function uniqueIds(ids: Array<string | null | undefined>) {
  return Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)))
}
