// Request Hub — Slack surface. Slack is a first-class entry point: slash
// command, global shortcut, message action, modal intake, confirmation DMs,
// clarification questions, and leadership decision cards. The web app stays
// the source of truth; everything here goes through lib/request-hub/core.
//
// Notification policy is deliberately quiet: DMs to the requester at the
// moments that matter (confirmation, clarification, decision, completion),
// one intake card to the leadership channel, and nothing else.

import { slackApi, sendSlackMessage, sendSlackMessageDetailed } from '@/lib/slack'
import { query } from '@/lib/db'
import { getHubConfig, statusByKey, typeByKey, type HubConfig } from './config'
import { resolveHubPermissions, type HubActor } from './roles'
import {
  addComment,
  applyDecision,
  createRequest,
  findBySourceMessage,
  logHubActivity,
  markHubSlackEvent,
  type HubDecision,
} from './core'
import { assistIntake } from './ai'

export const HUB_APP_URL =
  (process.env.NEXT_PUBLIC_URL || 'https://services.ancsports.net').replace(/\/$/, '')

export function requestUrl(id: string): string {
  return `${HUB_APP_URL}/request-hub/${id}`
}

export async function resolveStaffBySlackId(
  slackUserId: string
): Promise<HubActor | null> {
  const res = await query(
    `SELECT id, COALESCE(full_name, email) AS full_name, COALESCE(role, 'technician') AS role
     FROM staff WHERE $1 = ANY(slack_user_ids) AND is_active = true LIMIT 1`,
    [slackUserId]
  )
  const row = res.rows[0]
  if (!row) return null
  return { userId: row.id, fullName: row.full_name, role: row.role }
}

async function slackDisplayName(slackUserId: string): Promise<string> {
  try {
    const data = await slackApi('users.info', { user: slackUserId })
    return data?.user?.profile?.real_name || data?.user?.name || slackUserId
  } catch {
    return slackUserId
  }
}

async function getPermalink(channel: string, messageTs: string): Promise<string | null> {
  try {
    const data = await slackApi('chat.getPermalink', { channel, message_ts: messageTs })
    return data?.ok ? data.permalink : null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Intake modal
// ---------------------------------------------------------------------------

export interface IntakeModalMeta {
  source: 'slack_command' | 'slack_shortcut' | 'slack_message_action'
  slackUserId: string
  channelId?: string
  messageTs?: string
  permalink?: string
  messageText?: string
  messageAuthor?: string
}

export function buildIntakeModal(config: HubConfig, meta: IntakeModalMeta, prefillText?: string) {
  const typeOptions = config.types.map((t) => ({
    text: { type: 'plain_text', text: t.label },
    value: t.key,
  }))
  const blocks: any[] = [
    {
      type: 'input',
      block_id: 'rh_type',
      label: { type: 'plain_text', text: 'What are you submitting?' },
      element: {
        type: 'static_select',
        action_id: 'value',
        options: typeOptions,
        initial_option: typeOptions[0],
      },
    },
    {
      type: 'input',
      block_id: 'rh_want',
      label: { type: 'plain_text', text: 'What do you want?' },
      element: {
        type: 'plain_text_input',
        action_id: 'value',
        multiline: true,
        ...(prefillText ? { initial_value: prefillText.slice(0, 2900) } : {}),
        placeholder: { type: 'plain_text', text: 'Describe it the way you would to a colleague.' },
      },
    },
    {
      type: 'input',
      block_id: 'rh_problem',
      optional: true,
      label: { type: 'plain_text', text: 'What problem does it solve?' },
      element: {
        type: 'plain_text_input',
        action_id: 'value',
        multiline: true,
        placeholder: { type: 'plain_text', text: 'What is hard, slow, or broken today?' },
      },
    },
    {
      type: 'input',
      block_id: 'rh_deadline',
      optional: true,
      label: { type: 'plain_text', text: 'Real deadline (if any)' },
      element: { type: 'datepicker', action_id: 'value' },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `You can add details, files, and links afterwards — you'll get a link to your request.`,
        },
      ],
    },
  ]
  return {
    type: 'modal',
    callback_id: 'request_hub_intake',
    private_metadata: JSON.stringify(meta),
    title: { type: 'plain_text', text: 'Submit a request' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks,
  }
}

export async function openIntakeModal(
  triggerId: string | undefined,
  meta: IntakeModalMeta,
  prefillText?: string
): Promise<boolean> {
  if (!triggerId) return false
  try {
    const config = await getHubConfig()
    const open = await slackApi('views.open', {
      trigger_id: triggerId,
      view: buildIntakeModal(config, meta, prefillText),
    })
    return !!open?.ok
  } catch (err) {
    console.warn('[request-hub] views.open failed:', err)
    return false
  }
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function confirmationBlocks(req: any, config: HubConfig): any[] {
  const status = statusByKey(config, req.status)?.label || req.status
  const type = typeByKey(config, req.type)?.label || req.type
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Request ${req.request_number} received* — ${req.title || 'untitled'}`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Type:*\n${type}` },
        { type: 'mrkdwn', text: `*Status:*\n${status}` },
        { type: 'mrkdwn', text: `*Owner:*\n${req.owner_name || 'Being routed'}` },
        { type: 'mrkdwn', text: `*Response:*\n${config.responseTimeText}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*What happens next:* your request gets a feasibility look, then a leadership decision. You'll hear from us here either way.`,
      },
    },
    {
      type: 'actions',
      block_id: `rh_confirm_${req.id}`,
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View / update request' },
          url: requestUrl(req.id),
          action_id: 'reqhub_view',
        },
      ],
    },
  ]
}

