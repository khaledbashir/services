export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const campaignRes = await query(`SELECT * FROM newsletter_campaigns WHERE id = $1`, [params.id])
    const campaign = campaignRes.rows[0]
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (!campaign.audience_id) return NextResponse.json({ error: 'Campaign needs an audience first' }, { status: 400 })

    const result = await query(
      `INSERT INTO newsletter_campaign_recipients (campaign_id, contact_id, email, status)
       SELECT $1, c.id, c.email, 'pending'
       FROM marketing_audience_members m
       JOIN marketing_contacts c ON c.id = m.contact_id
       WHERE m.audience_id = $2
         AND m.status = 'active'
         AND c.subscription_status = 'subscribed'
         AND c.unsubscribed_at IS NULL
         AND c.bounced_at IS NULL
       ON CONFLICT (campaign_id, email) DO UPDATE
         SET contact_id = EXCLUDED.contact_id,
             status = CASE
               WHEN newsletter_campaign_recipients.status IN ('sent', 'unsubscribed') THEN newsletter_campaign_recipients.status
               ELSE 'pending'
             END,
             error_text = NULL
       RETURNING id`,
      [campaign.id, campaign.audience_id],
    )

    return NextResponse.json({ prepared: result.rowCount })
  } catch (err) {
    console.error('Error preparing newsletter recipients:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
