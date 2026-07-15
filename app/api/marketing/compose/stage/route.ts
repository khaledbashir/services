export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { exportNewsletterBodyHtml, type NewsletterVisualDocument } from '@/lib/marketing/newsletter-visual'
import { markRunStaged } from '@/lib/marketing/compose-runs'

type StageBody = {
  audienceId?: string | null
  name?: string
  subject?: string
  previewText?: string
  bodyHtml?: string
  visual?: NewsletterVisualDocument
  social?: {
    linkedin?: string
    x?: string
    slack?: string
  }
  requestApproval?: boolean
  runId?: string | null
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as StageBody
    const visual = body.visual
    const subject = String(body.subject || visual?.subject || '').trim()
    const name = String(body.name || subject || 'AI Campaign Draft').trim()

    if (!subject) {
      return NextResponse.json({ error: 'Subject is required' }, { status: 400 })
    }

    const bodyHtml = body.bodyHtml?.trim() || (visual ? exportNewsletterBodyHtml(visual) : '')
    const visualContent = visual ? JSON.stringify(visual) : null

    const campaignResult = await query(
      `INSERT INTO newsletter_campaigns
        (audience_id, name, subject, preview_text, from_name, from_email, body_html, visual_content, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'draft')
       RETURNING *`,
      [
        body.audienceId || null,
        name,
        subject,
        body.previewText || visual?.previewText || null,
        'ANC Sports',
        'notifications@ancsports.net',
        bodyHtml,
        visualContent,
      ],
    )
    const campaign = campaignResult.rows[0]

    const socialPosts: Array<Record<string, unknown>> = []
    const social = body.social || {}
    for (const [platform, content] of Object.entries(social)) {
      const text = String(content || '').trim()
      if (!text) continue
      const postResult = await query(
        `INSERT INTO marketing_social_posts (campaign_id, platform, channel_name, content, state)
         VALUES ($1, $2, $3, $4, 'draft')
         RETURNING *`,
        [campaign.id, platform, 'marketing-hub', text],
      )
      socialPosts.push(postResult.rows[0])
    }

    let approvalId: string | null = null
    if (body.requestApproval !== false) {
      const approvalResult = await query(
        `INSERT INTO marketing_approval_requests
          (item_type, item_id, status, approver_group, notes, metadata)
         VALUES ('newsletter', $1, 'pending', $2, $3, $4::jsonb)
         RETURNING id`,
        [
          campaign.id,
          'Marketing approvals',
          `Staged from AI Campaign Builder for ${name}`,
          JSON.stringify({ source: 'marketing-compose', socialPostIds: socialPosts.map((post) => post.id) }),
        ],
      )
      approvalId = String(approvalResult.rows[0]?.id || '')
    }

    if (body.runId) {
      await markRunStaged(String(body.runId), campaign.id)
    }

    return NextResponse.json({
      campaign,
      socialPosts,
      approvalId,
      editUrl: `/marketing-hub/campaigns/${campaign.id}/edit`,
    })
  } catch (err) {
    console.error('marketing compose stage:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