export function decisionCardBlocks(req: any, config: HubConfig): any[] {
  const type = typeByKey(config, req.type)?.label || req.type
  const fields: any[] = [
    { type: 'mrkdwn', text: `*Type:*\n${type}` },
    { type: 'mrkdwn', text: `*Requested by:*\n${req.requester_name || 'Unknown'}` },
  ]
  if (req.venue_name) fields.push({ type: 'mrkdwn', text: `*Venue:*\n${req.venue_name}` })
  if (req.deadline)
    fields.push({
      type: 'mrkdwn',
      text: `*Deadline:*\n${String(req.deadline).slice(0, 10)}${req.deadline_reason ? ` — ${req.deadline_reason}` : ''}`,
    })
  if (req.feasibility) fields.push({ type: 'mrkdwn', text: `*Feasibility:*\n${req.feasibility}` })
  if (req.effort) fields.push({ type: 'mrkdwn', text: `*Effort:*\n${req.effort}` })

  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${req.request_number}* — ${req.title || 'untitled'}\n${(req.summary || '').slice(0, 600)}`,
      },
    },
    { type: 'section', fields },
    {
      type: 'actions',
      block_id: `rh_decide_${req.id}`,
      elements: [
        {
          type: 'button',
          style: 'primary',
          text: { type: 'plain_text', text: 'Approve' },
          action_id: 'reqhub_approve',
          value: req.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Need information' },
          action_id: 'reqhub_need_info',
          value: req.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Hold' },
          action_id: 'reqhub_hold',
          value: req.id,
        },
        {
          type: 'button',
          style: 'danger',
          text: { type: 'plain_text', text: 'Decline' },
          action_id: 'reqhub_decline',
          value: req.id,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open brief' },
          url: requestUrl(req.id),
          action_id: 'reqhub_open',
        },
      ],
    },
  ]
}

/** DM the requester their confirmation card. Quiet failure. */
export async function dmRequesterConfirmation(req: any, config?: HubConfig): Promise<void> {
  const cfg = config || (await getHubConfig())
  if (!cfg.slack.dmRequester || !req.requester_slack_id) return
  await sendSlackMessage({
    channel: req.requester_slack_id,
    text: `Request ${req.request_number} received — ${config?.responseTimeText || ''}`,
    blocks: confirmationBlocks(req, cfg),
  })
}

/** Post the intake/decision card to the leadership channel and remember its ts. */
export async function postIntakeCard(req: any, config?: HubConfig): Promise<void> {
  const cfg = config || (await getHubConfig())
  const channel = cfg.slack.leadershipChannelId || cfg.slack.intakeChannelId
  if (!cfg.slack.postOnSubmit || !channel) return
  const res = await sendSlackMessageDetailed({
    channel,
    text: `New request ${req.request_number}: ${req.title || 'untitled'}`,
    blocks: decisionCardBlocks(req, cfg),
  })
  if (res.ok && res.ts) {
    await query(
      `UPDATE request_hub_items SET slack_thread_channel_id = $2, slack_thread_ts = $3 WHERE id = $1`,
      [req.id, res.channel || channel, res.ts]
    )
  }
}

/** Refresh the leadership card in place after a decision (buttons → outcome). */
export async function refreshDecisionCard(req: any, outcomeLine: string): Promise<void> {
  if (!req.slack_thread_channel_id || !req.slack_thread_ts) return
  try {
    const cfg = await getHubConfig()
    const blocks = decisionCardBlocks(req, cfg).filter(
      (b) => !(b.type === 'actions' && String(b.block_id || '').startsWith('rh_decide_'))
    )
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: outcomeLine }] })
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Open request' },
          url: requestUrl(req.id),
          action_id: 'reqhub_open',
        },
      ],
    })
    await slackApi('chat.update', {
      channel: req.slack_thread_channel_id,
      ts: req.slack_thread_ts,
      text: outcomeLine,
      blocks,
    })
  } catch (err) {
    console.warn('[request-hub] decision card update failed:', err)
  }
}

/** Notify the requester of a status change / decision / clarification. Quiet. */
export async function notifyRequester(req: any, text: string, blocks?: any[]): Promise<void> {
  if (!req.requester_slack_id) return
  await sendSlackMessage({ channel: req.requester_slack_id, text, blocks })
}

export async function notifyStatusChange(req: any, newStatus: string): Promise<void> {
  const cfg = await getHubConfig()
  const label = statusByKey(cfg, newStatus)?.label || newStatus
  const notifyCompletion = newStatus === 'completed' && cfg.notifications.notifyRequesterOnComplete
  const notifyDecision =
    ['approved', 'declined', 'on_hold'].includes(newStatus) && cfg.notifications.notifyRequesterOnDecision
  if (notifyCompletion || notifyDecision) {
    await notifyRequester(
      req,
      `${req.request_number} — ${req.title || 'your request'} is now *${label}*.\n${requestUrl(req.id)}`
    )
  }
  if (cfg.notifications.notifyThreadOnStatus && req.slack_thread_channel_id && req.slack_thread_ts) {
    await sendSlackMessage({
      channel: req.slack_thread_channel_id,
      thread_ts: req.slack_thread_ts,
      text: `${req.request_number} → ${label}`,
    })
  }
}

export async function notifyOwnerAssigned(req: any, ownerStaffId: string): Promise<void> {
  const cfg = await getHubConfig()
  if (!cfg.notifications.notifyOwnerOnAssign) return
  const res = await query(`SELECT slack_user_ids, full_name FROM staff WHERE id = $1`, [ownerStaffId])
  const slackId = res.rows[0]?.slack_user_ids?.[0]
  if (!slackId) return
  await sendSlackMessage({
    channel: slackId,
    text: `You are now the owner of ${req.request_number} — ${req.title || 'untitled'}.\n${requestUrl(req.id)}`,
  })
}

export async function sendClarificationQuestions(req: any, questions: string[]): Promise<void> {
  if (!req.requester_slack_id || questions.length === 0) return
  const list = questions.map((q, i) => `${i + 1}. ${q}`).join('\n')
  await sendSlackMessage({
    channel: req.requester_slack_id,
    text: `Quick questions on ${req.request_number}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${req.request_number} — ${req.title || 'your request'}* needs a bit more detail:\n${list}`,
        },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `Reply here in this DM, or answer on the request page:` },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Answer on the request' },
            url: requestUrl(req.id),
            action_id: 'reqhub_view',
          },
        ],
      },
    ],
  })
}

// ---------------------------------------------------------------------------
// Interaction handlers (called from /api/slack/interactivity)
// ---------------------------------------------------------------------------

/** Create a request from an intake-modal submission. */
export async function handleHubViewSubmission(payload: any): Promise<Record<string, unknown> | null> {
  const callbackId = payload?.view?.callback_id
  if (callbackId === 'request_hub_intake') return handleIntakeSubmission(payload)
  if (callbackId === 'request_hub_decision') return handleDecisionSubmission(payload)
  return null
}

function viewValue(payload: any, blockId: string): string {
  const block = payload?.view?.state?.values?.[blockId]?.value
  return (
    block?.value ||
    block?.selected_option?.value ||
    block?.selected_date ||
    ''
  )
}

async function handleIntakeSubmission(payload: any): Promise<Record<string, unknown>> {
  const meta: IntakeModalMeta = JSON.parse(payload?.view?.private_metadata || '{}')
  const slackUserId = payload?.user?.id || meta.slackUserId
  const want = viewValue(payload, 'rh_want').trim()
  if (!want) {
    return { response_action: 'errors', errors: { rh_want: 'Tell us what you want — one sentence is fine.' } }
  }

  // Idempotency: a duplicate view_submission (Slack retry) must not create twice.
  const eventKey = `intake:${payload?.view?.id || ''}:${payload?.view?.hash || ''}`
  if (!(await markHubSlackEvent(eventKey))) return { response_action: 'clear' }

  const type = viewValue(payload, 'rh_type') || 'idea'
  const problem = viewValue(payload, 'rh_problem').trim()
  const deadline = viewValue(payload, 'rh_deadline') || null

  const staff = await resolveStaffBySlackId(slackUserId)
  const requesterName = staff?.fullName || (await slackDisplayName(slackUserId))
  const config = await getHubConfig()

  const answers: Record<string, unknown> = { want }
  if (problem) answers.problem = problem
  if (meta.messageText) answers.source_message = meta.messageText

  const req = await createRequest({
    type,
    status: 'submitted',
    title: want.slice(0, 80),
    summary: want,
    answers,
    deadline,
    requester: {
      userId: staff?.userId || null,
      fullName: requesterName,
      slackUserId,
    },
    source: meta.source,
    sourceChannelId: meta.channelId || null,
    sourceMessageTs: meta.messageTs || null,
    sourcePermalink: meta.permalink || null,
  })

  // Apply routing default owner (createRequest doesn't route; submit path does
  // for web drafts — mirror it here).
  const ownerId = config.routing.typeOwners[type] || config.routing.defaultOwnerId
  let finalReq = req
  if (ownerId) {
    const upd = await query(
      `UPDATE request_hub_items SET owner_id = $2 WHERE id = $1 RETURNING *`,
      [req.id, ownerId]
    )
    finalReq = upd.rows[0] || req
  }

  if (meta.permalink) {
    await query(
      `INSERT INTO request_hub_links (request_id, kind, label, url)
       VALUES ($1, 'slack_thread', 'Original Slack message', $2)`,
      [req.id, meta.permalink]
    )
  }

  // AI title/summary polish + intake card + confirmation — fire-and-forget,
  // never block Slack's 3s ack on model latency.
  void (async () => {
    try {
      let current = { ...finalReq, owner_name: null }
      const assist = await assistIntake(
        { type, title: current.title, summary: current.summary, answers },
        config
      )
      if (assist) {
        const upd = await query(
          `UPDATE request_hub_items
           SET title = $2, summary = $3, ai_suggestions = $4::jsonb, updated_at = NOW()
           WHERE id = $1 RETURNING *`,
          [req.id, assist.title?.slice(0, 120) || current.title, assist.summary || current.summary, JSON.stringify(assist)]
        )
        if (upd.rows[0]) current = { ...upd.rows[0], owner_name: null }
      }
      await dmRequesterConfirmation(current, config)
      await postIntakeCard(current, config)
    } catch (err) {
      console.warn('[request-hub] post-intake pipeline failed:', err)
      // Confirmation must still reach the requester even if AI/card posting died.
      dmRequesterConfirmation(finalReq, config).catch(() => {})
    }
  })()

  return { response_action: 'clear' }
}

function buildDecisionModal(requestId: string, decision: HubDecision, requestNumber: string) {
  const titles: Record<HubDecision, string> = {
    approve: 'Approve request',
    decline: 'Decline request',
    hold: 'Put request on hold',
    need_info: 'Request information',
  }
  const isInfo = decision === 'need_info'
  return {
    type: 'modal',
    callback_id: 'request_hub_decision',
    private_metadata: JSON.stringify({ requestId, decision }),
    title: { type: 'plain_text', text: titles[decision].slice(0, 24) },
    submit: { type: 'plain_text', text: 'Confirm' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*${requestNumber}* — ${titles[decision].toLowerCase()}.` },
      },
      {
        type: 'input',
        block_id: 'rh_reason',
        optional: !isInfo,
        label: {
          type: 'plain_text',
          text: isInfo ? 'What do you need to know? (one question per line)' : 'Reason (shared with the requester)',
        },
        element: { type: 'plain_text_input', action_id: 'value', multiline: true },
      },
    ],
  }
}

