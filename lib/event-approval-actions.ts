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
 * Tell the venue lead a suggestion is waiting.
 *
 * Joe, 2026-08-18: "for the suggested events can these go to the assigned leads
 * personal slack or does it have to be in the channel?" — so the notice is a
 * direct message to the people who can actually decide: the venue manager and
 * the lead field rep. A pending decision belongs to a person, not to a room.
 *
 * The venue channel is the fallback, used only when neither of them has a Slack
 * account linked to their staff record. Nothing is ever posted to both, so a
 * lead is not pinged twice for the same suggestions, and a venue with no lead
 * and no channel still falls back to the ops default rather than going quiet.
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

  const baseUrl = (process.env.NEXT_PUBLIC_URL || 'https://services.ancsports.net').replace(/\/+$/, '')
  const queueUrl = `${baseUrl}/events?approval=suggested`

  const shown = suggestions.slice(0, 10)
  const lines = shown.map((s) => `• *${s.summary}* — ${s.event_date}`)
  if (suggestions.length > shown.length) {
    lines.push(`• …and ${suggestions.length - shown.length} more`)
  }
  const count = `${suggestions.length} event${suggestions.length === 1 ? '' : 's'}`

  const message = (lead: boolean) => ({
    text: `${count} suggested for ${venue.name}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `:inbox_tray: *${count} suggested for ${venue.name}*\n`
            + (lead
              ? 'These are not on the master schedule. You lead this venue — approve the ones ANC is covering.'
              : 'These are not on the master schedule. Approve the ones ANC is covering.'),
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

  const recipients = uniqueSlackIds([venue.manager_slack_ids, venue.lead_slack_ids])
  if (recipients.length) {
    const sent = await Promise.all(
      recipients.map((id) => sendSlackMessage({ channel: id, ...message(true) })),
    )
    // A DM that Slack refuses falls through to the channel rather than being
    // lost — the suggestion still has to reach someone who can decide.
    if (sent.some(Boolean)) return true
  }

  const channel = venue.slack_channel_id || process.env.SLACK_DEFAULT_CHANNEL || ''
  if (!channel) return false
  return sendSlackMessage({ channel, ...message(false) })
}

/** The distinct Slack accounts behind a venue's manager and lead field rep. */
function uniqueSlackIds(lists: Array<unknown>): string[] {
  const ids = lists.flatMap((list) => (Array.isArray(list) ? list : []))
  return Array.from(new Set(ids.filter((id): id is string => typeof id === 'string' && !!id.trim())))
}
