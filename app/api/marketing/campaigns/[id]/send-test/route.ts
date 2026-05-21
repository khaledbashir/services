export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { buildNewsletterHtml, cleanEmail, publicBaseUrl } from '@/lib/marketing'

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json()
    const email = cleanEmail(body.email)
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid test email is required' }, { status: 400 })
    }

    const campaignRes = await query(`SELECT * FROM newsletter_campaigns WHERE id = $1`, [params.id])
    const campaign = campaignRes.rows[0]
    if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

    const contactRes = await query(
      `INSERT INTO marketing_contacts (email, first_name, source, subscription_status)
       VALUES ($1, 'Test Recipient', 'test-send', 'subscribed')
       ON CONFLICT (email) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [email],
    )
    const contact = contactRes.rows[0]

    const recipientRes = await query(
      `INSERT INTO newsletter_campaign_recipients (campaign_id, contact_id, email, status)
       VALUES ($1, $2, $3, 'test_pending')
       ON CONFLICT (campaign_id, email) DO UPDATE
         SET contact_id = EXCLUDED.contact_id,
             status = 'test_pending',
             error_text = NULL
       RETURNING *`,
      [campaign.id, contact.id, email],
    )
    const recipient = recipientRes.rows[0]
    const baseUrl = publicBaseUrl(request)
    const html = buildNewsletterHtml({
      bodyHtml: campaign.body_html,
      previewText: campaign.preview_text,
      recipientId: recipient.id,
      baseUrl,
    })

    const ok = await sendEmail([email], `[TEST] ${campaign.subject}`, html, campaign.reply_to || undefined)
    if (!ok) {
      await query(
        `UPDATE newsletter_campaign_recipients
         SET status = 'test_failed', error_text = 'Email provider returned failure'
         WHERE id = $1`,
        [recipient.id],
      )
      return NextResponse.json({ error: 'Email provider failed or is not configured' }, { status: 502 })
    }

    await query(
      `UPDATE newsletter_campaign_recipients
       SET status = 'test_sent', sent_at = NOW()
       WHERE id = $1`,
      [recipient.id],
    )
    await query(
      `INSERT INTO newsletter_campaign_events (campaign_id, recipient_id, contact_id, event_type, event_url, user_agent, ip_address)
       VALUES ($1, $2, $3, 'sent', $4, $5, $6)`,
      [
        campaign.id,
        recipient.id,
        contact.id,
        `mailto:${email}`,
        request.headers.get('user-agent'),
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip'),
      ],
    )

    return NextResponse.json({ sent: true, recipientId: recipient.id })
  } catch (err) {
    console.error('Error sending test newsletter:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
