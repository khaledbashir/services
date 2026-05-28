export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { generateText } from 'ai'
import { openai } from '@ai-sdk/openai'
import { query } from '@/lib/db'

/**
 * After-send AI narrative for a campaign or social post.
 *
 * Pulls real engagement numbers from the DB and asks GPT to write a tight
 * 3-line operator narrative: what worked / what didn't / next move.
 * No charts. No filler. Just the read.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const campaignId = body.campaignId ? String(body.campaignId) : null
  const socialPostId = body.socialPostId ? String(body.socialPostId) : null

  if (!campaignId && !socialPostId) {
    return NextResponse.json({ error: 'campaignId or socialPostId required' }, { status: 400 })
  }

  let stats: Record<string, unknown> = {}
  if (campaignId) {
    const r = await query(
      `SELECT c.name, c.subject, c.status, c.scheduled_at, c.sent_at,
              a.name AS audience_name,
              COUNT(r.id)::int                                                AS total,
              COUNT(r.id) FILTER (WHERE r.sent_at IS NOT NULL)::int           AS sent,
              COUNT(r.id) FILTER (WHERE r.opened_at IS NOT NULL)::int         AS opened,
              COUNT(r.id) FILTER (WHERE r.first_clicked_at IS NOT NULL)::int  AS clicked,
              COUNT(r.id) FILTER (WHERE r.unsubscribed_at IS NOT NULL)::int   AS unsubscribed
       FROM newsletter_campaigns c
       LEFT JOIN marketing_audiences a ON a.id = c.audience_id
       LEFT JOIN newsletter_campaign_recipients r ON r.campaign_id = c.id
       WHERE c.id = $1
       GROUP BY c.id, a.name
       LIMIT 1`,
      [campaignId],
    )
    stats = (r.rows[0] as Record<string, unknown>) || {}
  } else if (socialPostId) {
    const r = await query(
      `SELECT platform, channel_name, content, state, created_at, postiz_post_id
       FROM marketing_social_posts WHERE id = $1 LIMIT 1`,
      [socialPostId],
    )
    stats = (r.rows[0] as Record<string, unknown>) || {}
  }

  const factSheet = JSON.stringify(stats, null, 2)
  const prompt = `You write 3-line operator narratives for ANC Sports marketing performance. Tight, direct, no filler.

Data:
${factSheet}

Output exactly three lines, in this order, no labels, no preamble:
Line 1 — what worked (one fact, with the number).
Line 2 — what didn't or what to watch (one fact).
Line 3 — next move (one concrete action).`

  try {
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
    })
    return NextResponse.json({ stats, narrative: text.trim() })
  } catch (err) {
    return NextResponse.json({ stats, error: String(err) }, { status: 500 })
  }
}
