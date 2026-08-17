/**
 * Approving and rejecting suggested events — Joe 2026-08-17.
 *
 * "Additional events can be 'suggested' to the assigned venue lead and if
 *  approved can be added to the master schedule. If they are not approved or
 *  are rejected, they do not pull into the master schedule."
 *
 * The decision belongs to the venue's own lead, so authorisation is per-venue
 * rather than per-role: admins and tech support can act anywhere, a manager can
 * act on the venues they lead. Everyone else is refused.
 */
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'
import type { AuthUser } from '@/lib/rbac'

export interface SuggestedEventRow {
  id: string
  summary: string
  event_date: string
  event_type: string | null
  venue_id: string | null
  venue_name: string | null
  venue_manager_id: string | null
  lead_field_rep_id: string | null
  slack_channel_id: string | null
  approval_status: string
  suggestion_reason: string | null
}

export async function loadEventForApproval(eventId: string): Promise<SuggestedEventRow | null> {
  const result = await query(
    `SELECT e.id,
            e.summary,
            TO_CHAR(e.event_date, 'YYYY-MM-DD') AS event_date,
            e.event_type,
            e.venue_id,
            COALESCE(e.approval_status, 'approved') AS approval_status,
            e.suggestion_reason,
            v.name AS venue_name,
            v.venue_manager_id,
            v.lead_field_rep_id,
            v.slack_channel_id
     FROM events e
     LEFT JOIN venues v ON v.id = e.venue_id
     WHERE e.id = $1`,
    [eventId],
  )
  return result.rows[0] || null
}

/**
 * Who may accept or reject a suggestion for this venue.
 *
 * A manager with no venue leadership recorded is NOT given blanket rights —
 * that would quietly recreate "anyone can add anything to the schedule", which
 * is the behaviour this whole change exists to remove.
 */
export function canDecideApproval(user: AuthUser, event: SuggestedEventRow): boolean {
  if (user.role === 'admin' || user.role === 'tech_support') return true
  if (user.role !== 'manager') return false
  return event.venue_manager_id === user.userId || event.lead_field_rep_id === user.userId
}

export async function decideEventApproval(input: {
  event: SuggestedEventRow
  user: AuthUser
  action: 'approve' | 'reject'
  note?: string | null
}): Promise<{ approval_status: 'approved' | 'rejected' }> {
  const nextStatus = input.action === 'approve' ? 'approved' : 'rejected'

  await query(
    `UPDATE events
     SET approval_status = $2,
         approved_by = $3,
         approved_at = NOW(),
         approval_note = $4,
         updated_at = NOW()
     WHERE id = $1`,
    [input.event.id, nextStatus, input.user.userId, input.note?.trim() || null],
  )

  return { approval_status: nextStatus }
}

/**
 * Tell the venue lead a suggestion is waiting. Sent to the venue's own channel
 * so the decision happens where that venue's people already talk, with a
 * fallback to the ops default channel when a venue has no channel configured.
 */
export async function notifyLeadOfSuggestions(
  venueId: string,
  suggestions: Array<{ id: string; summary: string; event_date: string }>,
): Promise<boolean> {
  if (suggestions.length === 0) return false

  const venueResult = await query(
    `SELECT v.name, v.slack_channel_id,
            mgr.full_name AS manager_name, mgr.slack_user_ids AS manager_slack_ids,
            rep.full_name AS lead_name, rep.slack_user_ids AS lead_slack_ids
     FROM venues v
     LEFT JOIN staff mgr ON mgr.id = v.venue_manager_id
     LEFT JOIN staff rep ON rep.id = v.lead_field_rep_id
     WHERE v.id = $1`,
    [venueId],
  )
  const venue = venueResult.rows[0]
  if (!venue) return false

  const channel = venue.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
  if (!channel) return false

  const baseUrl = (process.env.NEXT_PUBLIC_URL || 'https://services.ancsports.net').replace(/\/+$/, '')
  const queueUrl = `${baseUrl}/events?approval=suggested`

  const mentionIds = [
    ...(Array.isArray(venue.manager_slack_ids) ? venue.manager_slack_ids : []),
    ...(Array.isArray(venue.lead_slack_ids) ? venue.lead_slack_ids : []),
  ].filter(Boolean)
  const mentions = mentionIds.map((id: string) => `<@${id}>`).join(' ')

  const shown = suggestions.slice(0, 10)
  const lines = shown.map((s) => `• *${s.summary}* — ${s.event_date}`)
  if (suggestions.length > shown.length) {
    lines.push(`• …and ${suggestions.length - shown.length} more`)
  }

  return sendSlackMessage({
    channel,
    text: `${suggestions.length} event${suggestions.length === 1 ? '' : 's'} suggested for ${venue.name}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:inbox_tray: *${suggestions.length} event${suggestions.length === 1 ? '' : 's'} suggested for ${venue.name}*\n`
            + `These are not on the master schedule. Approve the ones ANC is covering.${mentions ? `\n${mentions}` : ''}`,
        },
      },
      { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n').slice(0, 2900) } },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Review suggestions' },
            url: queueUrl,
            style: 'primary',
          },
        ],
      },
    ],
  })
}
