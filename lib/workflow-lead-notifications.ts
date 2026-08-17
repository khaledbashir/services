/**
 * Telling the venue's leadership that a workflow step actually happened —
 * Joe 2026-08-17.
 *
 * "Currently we do not get notified when employees check in and are game
 *  ready, we only know if they do not - We would like to change this - Can we
 *  have the check in and post game report come to us?"
 *
 * This is deliberately NOT the `workflow-success-pings` toggle. That toggle
 * posts completions into the venue channel and the audit channel, which is a
 * room, not a person — it was switched off on 2026-04-29 precisely because it
 * was noise. What Joe asked for here is the venue's own manager and lead field
 * rep being told directly, so the message lands with the people accountable
 * for that building and nobody else.
 *
 * One direct message per step per recipient. The reminder cron still covers
 * the missed-step case; this covers the completed-step case, and the two
 * together mean leadership sees both halves of the picture.
 */
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'

export type WorkflowStepType = 'check_in' | 'game_ready' | 'post_game_report'

const STEP_LABELS: Record<WorkflowStepType, { label: string; emoji: string }> = {
  check_in: { label: 'Checked in', emoji: ':white_check_mark:' },
  game_ready: { label: 'Game ready', emoji: ':stadium:' },
  post_game_report: { label: 'Post-game report submitted', emoji: ':clipboard:' },
}

export interface WorkflowLeadNotification {
  eventId: string
  venueId: string | null
  step: WorkflowStepType
  staffName: string
  eventName: string
  venueName: string
  /** Post-game only: the incident text as submitted, blank when none. */
  incidentText?: string
}

export interface WorkflowLeadNotifyResult {
  target_count: number
  sent_count: number
  skipped_count: number
}

function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_URL || 'https://services.ancsports.net').replace(/\/+$/, '')
}

/**
 * The venue's manager and lead field rep, de-duplicated — one person often
 * holds both roles and must not be messaged twice for one event.
 */
async function loadVenueLeads(venueId: string): Promise<Array<{ id: string; full_name: string; slack_user_ids: string[] }>> {
  const result = await query(
    `SELECT DISTINCT s.id, s.full_name, s.slack_user_ids
     FROM venues v
     JOIN staff s ON s.id IN (v.venue_manager_id, v.lead_field_rep_id)
     WHERE v.id = $1
       AND COALESCE(s.is_active, true) = true`,
    [venueId],
  )
  return result.rows.map((row) => ({
    id: row.id,
    full_name: row.full_name,
    slack_user_ids: Array.isArray(row.slack_user_ids) ? row.slack_user_ids.filter(Boolean) : [],
  }))
}

export async function notifyLeadsOfWorkflowStep(
  input: WorkflowLeadNotification,
): Promise<WorkflowLeadNotifyResult> {
  if (!input.venueId) return { target_count: 0, sent_count: 0, skipped_count: 0 }

  const leads = await loadVenueLeads(input.venueId)
  if (leads.length === 0) return { target_count: 0, sent_count: 0, skipped_count: 0 }

  const step = STEP_LABELS[input.step]
  const url = `${appBaseUrl()}/workflow/${input.eventId}`

  const incident = (input.incidentText || '').trim()
  const hasIncident =
    input.step === 'post_game_report'
    && incident.length > 0
    && !['none', 'n/a', 'no', 'na'].includes(incident.toLowerCase())

  const blocks: any[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${step.emoji} *${step.label}* — ${input.staffName}\n*${input.eventName}* @ ${input.venueName}`,
      },
    },
  ]

  if (input.step === 'post_game_report') {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: hasIncident
          ? `:rotating_light: *Incident reported*\n${incident.slice(0, 600)}`
          : ':white_check_mark: *No incident reported*',
      },
    })
  }

  blocks.push({
    type: 'actions',
    elements: [
      { type: 'button', text: { type: 'plain_text', text: 'Open workflow' }, url, style: 'primary' },
    ],
  })

  let sent = 0
  let skipped = 0
  for (const lead of leads) {
    const slackUserId = lead.slack_user_ids[0]
    if (!slackUserId) {
      skipped += 1
      continue
    }
    const ok = await sendSlackMessage({
      channel: slackUserId,
      text: `${step.label}: ${input.eventName} @ ${input.venueName} by ${input.staffName}`,
      blocks,
    })
    if (ok) sent += 1
    else skipped += 1
  }

  return { target_count: leads.length, sent_count: sent, skipped_count: skipped }
}
