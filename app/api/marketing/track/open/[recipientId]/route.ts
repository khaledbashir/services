export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requestIp } from '@/lib/marketing'

const PIXEL = Buffer.from(
  'R0lGODlhAQABAPAAAP///wAAACH5BAAAAAAALAAAAAABAAEAAAICRAEAOw==',
  'base64',
)

export async function GET(request: NextRequest, { params }: { params: { recipientId: string } }) {
  try {
    const recipientRes = await query(
      `UPDATE newsletter_campaign_recipients
       SET opened_at = COALESCE(opened_at, NOW()),
           open_count = open_count + 1,
           status = CASE WHEN status IN ('pending', 'sent', 'test_sent') THEN status ELSE status END
       WHERE id = $1
       RETURNING campaign_id, contact_id`,
      [params.recipientId],
    )
    const recipient = recipientRes.rows[0]
    if (recipient) {
      await query(
        `INSERT INTO newsletter_campaign_events (campaign_id, recipient_id, contact_id, event_type, user_agent, ip_address)
         VALUES ($1, $2, $3, 'open', $4, $5)`,
        [recipient.campaign_id, params.recipientId, recipient.contact_id, request.headers.get('user-agent'), requestIp(request)],
      )
    }
  } catch (err) {
    console.error('Error tracking newsletter open:', err)
  }

  return new NextResponse(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
