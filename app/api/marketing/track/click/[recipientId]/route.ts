export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requestIp } from '@/lib/marketing'

export async function GET(request: NextRequest, { params }: { params: { recipientId: string } }) {
  const target = request.nextUrl.searchParams.get('url') || 'https://anc.com'

  try {
    const recipientRes = await query(
      `UPDATE newsletter_campaign_recipients
       SET first_clicked_at = COALESCE(first_clicked_at, NOW()),
           click_count = click_count + 1
       WHERE id = $1
       RETURNING campaign_id, contact_id`,
      [params.recipientId],
    )
    const recipient = recipientRes.rows[0]
    if (recipient) {
      await query(
        `INSERT INTO newsletter_campaign_events (campaign_id, recipient_id, contact_id, event_type, event_url, user_agent, ip_address)
         VALUES ($1, $2, $3, 'click', $4, $5, $6)`,
        [recipient.campaign_id, params.recipientId, recipient.contact_id, target, request.headers.get('user-agent'), requestIp(request)],
      )
    }
  } catch (err) {
    console.error('Error tracking newsletter click:', err)
  }

  return NextResponse.redirect(target)
}
