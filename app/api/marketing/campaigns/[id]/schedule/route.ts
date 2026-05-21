export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const scheduledAt = body.scheduledAt || null
    if (!scheduledAt) return NextResponse.json({ error: 'scheduledAt is required' }, { status: 400 })

    const campaignRes = await query(`SELECT * FROM newsletter_campaigns WHERE id = $1`, [params.id])
    const campaign = campaignRes.rows[0]
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    if (!campaign.audience_id) return NextResponse.json({ error: 'Campaign needs an audience first' }, { status: 400 })

    const prepared = await query(
      `INSERT INTO newsletter_campaign_recipients (campaign_id, contact_id, email, status)
       SELECT $1, c.id, c.email, 'pending'
       FROM marketing_audience_members m
       JOIN marketing_contacts c ON c.id = m.contact_id
       WHERE m.audience_id = $2
         AND m.status = 'active'
         AND c.subscription_status = 'subscribed'
         AND c.unsubscribed_at IS NULL
         AND c.bounced_at IS NULL
       ON CONFLICT (campaign_id, email) DO NOTHING
       RETURNING id`,
      [campaign.id, campaign.audience_id],
    )

    const result = await query(
      `UPDATE newsletter_campaigns
       SET status = 'scheduled', scheduled_at = $2, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [params.id, scheduledAt],
    )

    return NextResponse.json({ campaign: result.rows[0], prepared: prepared.rowCount })
  } catch (err) {
    console.error('Error scheduling newsletter campaign:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
