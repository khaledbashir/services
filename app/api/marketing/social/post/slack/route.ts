export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendSlackMessageDetailed } from '@/lib/slack'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const text = String(body.text || '').trim()
  const channel = String(body.channel || process.env.SLACK_DEFAULT_CHANNEL || '').trim()

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }
  if (!channel) {
    return NextResponse.json({ error: 'channel is required (or set SLACK_DEFAULT_CHANNEL)' }, { status: 400 })
  }

  const result = await sendSlackMessageDetailed({ channel, text })
  if (!result.ok) {
    return NextResponse.json({ error: 'Slack post failed', detail: result }, { status: 500 })
  }

  await query(
    `INSERT INTO marketing_social_posts (platform, integration_id, content, state, postiz_post_id, channel_name)
     VALUES ('slack', NULL, $1, 'published', $2, $3)`,
    [text, result.ts || null, channel],
  )

  return NextResponse.json({ ok: true, ts: result.ts, channel: result.channel })
}
