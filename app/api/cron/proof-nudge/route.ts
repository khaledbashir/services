export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessage } from '@/lib/slack'
import { sendEmail } from '@/lib/email'
import {
  OBJECT_CONFIGS,
  fetchTwentyRecord,
  buildPublicUrl,
} from '@/lib/proof-share'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' : '&#39;'
  )
}

// Scheduler: run hourly. Finds proofs sent >48h ago that haven't been
// opened (or opened but not responded to) and pings:
//   - designer/Slack: "client hasn't opened"
//   - client/email:   "friendly reminder"
//
// Dedupes by last_nudged_at — won't ping the same share more than once per 24h.

const NUDGE_AFTER_HOURS = 48
const RE_NUDGE_AFTER_HOURS = 24

export async function GET() {
  const nudgedDesigners: Array<{ token: string; reason: string }> = []
  const nudgedClients: Array<{ token: string; email: string }> = []

  try {
    const rows = await query(
      `SELECT token, twenty_object_type, twenty_record_id, created_at, expires_at,
              view_count, last_viewed_at, client_response, client_email,
              created_by_name, created_by_email, message, last_nudged_at
       FROM proof_shares
       WHERE client_response IS NULL
         AND created_at < NOW() - INTERVAL '${NUDGE_AFTER_HOURS} hours'
         AND (last_nudged_at IS NULL
              OR last_nudged_at < NOW() - INTERVAL '${RE_NUDGE_AFTER_HOURS} hours')
       ORDER BY created_at ASC
       LIMIT 50`
    )

    const slackChannel = process.env.SLACK_DEFAULT_CHANNEL || ''

    for (const share of rows.rows) {
      const cfg = OBJECT_CONFIGS[share.twenty_object_type]
      if (!cfg) continue

      const record = await fetchTwentyRecord(
        share.twenty_object_type,
        share.twenty_record_id
      ).catch(() => null)
      const recordName = (record?.name as string) || 'a proof'
      const proofUrl = buildPublicUrl(share.token)
      const ageHours = Math.round(
        (Date.now() - new Date(share.created_at).getTime()) / 3_600_000
      )

      // 1. Designer Slack nudge
      if (slackChannel) {
        const opened = share.view_count > 0
        const status = opened
          ? `👀 Client opened ${share.view_count}× but hasn't responded`
          : `📬 Client hasn't opened yet`
        await sendSlackMessage({
          channel: slackChannel,
          text: `Proof pending ${ageHours}h — ${recordName}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Proof pending ${ageHours}h* — ${cfg.displayLabel}\n*${recordName}*\n${status}`,
              },
            },
            {
              type: 'section',
              fields: [
                {
                  type: 'mrkdwn',
                  text: `*Sent by:*\n${share.created_by_name || share.created_by_email || '—'}`,
                },
                {
                  type: 'mrkdwn',
                  text: `*Client:*\n${share.client_email || '—'}`,
                },
              ],
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'Open proof' },
                  url: proofUrl,
                },
              ],
            },
          ],
        }).catch((e) => console.error('[proof-nudge] slack failed:', e))
        nudgedDesigners.push({
          token: share.token,
          reason: opened ? 'opened_no_response' : 'not_opened',
        })
      }

      // 2. Friendly reminder email to client (only if not yet opened, to avoid nagging)
      if (share.client_email && share.view_count === 0) {
        const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:0 16px">
          <div style="background:#002C73;color:#fff;padding:20px 24px;border-radius:8px 8px 0 0">
            <h2 style="margin:0;font-size:17px">Friendly reminder — proof awaiting your review</h2>
            <p style="margin:6px 0 0;opacity:0.8;font-size:13px">${cfg.displayLabel}</p>
          </div>
          <div style="background:#fff;padding:22px 24px;border:1px solid #E5E5E8;border-top:none;border-radius:0 0 8px 8px">
            <p style="margin:0 0 14px;font-size:15px;color:#111">Hi — we sent you a proof for <strong>${escapeHtml(recordName)}</strong> a couple days ago. It's still waiting for your approval.</p>
            <p style="margin:0 0 20px;font-size:14px;color:#555">Quick click to review and respond:</p>
            <a href="${proofUrl}" style="display:inline-block;background:#16A34A;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;font-size:15px">Open Proof</a>
            <p style="margin:20px 0 0;font-size:12px;color:#999">If you've already responded elsewhere, please let us know so we can update our records.</p>
          </div>
          <p style="margin:16px 0;text-align:center;font-size:11px;color:#999">Sent by ANC Sports</p>
        </div>`
        await sendEmail(
          [share.client_email],
          `Reminder: proof ready — ${escapeHtml(recordName)}`,
          html,
          share.created_by_email || undefined
        ).catch((e) => console.error('[proof-nudge] email failed:', e))
        nudgedClients.push({ token: share.token, email: share.client_email })
      }

      await query(
        `UPDATE proof_shares SET last_nudged_at = NOW() WHERE token = $1`,
        [share.token]
      )
    }

    return NextResponse.json({
      ok: true,
      scanned: rows.rows.length,
      nudgedDesigners: nudgedDesigners.length,
      nudgedClients: nudgedClients.length,
    })
  } catch (err) {
    console.error('[proof-nudge] error:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'err' },
      { status: 500 }
    )
  }
}
