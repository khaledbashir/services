export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const campaign = await query(
      `SELECT c.*, a.name AS audience_name
       FROM newsletter_campaigns c
       LEFT JOIN marketing_audiences a ON a.id = c.audience_id
       WHERE c.id = $1`,
      [params.id],
    )
    if (!campaign.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const recipients = await query(
      `SELECT r.*, c.first_name, c.last_name, c.company_name
       FROM newsletter_campaign_recipients r
       LEFT JOIN marketing_contacts c ON c.id = r.contact_id
       WHERE r.campaign_id = $1
       ORDER BY r.created_at DESC
       LIMIT 250`,
      [params.id],
    )
    const events = await query(
      `SELECT *
       FROM newsletter_campaign_events
       WHERE campaign_id = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [params.id],
    )

    return NextResponse.json({ campaign: campaign.rows[0], recipients: recipients.rows, events: events.rows })
  } catch (err) {
    console.error('Error loading campaign:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const result = await query(
      `UPDATE newsletter_campaigns
       SET audience_id = $2,
           name = $3,
           subject = $4,
           preview_text = $5,
           from_name = $6,
           from_email = $7,
           reply_to = $8,
           body_html = $9,
           status = COALESCE($10, status),
           scheduled_at = $11,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        params.id,
        body.audienceId || null,
        body.name,
        body.subject,
        body.previewText || null,
        body.fromName || 'ANC Sports',
        body.fromEmail || 'notifications@ancsports.net',
        body.replyTo || null,
        body.bodyHtml || '',
        body.status || null,
        body.scheduledAt || null,
      ],
    )
    if (!result.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ campaign: result.rows[0] })
  } catch (err) {
    console.error('Error updating campaign:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
