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
    const analytics = await query(
      `SELECT
         COUNT(DISTINCT r.id)::int AS recipient_count,
         COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'pending')::int AS pending_count,
         COUNT(DISTINCT r.id) FILTER (WHERE r.sent_at IS NOT NULL)::int AS sent_count,
         COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'failed' OR r.status = 'test_failed')::int AS failed_count,
         COUNT(DISTINCT r.id) FILTER (WHERE r.opened_at IS NOT NULL)::int AS opened_count,
         COUNT(DISTINCT r.id) FILTER (WHERE r.first_clicked_at IS NOT NULL)::int AS clicked_count,
         COUNT(DISTINCT r.id) FILTER (WHERE r.unsubscribed_at IS NOT NULL)::int AS unsubscribed_count,
         ROUND((COUNT(DISTINCT r.id) FILTER (WHERE r.sent_at IS NOT NULL))::numeric * 100 / NULLIF(COUNT(DISTINCT r.id), 0), 1)::float AS delivery_rate,
         ROUND((COUNT(DISTINCT r.id) FILTER (WHERE r.opened_at IS NOT NULL))::numeric * 100 / NULLIF(COUNT(DISTINCT r.id) FILTER (WHERE r.sent_at IS NOT NULL), 0), 1)::float AS open_rate,
         ROUND((COUNT(DISTINCT r.id) FILTER (WHERE r.first_clicked_at IS NOT NULL))::numeric * 100 / NULLIF(COUNT(DISTINCT r.id) FILTER (WHERE r.sent_at IS NOT NULL), 0), 1)::float AS click_rate,
         ROUND((COUNT(DISTINCT r.id) FILTER (WHERE r.unsubscribed_at IS NOT NULL))::numeric * 100 / NULLIF(COUNT(DISTINCT r.id) FILTER (WHERE r.sent_at IS NOT NULL), 0), 1)::float AS unsubscribe_rate,
         MAX(e.created_at) AS last_event_at
       FROM newsletter_campaigns c
       LEFT JOIN newsletter_campaign_recipients r ON r.campaign_id = c.id
       LEFT JOIN newsletter_campaign_events e ON e.campaign_id = c.id
       WHERE c.id = $1
       GROUP BY c.id`,
      [params.id],
    )

    return NextResponse.json({ campaign: campaign.rows[0], analytics: analytics.rows[0], recipients: recipients.rows, events: events.rows })
  } catch (err) {
    console.error('Error loading campaign:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const visualContent = body.visualContent != null ? JSON.stringify(body.visualContent) : null
    const result = await query(
      `UPDATE newsletter_campaigns
       SET audience_id = COALESCE($2, audience_id),
           name = COALESCE($3, name),
           subject = COALESCE($4, subject),
           preview_text = COALESCE($5, preview_text),
           from_name = COALESCE($6, from_name),
           from_email = COALESCE($7, from_email),
           reply_to = COALESCE($8, reply_to),
           body_html = COALESCE($9, body_html),
           visual_content = COALESCE($10::jsonb, visual_content),
           status = COALESCE($11, status),
           scheduled_at = COALESCE($12, scheduled_at),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        params.id,
        body.audienceId ?? null,
        body.name ?? null,
        body.subject ?? null,
        body.previewText ?? null,
        body.fromName ?? null,
        body.fromEmail ?? null,
        body.replyTo ?? null,
        body.bodyHtml ?? null,
        visualContent,
        body.status ?? null,
        body.scheduledAt ?? null,
      ],
    )
    if (!result.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ campaign: result.rows[0] })
  } catch (err) {
    console.error('Error updating campaign:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
