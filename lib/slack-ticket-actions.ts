/**
 * Slack ticket card actions (Chris D 7/15): Mark In Progress / Close / Reply
 * buttons on ticket notifications, handled through /api/slack/interactivity.
 *
 * Every guard is enforced HERE, not in the buttons — cards go stale in the
 * channel, so a click on an old card must never demote an Escalated ticket or
 * reopen a Closed one. Actors are resolved from staff.slack_user_ids; unlinked
 * Slack users get an ephemeral nudge instead of a silent no-op.
 */

import { query } from '@/lib/db'
import { applyTicketClose, applyTicketInProgress } from '@/lib/ticket-close'
import { slackApi, statusLabels, ticketActionBlock } from '@/lib/slack'
import { postTicketComment } from '@/lib/ticket-comment'

async function resolveStaffBySlackId(slackUserId?: string) {
  if (!slackUserId) return null
  const r = await query(
    `SELECT id, full_name, role FROM staff WHERE $1 = ANY(slack_user_ids) AND is_active = true LIMIT 1`,
    [slackUserId]
  )
  return r.rows[0] || null
}

// Slack acks the button POST immediately; message updates and ephemeral
// notices go through response_url (reliable for block_actions, unlike a JSON
// ack body).
async function respond(responseUrl: string | undefined, body: any) {
  if (!responseUrl) return
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.error('[slack-ticket-actions] response_url post failed:', err)
  }
}

function ephemeral(text: string) {
  return { response_type: 'ephemeral', replace_original: false, text }
}

// Rebuild the clicked card: refresh the Status field, drop the old button row,
// append a "who did what" context line and a fresh button row for the new
// status. Slack echoes back render-time props on image blocks that
// chat.update rejects, so strip those before resending.
function updatedCardBlocks(message: any, ticketId: string, newStatus: string, note: string): any[] {
  const source: any[] = Array.isArray(message?.blocks) ? message.blocks : []
  const blocks = source
    .filter(b => !(b?.type === 'actions' && String(b?.block_id || '').startsWith('ticket_actions')))
    .map(b => {
      if (b?.type === 'image') {
        const { image_url, alt_text, title } = b
        return { type: 'image', image_url, alt_text, ...(title ? { title } : {}) }
      }
      if (b?.type === 'section' && Array.isArray(b.fields)) {
        return {
          ...b,
          fields: b.fields.map((f: any) =>
            typeof f?.text === 'string' && f.text.startsWith('*Status:*')
              ? { ...f, text: `*Status:*\n${statusLabels[newStatus] || newStatus}` }
              : f
          ),
        }
      }
      return b
    })
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: note }] })
  blocks.push(ticketActionBlock(ticketId, newStatus))
  return blocks
}

/**
 * Handle a block_actions payload if it belongs to a ticket card.
 * Returns true when handled (caller acks 200), false to fall through to other
 * interactivity flows (marketing approvals).
 */
