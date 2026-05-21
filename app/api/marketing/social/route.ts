export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const result = await query(
      `SELECT *
       FROM marketing_social_posts
       ORDER BY COALESCE(scheduled_at, created_at) DESC
       LIMIT 100`,
    )
    return NextResponse.json({
      posts: result.rows,
      postiz: {
        url: process.env.POSTIZ_API_URL || process.env.POSTIZ_URL || 'https://abc-postiz.izcgmb.easypanel.host',
        connectedChannels: ['Slack'],
        missingChannels: ['LinkedIn', 'X', 'Instagram'],
        note: 'Connect remaining official ANC accounts in Postiz Integrations before this can publish to every HubSpot channel.',
      },
    })
  } catch (err) {
    console.error('Error loading social posts:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const platform = String(body.platform || 'slack').trim().toLowerCase()
    const content = String(body.content || '').trim()
    if (!content) return NextResponse.json({ error: 'Post content is required' }, { status: 400 })

    const result = await query(
      `INSERT INTO marketing_social_posts
        (campaign_id, platform, integration_id, channel_name, content, media_url, scheduled_at, state)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        body.campaignId || null,
        platform,
        body.integrationId || null,
        body.channelName || null,
        content,
        body.mediaUrl || null,
        body.scheduledAt || null,
        body.scheduledAt ? 'scheduled' : 'draft',
      ],
    )
    return NextResponse.json({ post: result.rows[0] })
  } catch (err) {
    console.error('Error saving social post:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
