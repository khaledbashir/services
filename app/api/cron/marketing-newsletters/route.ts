export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { buildNewsletterHtml, publicBaseUrl, requestIp } from '@/lib/marketing'

export async function GET(request: NextRequest) {
  try {
    const campaignsRes = await query(
      `SELECT *
       FROM newsletter_campaigns
       WHERE status = 'scheduled'
         AND scheduled_at <= NOW()
       ORDER BY scheduled_at ASC
       LIMIT 5`,
    )

    let sent = 0
    let failed = 0

    for (const campaign of campaignsRes.rows) {
      const recipientsRes = await query(
        `SELECT r.*
         FROM newsletter_campaign_recipients r
         LEFT JOIN marketing_contacts c ON c.id = r.contact_id
         WHERE r.campaign_id = $1
           AND r.status = 'pending'
           AND COALESCE(c.subscription_status, 'subscribed') = 'subscribed'
           AND c.unsubscribed_at IS NULL
           AND c.bounced_at IS NULL
         ORDER BY r.created_at ASC
         LIMIT 100`,
        [campaign.id],
      )

      if (recipientsRes.rows.length === 0) {
        await query(
          `UPDATE newsletter_campaigns
           SET status = 'sent',
               sent_at = COALESCE(sent_at, NOW()),
               updated_at = NOW()
           WHERE id = $1`,
          [campaign.id],
        )
        continue
      }

      for (const recipient of recipientsRes.rows) {
        const ok = await sendEmail(
          [recipient.email],
          campaign.subject,
          buildNewsletterHtml({
            bodyHtml: campaign.body_html,
            previewText: campaign.preview_text,
            recipientId: recipient.id,
            baseUrl: publicBaseUrl(request),
          }),
          campaign.reply_to || undefined,
        )
        if (ok) {
          sent += 1
          await query(
            `UPDATE newsletter_campaign_recipients
             SET status = 'sent', sent_at = NOW(), error_text = NULL
             WHERE id = $1`,
            [recipient.id],
          )
          await query(
            `INSERT INTO newsletter_campaign_events (campaign_id, recipient_id, contact_id, event_type, event_url, user_agent, ip_address)
             VALUES ($1, $2, $3, 'sent', $4, $5, $6)`,
            [
              campaign.id,
              recipient.id,
              recipient.contact_id,
              `mailto:${recipient.email}`,
              request.headers.get('user-agent'),
              requestIp(request),
            ],
          )
        } else {
          failed += 1
          await query(
            `UPDATE newsletter_campaign_recipients
             SET status = 'failed', error_text = 'Email provider returned failure'
             WHERE id = $1`,
            [recipient.id],
          )
        }
      }
    }

    return NextResponse.json({ campaigns: campaignsRes.rowCount, sent, failed })
  } catch (err) {
    console.error('Error sending scheduled marketing newsletters:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
