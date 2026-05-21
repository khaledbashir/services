export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const result = await query(`SELECT c.*,
        a.name AS audience_name,
        COUNT(r.id)::int AS recipient_count,
        COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL)::int AS sent_count,
        COUNT(r.id) FILTER (WHERE r.opened_at IS NOT NULL)::int AS opened_count,
        COUNT(r.id) FILTER (WHERE r.first_clicked_at IS NOT NULL)::int AS clicked_count,
        COUNT(r.id) FILTER (WHERE r.unsubscribed_at IS NOT NULL)::int AS unsubscribed_count
      FROM newsletter_campaigns c
      LEFT JOIN marketing_audiences a ON a.id = c.audience_id
      LEFT JOIN newsletter_campaign_recipients r ON r.campaign_id = c.id
      GROUP BY c.id, a.name
      ORDER BY c.updated_at DESC
      LIMIT 100`)
    return NextResponse.json({ campaigns: result.rows })
  } catch (err) {
    console.error('Error loading campaigns:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const name = String(body.name || '').trim()
    const subject = String(body.subject || '').trim()
    if (!name || !subject) {
      return NextResponse.json({ error: 'Campaign name and subject are required' }, { status: 400 })
    }

    const result = await query(
      `INSERT INTO newsletter_campaigns
        (audience_id, template_id, name, subject, preview_text, from_name, from_email, reply_to, body_html, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
       RETURNING *`,
      [
        body.audienceId || null,
        body.templateId || null,
        name,
        subject,
        body.previewText || null,
        body.fromName || 'ANC Sports',
        body.fromEmail || 'notifications@ancsports.net',
        body.replyTo || null,
        body.bodyHtml || '',
      ],
    )
    return NextResponse.json({ campaign: result.rows[0] })
  } catch (err) {
    console.error('Error saving campaign:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
