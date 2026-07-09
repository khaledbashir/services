import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { patchTwentyRecord, fetchTwentyRecord, OBJECT_CONFIGS } from '@/lib/proof-share'
import { sendSlackMessage } from '@/lib/slack'

/**
 * POST /api/proof-share/[token]/view
 *
 * Records that a proof link was viewed. Called from the client-facing page
 * on mount (fire-and-forget — doesn't block page rendering).
 *
 * Tracks:
 *   - view_count
 *   - last_viewed_at
 *   - last_viewed_ip
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      'unknown'

    const result = await query(
      `UPDATE proof_shares
       SET view_count = view_count + 1,
           last_viewed_at = NOW(),
           last_viewed_ip = $2
       WHERE token = $1
         AND (expires_at IS NULL OR expires_at > NOW())
       RETURNING twenty_object_type, twenty_record_id, view_count, last_viewed_at,
                 created_by_name, created_by_email, client_email`,
      [token, ip]
    )

    if (result.rows.length > 0) {
      const row = result.rows[0]
      const isFtp = row.twenty_object_type === 'ftpFolder'
      // FTP shares have no Twenty record to write back to.
      if (!isFtp) {
        void patchTwentyRecord(row.twenty_object_type, row.twenty_record_id, {
          proofViewCount: row.view_count,
          proofLastViewedAt: row.last_viewed_at,
        })
      }

      // Slack ping designer on the FIRST open only
      const slackChannel = process.env.SLACK_DEFAULT_CHANNEL || ''
      if (slackChannel && row.view_count === 1) {
        const cfg = isFtp ? { displayLabel: 'Proof' } : OBJECT_CONFIGS[row.twenty_object_type]
        const record = isFtp
          ? null
          : await fetchTwentyRecord(row.twenty_object_type, row.twenty_record_id).catch(() => null)
        const recordName = (record?.name as string) || 'a proof'
        const designerLabel = row.created_by_name || row.created_by_email || 'a designer'
        const clientLabel = row.client_email || 'the client'
        await sendSlackMessage({
          channel: slackChannel,
          text: `👀 ${clientLabel} opened the proof for ${recordName}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `👀 *Proof opened* — ${cfg?.displayLabel ?? row.twenty_object_type}\n*${recordName}*`,
              },
            },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Client:*\n${clientLabel}` },
                { type: 'mrkdwn', text: `*Sent by:*\n${designerLabel}` },
              ],
            },
          ],
        }).catch((e) => console.error('[proof-share/view] slack failed:', e))
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[proof-share/view] error:', err)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