async function handleDecisionSubmission(payload: any): Promise<Record<string, unknown>> {
  const meta = JSON.parse(payload?.view?.private_metadata || '{}') as {
    requestId: string
    decision: HubDecision
  }
  const eventKey = `decision:${payload?.view?.id || ''}:${payload?.view?.hash || ''}`
  if (!(await markHubSlackEvent(eventKey))) return { response_action: 'clear' }

  const staff = await resolveStaffBySlackId(payload?.user?.id || '')
  if (!staff) return { response_action: 'clear' }
  const config = await getHubConfig()
  const perms = resolveHubPermissions(staff, config)
  if (!perms.isApprover) return { response_action: 'clear' }

  const reasonRaw = viewValue(payload, 'rh_reason').trim()
  const questions =
    meta.decision === 'need_info'
      ? reasonRaw.split('\n').map((q) => q.trim()).filter(Boolean)
      : []

  const req = await applyDecision(meta.requestId, meta.decision, reasonRaw || null, staff as any, {
    questions,
  })
  if (!req) return { response_action: 'clear' }

  void (async () => {
    const labels: Record<HubDecision, string> = {
      approve: 'Approved',
      decline: 'Declined',
      hold: 'On hold',
      need_info: 'Needs information',
    }
    await refreshDecisionCard(req, `*${labels[meta.decision]}* by ${staff.fullName}${reasonRaw ? ` — ${reasonRaw.slice(0, 300)}` : ''}`)
    if (meta.decision === 'need_info') {
      await sendClarificationQuestions(req, questions.length ? questions : [reasonRaw])
    } else {
      await notifyStatusChange(req, req.status)
    }
  })().catch((err) => console.warn('[request-hub] decision follow-up failed:', err))

  return { response_action: 'clear' }
}

