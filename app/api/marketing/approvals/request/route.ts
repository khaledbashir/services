export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessageDetailed } from '@/lib/slack'
import { defaultApprovers, mintApprovalToken, buildDecisionLink } from '@/lib/signal/approval-flow'

interface RequestBody {
  itemType: 'newsletter' | 'social'
  itemId: string                  // newsletter_campaigns.id or marketing_social_posts.id
  preview: string                 // short text/HTML preview to include in the Slack DM
  requestedBy?: string
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RequestBody
  if (!body.itemId || !body.itemType) {
    return NextResponse.json({ error: 'itemType + itemId required' }, { status: 400 })
  }

  const approvers = defaultApprovers()
  if (approvers.length === 0) {
    return NextResponse.json({ error: 'No approvers configured. Set SIGNAL_APPROVERS env var.' }, { status: 500 })
  }

  const approvalRes = await query(
    `INSERT INTO marketing_approval_requests
       (item_type, item_id, status, requested_by, approver_group, notes, metadata)
     VALUES ($1, $2, 'pending', $3, 'signal', $4, $5)
     RETURNING id`,
    [body.itemType, body.itemId, body.requestedBy || 'signal', body.preview?.slice(0, 240) || '', JSON.stringify({ via: 'signal-dm' })],
  )
  const approvalId = (approvalRes.rows[0] as { id: string }).id

  const results: { approver: string; status: 'sent' | 'failed'; error?: string }[] = []
  for (const a of approvers) {
    const token = mintApprovalToken()
    await query(
      `INSERT INTO marketing_approval_tokens (token, approval_id, approver_slack_id, approver_label)
       VALUES ($1, $2, $3, $4)`,
      [token, approvalId, a.slackId, a.label],
    )

    if (a.slackId.startsWith('PLACEHOLDER_')) {
      results.push({ approver: a.label, status: 'failed', error: 'placeholder approver — set SIGNAL_APPROVERS env to real Slack IDs' })
      continue
    }

    const approveUrl = buildDecisionLink(token, 'approve')
    const rejectUrl = buildDecisionLink(token, 'reject')
    const text = `*ANC Signal — ${body.itemType === 'newsletter' ? 'Newsletter' : 'Social post'} ready for your review*\n\n${body.preview.slice(0, 600)}${body.preview.length > 600 ? '…' : ''}\n\n✅ <${approveUrl}|Approve>  ·  ❌ <${rejectUrl}|Reject>\n\n_One click. No login. Token expires after decision._`
    const r = await sendSlackMessageDetailed({ channel: a.slackId, text })
    results.push({ approver: a.label, status: r.ok ? 'sent' : 'failed', error: r.ok ? undefined : 'slack DM failed' })
  }

  return NextResponse.json({ ok: true, approvalId, results })
}