export async function handleTicketBlockAction(payload: any): Promise<boolean> {
  const action = payload?.actions?.[0]
  const actionId = String(action?.action_id || '')
  if (!actionId.startsWith('ticket_')) return false

  // Link-out button — Slack still POSTs an interaction for url buttons; just ack.
  if (actionId === 'ticket_view') return true

  const ticketId = String(action?.value || '')
  const responseUrl: string | undefined = payload?.response_url

  const staff = await resolveStaffBySlackId(payload?.user?.id)
  if (!staff) {
    await respond(responseUrl, ephemeral(
      `This Slack account isn't linked to a dashboard user yet, so ticket actions are disabled. An admin can link it from your staff profile.`
    ))
    return true
  }

  const tRes = await query(
    `SELECT t.ticket_number, t.title, t.status, t.venue_id, t.assigned_to, v.name AS venue_name
     FROM tickets t JOIN venues v ON t.venue_id = v.id WHERE t.id = $1`,
    [ticketId]
  )
  const ti = tRes.rows[0]
  if (!ti) {
    await respond(responseUrl, ephemeral('This ticket no longer exists — it may have been deleted or merged.'))
    return true
  }
  const caseNum = String(ti.ticket_number).padStart(8, '0')
  const ticketArg = {
    ticket_number: ti.ticket_number,
    status: ti.status,
    title: ti.title,
    venue_id: ti.venue_id,
    assigned_to: ti.assigned_to,
  }
  const actor = { userId: staff.id, fullName: staff.full_name }

  if (actionId === 'ticket_in_progress') {
    const moved = await applyTicketInProgress({ ticketId, ticket: ticketArg, venueName: ti.venue_name || '', actor })
    if (!moved) {
      const label = statusLabels[ti.status] || ti.status
      await respond(responseUrl, ephemeral(
        `Case #${caseNum} is ${label} — status unchanged.${ti.status === 'escalated' ? ' Escalated tickets don’t move back to In Progress from here.' : ''}`
      ))
      return true
    }
    await respond(responseUrl, {
      replace_original: true,
      text: `:arrows_counterclockwise: Case #${caseNum} — Moved to In Progress by ${staff.full_name}`,
      blocks: updatedCardBlocks(payload.message, ticketId, 'in_progress',
        `:arrows_counterclockwise: Moved to In Progress by *${staff.full_name}* from Slack`),
    })
    return true
  }

  if (actionId === 'ticket_close') {
    if (ti.status === 'closed') {
      await respond(responseUrl, ephemeral(`Case #${caseNum} is already closed.`))
      return true
    }
    await applyTicketClose({ ticketId, ticket: ticketArg, venueName: ti.venue_name || '', actor })
    await respond(responseUrl, {
      replace_original: true,
      text: `:white_check_mark: Case #${caseNum} — Closed by ${staff.full_name}`,
      blocks: updatedCardBlocks(payload.message, ticketId, 'closed',
        `:white_check_mark: Closed by *${staff.full_name}* from Slack`),
    })
    return true
  }

  if (actionId === 'ticket_reply') {
    const open = await slackApi('views.open', {
      trigger_id: payload.trigger_id,
      view: {
        type: 'modal',
        callback_id: 'ticket_reply',
        private_metadata: JSON.stringify({ ticketId }),
        title: { type: 'plain_text', text: `Case #${caseNum}`.slice(0, 24) },
        submit: { type: 'plain_text', text: 'Post' },
        close: { type: 'plain_text', text: 'Cancel' },
        blocks: [
          { type: 'context', elements: [{ type: 'mrkdwn', text: `*${ti.title}* — ${ti.venue_name}` }] },
          {
            type: 'input', block_id: 'note',
            label: { type: 'plain_text', text: 'Note' },
            element: {
              type: 'plain_text_input', action_id: 'body', multiline: true,
              placeholder: { type: 'plain_text', text: 'Write your note…' },
            },
          },
          {
            type: 'input', block_id: 'visibility',
            label: { type: 'plain_text', text: 'Visibility' },
            element: {
              type: 'radio_buttons', action_id: 'choice',
              initial_option: {
                text: { type: 'plain_text', text: 'Internal note (team only)' }, value: 'internal',
              },
              options: [
                { text: { type: 'plain_text', text: 'Internal note (team only)' }, value: 'internal' },
                { text: { type: 'plain_text', text: 'Client-visible (emails the venue distribution list)' }, value: 'client' },
              ],
            },
          },
        ],
      },
    })
    if (!open?.ok) {
      console.error('[slack-ticket-actions] views.open failed:', open?.error)
      await respond(responseUrl, ephemeral('Could not open the reply form — try again, or reply from the dashboard.'))
    }
    return true
  }

  // Unknown ticket_* action — ack so Slack doesn't show an error, log for us.
  console.error('[slack-ticket-actions] unhandled action_id:', actionId)
  return true
}

/**
 * Handle the Reply modal submission. Returns a Slack view response body when
 * this submission is ours, null to let other view flows handle it.
 */
export async function handleTicketReplySubmission(payload: any): Promise<any | null> {
  if (payload?.view?.callback_id !== 'ticket_reply') return null

  let meta: { ticketId?: string } = {}
  try { meta = JSON.parse(payload.view.private_metadata || '{}') } catch { /* fall through to error below */ }
  const values = payload.view?.state?.values || {}
  const body = String(values?.note?.body?.value || '').trim()
  const visibility = values?.visibility?.choice?.selected_option?.value || 'internal'

  if (!body) {
    return { response_action: 'errors', errors: { note: 'Write a note first.' } }
  }
  if (!meta.ticketId) {
    return { response_action: 'errors', errors: { note: 'This form has expired — reopen it from the ticket card.' } }
  }

  const staff = await resolveStaffBySlackId(payload?.user?.id)
  if (!staff) {
    return { response_action: 'errors', errors: { note: 'Your Slack account isn’t linked to a dashboard user.' } }
  }

  await postTicketComment({
    ticketId: meta.ticketId,
    body,
    isInternal: visibility === 'internal',
    actor: { userId: staff.id, fullName: staff.full_name },
    via: 'slack',
  })

  return { response_action: 'clear' }
}