/** Handle reqhub_* button clicks. Returns true when the action was ours. */
export async function handleHubBlockAction(payload: any): Promise<boolean> {
  const action = payload?.actions?.[0]
  const actionId = String(action?.action_id || '')
  if (!actionId.startsWith('reqhub_')) return false
  if (actionId === 'reqhub_view' || actionId === 'reqhub_open') return true // url buttons, ack only

  const respond = async (body: Record<string, unknown>) => {
    if (!payload.response_url) return
    try {
      await fetch(payload.response_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch (err) {
      console.warn('[request-hub] response_url post failed:', err)
    }
  }
  const ephemeral = (text: string) => respond({ response_type: 'ephemeral', replace_original: false, text })

  const decisionMap: Record<string, HubDecision> = {
    reqhub_approve: 'approve',
    reqhub_decline: 'decline',
    reqhub_hold: 'hold',
    reqhub_need_info: 'need_info',
  }
  const decision = decisionMap[actionId]
  if (!decision) return true

  // Dedupe double-clicks / Slack retries on the same button press.
  const eventKey = `act:${payload?.container?.message_ts || ''}:${actionId}:${action?.action_ts || ''}`
  if (!(await markHubSlackEvent(eventKey))) return true

  const requestId = String(action?.value || '')
  const staff = await resolveStaffBySlackId(payload?.user?.id || '')
  if (!staff) {
    await ephemeral(
      'Your Slack account is not linked to a dashboard account yet — ask an admin to link it, then try again.'
    )
    return true
  }
  const config = await getHubConfig()
  const perms = resolveHubPermissions(staff, config)
  if (!perms.isApprover) {
    await ephemeral('Decisions on requests are limited to leadership approvers.')
    return true
  }

  const reqRes = await query(`SELECT id, request_number, status FROM request_hub_items WHERE id = $1`, [requestId])
  const found = reqRes.rows[0]
  if (!found) {
    await ephemeral('That request no longer exists.')
    return true
  }

  // Prefer a modal for the reason/questions; fall back to instant apply for
  // Approve and to the web brief for the rest when no modal can be opened
  // (e.g. the interaction arrived without a usable trigger_id).
  const opened = payload?.trigger_id
    ? await slackApi('views.open', {
        trigger_id: payload.trigger_id,
        view: buildDecisionModal(requestId, decision, found.request_number || 'Request'),
      })
        .then((r: any) => !!r?.ok)
        .catch(() => false)
    : false

  if (!opened) {
    if (decision === 'approve') {
      const req = await applyDecision(requestId, 'approve', null, staff as any)
      if (req) {
        await refreshDecisionCard(req, `*Approved* by ${staff.fullName}`)
        await notifyStatusChange(req, req.status)
      }
    } else {
      await ephemeral(`Add your reason on the request page: ${requestUrl(requestId)}`)
    }
  }
  return true
}

/** Message action + global shortcut entry (payload.type message_action | shortcut). */
export async function handleHubShortcut(payload: any): Promise<boolean> {
  const callbackId = String(payload?.callback_id || '')
  if (callbackId !== 'request_hub_new' && callbackId !== 'request_hub_from_message') return false

  const slackUserId = payload?.user?.id || ''
  const meta: IntakeModalMeta = {
    source: callbackId === 'request_hub_from_message' ? 'slack_message_action' : 'slack_shortcut',
    slackUserId,
  }
  let prefill: string | undefined

  if (callbackId === 'request_hub_from_message' && payload?.message) {
    meta.channelId = payload?.channel?.id
    meta.messageTs = payload?.message?.ts
    meta.messageText = String(payload?.message?.text || '').slice(0, 3000)
    meta.messageAuthor = payload?.message?.user
    prefill = meta.messageText

    // A message can only become one request.
    if (meta.channelId && meta.messageTs) {
      const existing = await findBySourceMessage(meta.channelId, meta.messageTs)
      if (existing) {
        await sendSlackMessage({
          channel: slackUserId,
          text: `That message is already request ${existing.request_number}: ${requestUrl(existing.id)}`,
        })
        return true
      }
      meta.permalink = (await getPermalink(meta.channelId, meta.messageTs)) || undefined
    }
  }

  const opened = await openIntakeModal(payload?.trigger_id, meta, prefill)
  if (!opened) {
    await sendSlackMessage({
      channel: slackUserId,
      text: `Start your request here: ${HUB_APP_URL}/request-hub/new`,
    })
  }
  return true
}

// ---------------------------------------------------------------------------
// Slash command (/request) — called from app/api/slack/request-hub
// ---------------------------------------------------------------------------

export async function handleHubSlashCommand(params: URLSearchParams): Promise<Record<string, unknown>> {
  const slackUserId = params.get('user_id') || ''
  const channelId = params.get('channel_id') || ''
  const triggerId = params.get('trigger_id') || ''
  const text = (params.get('text') || '').trim()

  // `/request status` — list my open requests.
  if (/^status\b/i.test(text)) {
    const staff = await resolveStaffBySlackId(slackUserId)
    const res = await query(
      `SELECT request_number, title, status FROM request_hub_items
       WHERE status NOT IN ('draft','completed','declined')
         AND (requester_slack_id = $1 OR requester_id = $2)
       ORDER BY updated_at DESC LIMIT 10`,
      [slackUserId, staff?.userId || null]
    )
    if (res.rows.length === 0) {
      return { response_type: 'ephemeral', text: `You have no open requests. Submit one with \`/request\`.` }
    }
    const lines = res.rows.map((r) => `• *${r.request_number}* ${r.title || ''} — ${r.status}`).join('\n')
    return {
      response_type: 'ephemeral',
      text: `Your open requests:\n${lines}\nFull list: ${HUB_APP_URL}/request-hub`,
    }
  }

  const meta: IntakeModalMeta = { source: 'slack_command', slackUserId, channelId }
  const opened = await openIntakeModal(triggerId, meta, text || undefined)
  if (opened) return {}
  return {
    response_type: 'ephemeral',
    text: `Submit your request here: ${HUB_APP_URL}/request-hub/new${text ? ` (your note: "${text.slice(0, 200)}")` : ''}`,
  }
}
