export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { handleTicketBlockAction, handleTicketReplySubmission } from '@/lib/slack-ticket-actions'
import {
  handleHubBlockAction,
  handleHubShortcut,
  handleHubViewSubmission,
} from '@/lib/request-hub/slack'
import crypto from 'crypto'

function verifySlackSignature(requestText: string, headers: Headers): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'

  const signature = headers.get('x-slack-signature')
  const timestamp = headers.get('x-slack-request-timestamp')
  if (!signature || !timestamp) return false

  // Prevent replay attacks (5 minutes)
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5
  if (parseInt(timestamp) < fiveMinutesAgo) return false

  const sigBaseString = `v0:${timestamp}:${requestText}`
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', secret)
    .update(sigBaseString, 'utf8')
    .digest('hex')

  return crypto.timingSafeEqual(Buffer.from(mySignature, 'utf8'), Buffer.from(signature, 'utf8'))
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  if (!verifySlackSignature(rawBody, request.headers)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  try {
    const params = new URLSearchParams(rawBody)
    const payloadStr = params.get('payload')
    if (!payloadStr) {
      return NextResponse.json({ error: 'Missing payload' }, { status: 400 })
    }

    const payload = JSON.parse(payloadStr)

    // Request Hub: global shortcut + "Turn this into a request" message action.
    if (payload.type === 'shortcut' || payload.type === 'message_action') {
      if (await handleHubShortcut(payload)) {
        return new NextResponse(null, { status: 200 })
      }
      return new NextResponse(null, { status: 200 })
    }

    // Ticket card actions + Reply modal (Chris D 7/15) — handled first; the
    // marketing-approval flow below keeps its original shape untouched.
    if (payload.type === 'view_submission') {
      const hubResponse = await handleHubViewSubmission(payload)
      if (hubResponse) return NextResponse.json(hubResponse)
      const viewResponse = await handleTicketReplySubmission(payload)
      if (viewResponse) return NextResponse.json(viewResponse)
      return new NextResponse(null, { status: 200 })
    }
    if (await handleHubBlockAction(payload)) {
      return new NextResponse(null, { status: 200 })
    }
    if (await handleTicketBlockAction(payload)) {
      return new NextResponse(null, { status: 200 })
    }

    const action = payload.actions?.[0]
    if (!action) {
      return NextResponse.json({ error: 'No action found' }, { status: 400 })
    }

    const value = action.value || '' // Format: "approve:token" or "changes:token" or "reject:token"
    const [decision, token] = value.split(':')

    if (!token || !['approve', 'changes', 'reject'].includes(decision)) {
      return NextResponse.json({ error: 'Invalid action value' }, { status: 400 })
    }

    // Map "changes" to "changes_requested" for database status
    const dbDecision = decision === 'changes' ? 'changes_requested' : decision

    // 1. Fetch token and approval request
    const t = await query(
      `SELECT t.*, a.id AS approval_id, a.item_type, a.item_id, a.status
       FROM marketing_approval_tokens t
       JOIN marketing_approval_requests a ON a.id = t.approval_id
       WHERE t.token = $1 LIMIT 1`,
      [token],
    )

    if (t.rows.length === 0) {
      return NextResponse.json({
        replace_original: false,
        text: 'This approval request is invalid or expired.',
      })
    }

    const row = t.rows[0]

    if (row.decided_at) {
      const pastDecision = row.decision === 'approve' ? 'approved' : row.decision === 'reject' ? 'rejected' : 'requested changes on'
      return NextResponse.json({
        replace_original: false,
        text: `You already ${pastDecision} this request on ${new Date(row.decided_at).toLocaleString()}.`,
      })
    }

    // 2. Record this approver's decision
    await query(
      `UPDATE marketing_approval_tokens
       SET decision = $1, decided_at = NOW(), ip = $2, user_agent = $3
       WHERE token = $4`,
      [dbDecision, request.headers.get('x-forwarded-for') || '', 'Slack Interactivity Webhook', token],
    )

    // 3. Tally decisions
    const tally = await query(
      `SELECT
         COUNT(*) FILTER (WHERE decision = 'approve')::int AS approves,
         COUNT(*) FILTER (WHERE decision = 'reject')::int  AS rejects,
         COUNT(*) FILTER (WHERE decision = 'changes_requested')::int AS changes,
         COUNT(*)::int                                     AS total
       FROM marketing_approval_tokens WHERE approval_id = $1`,
      [row.approval_id],
    )
    const t2 = tally.rows[0]

    // Decision rule: any reject -> rejected. Any changes -> changes_requested. All approves -> approved.
    let newStatus = row.status
    if (t2.rejects > 0) newStatus = 'rejected'
    else if (t2.changes > 0) newStatus = 'changes_requested'
    else if (t2.approves >= t2.total) newStatus = 'approved'

    if (newStatus !== row.status) {
      await query(
        `UPDATE marketing_approval_requests
         SET status = $1, decided_at = NOW(), decided_by = $2, updated_at = NOW()
         WHERE id = $3`,
        [newStatus, row.approver_label, row.approval_id],
      )

      // If approved, unlock campaign sending/scheduling
      if (newStatus === 'approved') {
        if (row.item_type === 'newsletter') {
          await query(
            `UPDATE newsletter_campaigns
             SET status = 'approved', updated_at = NOW()
             WHERE id = $1 AND status = 'pending'`,
            [row.item_id],
          )
        } else if (row.item_type === 'social') {
          await query(
            `UPDATE marketing_social_posts
             SET state = 'approved', updated_at = NOW()
             WHERE id = $1 AND state = 'draft'`,
            [row.item_id],
          )
        }
      }
    }

    const decisionLabel = decision === 'approve' ? 'Approved' : decision === 'reject' ? 'Rejected' : 'Changes Requested'

    return NextResponse.json({
      replace_original: true,
      text: `Thanks, ${row.approver_label}! Your decision has been recorded: *${decisionLabel}*`,
    })
  } catch (err) {
    console.error('Error handling Slack interactivity:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
