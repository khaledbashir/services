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
import { sendEmail } from '@/lib/email'
import { brandedEmail } from '@/lib/email-templates'
import { getRecipients } from '@/lib/ticket-digests'

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
async function loadVenueLeads(
  venueId: string,
): Promise<Array<{ id: string; full_name: string; email: string | null; slack_user_ids: string[] }>> {
  const result = await query(
    `SELECT DISTINCT s.id, s.full_name, s.email, s.slack_user_ids
     FROM venues v
     JOIN staff s ON s.id IN (v.venue_manager_id, v.lead_field_rep_id)
     WHERE v.id = $1
       AND COALESCE(s.is_active, true) = true`,
    [venueId],
  )
  return result.rows.map((row) => ({
    id: row.id,
    full_name: row.full_name,
    email: row.email || null,
    slack_user_ids: Array.isArray(row.slack_user_ids) ? row.slack_user_ids.filter(Boolean) : [],
  }))
}

/**
 * Ops leadership, who get every step regardless of which venue it happened at.
 *
 * Joe's words were "can we have the check in and post game report come to US" —
 * and he leads no venue, so per-venue routing alone would have sent him
 * nothing. The default is the same list the ticket reports already go to, so
 * "us" resolves to the people who already receive operational mail, and it can
 * be changed later with one app_settings row instead of a deploy.
 */
async function alwaysNotifyEmails(): Promise<string[]> {
  const row = await query(
    `SELECT value FROM app_settings WHERE key = 'workflow_lead_notify_always'`,
  )
  if (row.rows[0]) {
    const stored = String(row.rows[0].value ?? '')
    // An explicit empty string is a deliberate "leadership opted out".
    if (stored.trim() === '') return []
    const parsed = stored.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => s.includes('@'))
    if (parsed.length > 0) return parsed
  }
  return getRecipients('open-review')
}

/**
 * Which steps notify the leads. Defaults to all three because Joe named
 * check-in and post-game explicitly and complained about game-ready too. It
 * reads from app_settings so the volume can be dialled back to post-game only
 * with a one-row change rather than a deploy.
 */
async function enabledSteps(): Promise<Set<WorkflowStepType>> {
  const row = await query(
    `SELECT value FROM app_settings WHERE key = 'workflow_lead_notify_steps'`,
  )
  const raw = row.rows[0] ? String(row.rows[0].value ?? '') : ''
  if (!raw.trim()) return new Set<WorkflowStepType>(['check_in', 'game_ready', 'post_game_report'])
  const parsed = raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)
  return new Set(parsed.filter((s): s is WorkflowStepType => s in STEP_LABELS))
}

export async function notifyLeadsOfWorkflowStep(
  input: WorkflowLeadNotification,
): Promise<WorkflowLeadNotifyResult> {
  if (!input.venueId) return { target_count: 0, sent_count: 0, skipped_count: 0 }

  const steps = await enabledSteps()
  if (!steps.has(input.step)) return { target_count: 0, sent_count: 0, skipped_count: 0 }

  const leads = await loadVenueLeads(input.venueId)
  const alwaysEmails = await alwaysNotifyEmails()

  // A venue with nobody recorded as its lead must still report upward — that
  // is precisely the venue leadership most needs to hear about.
  const leadEmails = new Set(
    leads.map((lead) => (lead.email || '').toLowerCase()).filter(Boolean),
  )
  const extraEmails = alwaysEmails.filter((email) => !leadEmails.has(email.toLowerCase()))

  if (leads.length === 0 && extraEmails.length === 0) {
    return { target_count: 0, sent_count: 0, skipped_count: 0 }
  }

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

  const subject = `${step.label} — ${input.eventName} @ ${input.venueName}`

  const emailHtml = brandedEmail({
    title: step.label,
    subtitle: `${input.eventName} · ${input.venueName}`,
    bodyHtml: `
      <p style="margin:0 0 8px"><strong>${input.staffName}</strong> — ${step.label.toLowerCase()}.</p>
      ${input.step === 'post_game_report'
        ? (hasIncident
            ? `<p style="margin:12px 0 0;color:#b91c1c"><strong>Incident reported</strong></p>
               <p style="margin:6px 0 0">${incident.slice(0, 600).replace(/</g, '&lt;')}</p>`
            : '<p style="margin:12px 0 0;color:#047857"><strong>No incident reported</strong></p>')
        : ''}
      <p style="margin:16px 0 0"><a href="${url}">Open the workflow</a></p>
    `,
    footerNote: 'ANC Sports · venue workflow',
  })

  let sent = 0
  let skipped = 0
  for (const lead of leads) {
    // Slack DM is the better channel and upgrades automatically as staff Slack
    // IDs get filled in. Today only one active staff record has one, so email
    // is what actually reaches the 17 venue leads — without this fallback the
    // whole feature would resolve the right people and message nobody.
    const slackUserId = lead.slack_user_ids[0]
    if (slackUserId) {
      const ok = await sendSlackMessage({
        channel: slackUserId,
        text: `${step.label}: ${input.eventName} @ ${input.venueName} by ${input.staffName}`,
        blocks,
      })
      if (ok) { sent += 1; continue }
    }

    if (!lead.email) {
      skipped += 1
      continue
    }

    const html = brandedEmail({
      title: step.label,
      subtitle: `${input.eventName} · ${input.venueName}`,
      bodyHtml: `
        <p style="margin:0 0 8px"><strong>${input.staffName}</strong> — ${step.label.toLowerCase()}.</p>
        ${input.step === 'post_game_report'
          ? (hasIncident
              ? `<p style="margin:12px 0 0;color:#b91c1c"><strong>Incident reported</strong></p>
                 <p style="margin:6px 0 0">${incident.slice(0, 600).replace(/</g, '&lt;')}</p>`
              : '<p style="margin:12px 0 0;color:#047857"><strong>No incident reported</strong></p>')
          : ''}
        <p style="margin:16px 0 0"><a href="${url}">Open the workflow</a></p>
      `,
      footerNote: 'ANC Sports · venue workflow',
    })

    const ok = await sendEmail([lead.email], subject, html)
    if (ok) sent += 1
    else skipped += 1
  }

  return { target_count: leads.length, sent_count: sent, skipped_count: skipped }
}
