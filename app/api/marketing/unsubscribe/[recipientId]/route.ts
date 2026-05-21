export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requestIp } from '@/lib/marketing'

export async function GET(request: NextRequest, { params }: { params: { recipientId: string } }) {
  try {
    const recipientRes = await query(
      `UPDATE newsletter_campaign_recipients
       SET unsubscribed_at = NOW(), status = 'unsubscribed'
       WHERE id = $1
       RETURNING campaign_id, contact_id, email`,
      [params.recipientId],
    )
    const recipient = recipientRes.rows[0]
    if (recipient) {
      await query(
        `UPDATE marketing_contacts
         SET subscription_status = 'unsubscribed',
             unsubscribed_at = NOW(),
             unsubscribe_reason = 'newsletter link',
             updated_at = NOW()
         WHERE id = $1`,
        [recipient.contact_id],
      )
      await query(
        `INSERT INTO newsletter_campaign_events (campaign_id, recipient_id, contact_id, event_type, event_url, user_agent, ip_address)
         VALUES ($1, $2, $3, 'unsubscribe', $4, $5, $6)`,
        [
          recipient.campaign_id,
          params.recipientId,
          recipient.contact_id,
          `mailto:${recipient.email}`,
          request.headers.get('user-agent'),
          requestIp(request),
        ],
      )
    }
  } catch (err) {
    console.error('Error unsubscribing marketing recipient:', err)
  }

  return new NextResponse(
    `<!doctype html><html><body style="font-family:Arial,sans-serif;padding:32px;color:#111827"><h1 style="font-size:22px">You are unsubscribed</h1><p style="font-size:14px;color:#4b5563">You will no longer receive ANC Sports marketing emails from this list.</p></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )
}
