export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessageDetailed } from '@/lib/slack'

function htmlPage(opts: { title: string; body: string; tone: 'ok' | 'err' | 'note' }) {
  const accent = opts.tone === 'ok' ? '#10b981' : opts.tone === 'err' ? '#ef4444' : '#3b82f6'
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${opts.title}</title>
<style>
  body{font-family:Inter,system-ui,-apple-system,sans-serif;background:#0f0f10;color:#e8e8ea;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center}
  .card{background:#18181b;border:1px solid #27272a;border-radius:8px;padding:32px 40px;max-width:480px;text-align:center}
  .badge{display:inline-block;border:1px solid ${accent}66;background:${accent}1a;color:${accent};padding:4px 12px;border-radius:999px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:16px}
  h1{font-size:18px;margin:0 0 8px 0;letter-spacing:-.01em}
  p{font-size:14px;color:#a1a1aa;margin:0;line-height:1.55}
</style></head><body><div class="card"><div class="badge">${opts.title}</div><h1>${opts.body}</h1><p>You can close this tab.</p></div></body></html>`
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || ''
  const decision = request.nextUrl.searchParams.get('decision') as 'approve' | 'reject'
  if (!token || (decision !== 'approve' && decision !== 'reject')) {
    return new NextResponse(htmlPage({ title: 'Invalid link', body: 'Token or decision missing.', tone: 'err' }), { headers: { 'content-type': 'text/html' } })
  }

  const t = await query(
    `SELECT t.*, a.id AS approval_id, a.item_type, a.item_id, a.status
     FROM marketing_approval_tokens t
     JOIN marketing_approval_requests a ON a.id = t.approval_id
     WHERE t.token = $1 LIMIT 1`,
    [token],
  )
  if (t.rows.length === 0) {
    return new NextResponse(htmlPage({ title: 'Not found', body: 'This approval link is invalid or expired.', tone: 'err' }), { headers: { 'content-type': 'text/html' } })
  }
  const row = t.rows[0] as Record<string, any>

  if (row.decided_at) {
    return new NextResponse(
      htmlPage({
        title: 'Already recorded',
        body: `You already ${row.decision === 'approve' ? 'approved' : 'rejected'} this on ${new Date(row.decided_at).toLocaleString()}.`,
        tone: 'note',
      }),
      { headers: { 'content-type': 'text/html' } },
    )
  }

  // Record this approver's decision
  await query(
    `UPDATE marketing_approval_tokens
     SET decision = $1, decided_at = NOW(), ip = $2, user_agent = $3
     WHERE token = $4`,
    [decision, request.headers.get('x-forwarded-for') || '', request.headers.get('user-agent') || '', token],
  )

  // Tally decisions
  const tally = await query(
    `SELECT
       COUNT(*) FILTER (WHERE decision = 'approve')::int AS approves,
       COUNT(*) FILTER (WHERE decision = 'reject')::int  AS rejects,
       COUNT(*)::int                                     AS total
     FROM marketing_approval_tokens WHERE approval_id = $1`,
    [row.approval_id],
  )
  const t2 = tally.rows[0] as { approves: number; rejects: number; total: number }

  // Decision rule: any reject → rejected. All approves needed → approved. Otherwise pending.
  let newStatus = row.status
  if (t2.rejects > 0) newStatus = 'rejected'
  else if (t2.approves >= t2.total) newStatus = 'approved'

  if (newStatus !== row.status) {
    await query(
      `UPDATE marketing_approval_requests
       SET status = $1, decided_at = NOW(), decided_by = $2, updated_at = NOW()
       WHERE id = $3`,
      [newStatus, row.approver_label, row.approval_id],
    )
    // Optional: post final state to a Slack channel so the team sees the resolution
    if (process.env.SIGNAL_APPROVALS_CHANNEL) {
      await sendSlackMessageDetailed({
        channel: process.env.SIGNAL_APPROVALS_CHANNEL,
        text: `Signal approval ${newStatus}: ${row.item_type} ${row.item_id} (last decision: ${row.approver_label} → ${decision})`,
      })
    }
  }

  const isApprove = decision === 'approve'
  return new NextResponse(
    htmlPage({
      title: isApprove ? 'Approved' : 'Rejected',
      body: isApprove
        ? `Thanks, ${row.approver_label}. Approval recorded.`
        : `Thanks, ${row.approver_label}. Rejection recorded — Signal will not send.`,
      tone: isApprove ? 'ok' : 'err',
    }),
    { headers: { 'content-type': 'text/html' } },
  )
}
