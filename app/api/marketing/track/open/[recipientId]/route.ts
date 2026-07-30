export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requestIp } from '@/lib/marketing'

const PIXEL = Buffer.from(
  'R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64',
)

// The pixel is emitted as `<recipientId>.png` on purpose — a bare UUID path with
// no image extension is refused by several mail clients' proxies. So the segment
// that arrives here always carries the extension, the UUID comparison threw
// ("invalid input syntax for type uuid"), and the catch below swallowed it: the
// pixel still returned 200, so nothing looked wrong while every open across
// 7,603 delivered emails was dropped. Strip the extension before querying.
function recipientIdFrom(segment: string): string {
  return decodeURIComponent(segment).replace(/\.(png|gif|jpe?g)$/i, '')
}

export async function GET(request: NextRequest, { params }: { params: { recipientId: string } }) {
  const recipientId = recipientIdFrom(params.recipientId)
  try {
    const recipientRes = await query(
      `UPDATE newsletter_campaign_recipients
       SET opened_at = COALESCE(opened_at, NOW()),
           open_count = open_count + 1,
           status = CASE WHEN status IN ('pending', 'sent', 'test_sent') THEN status ELSE status END
       WHERE id = $1
       RETURNING campaign_id, contact_id`,
      [recipientId],
    )
    const recipient = recipientRes.rows[0]
    if (recipient) {
      await query(
        `INSERT INTO newsletter_campaign_events (campaign_id, recipient_id, contact_id, event_type, user_agent, ip_address)
         VALUES ($1, $2, $3, 'open', $4, $5)`,
        [recipient.campaign_id, recipientId, recipient.contact_id, request.headers.get('user-agent'), requestIp(request)],
      )
    }
  } catch (err) {
    // Log the id that failed — a bare message here is what let a malformed
    // segment look identical to "nobody opened it" for months.
    console.error(`Error tracking newsletter open (recipient=${recipientId}):`, err)
  }

  return new NextResponse(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
