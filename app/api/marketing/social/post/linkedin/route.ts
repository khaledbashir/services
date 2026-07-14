export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { postToLinkedIn } from '@/lib/signal/social-linkedin'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const text = String(body.text || '').trim()
  const accountId = body.accountId ? String(body.accountId) : null

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 })
  }

  // Pick an active LinkedIn account — caller-specified or the most recent live one
  const accountQ = accountId
    ? await query(
        `SELECT * FROM marketing_social_accounts
         WHERE platform = 'linkedin' AND id = $1 AND revoked_at IS NULL
         LIMIT 1`,
        [accountId],
      )
    : await query(
        `SELECT * FROM marketing_social_accounts
         WHERE platform = 'linkedin' AND revoked_at IS NULL
         ORDER BY connected_at DESC LIMIT 1`,
      )
  if (accountQ.rows.length === 0) {
    return NextResponse.json(
      { error: 'No connected LinkedIn account. Visit /marketing/settings to connect one.' },
      { status: 400 },
    )
  }
  const account = accountQ.rows[0] as {
    id: string
    access_token: string
    external_urn: string
    expires_at: string
    metadata: { sandbox?: boolean } | null
  }

  // Sandbox account: exercises the full publish flow without touching LinkedIn.
  // The post is recorded as published and mirrored into Slack so it's visible.
  if (account.metadata?.sandbox || account.access_token === 'SANDBOX') {
    const sandboxId = `sandbox-${Date.now()}`
    await query(
      `INSERT INTO marketing_social_posts (platform, integration_id, content, state, postiz_post_id, channel_name)
       VALUES ('linkedin', $1, $2, 'published', $3, 'LinkedIn — Sandbox')`,
      [account.id, text, sandboxId],
    )
    const botToken = process.env.SLACK_BOT_TOKEN || ''
    const mirrorChannel = process.env.SLACK_MARKETING_SANDBOX_CHANNEL || 'U0A92M2DA13'
    if (botToken) {
      await fetch('https://slack.com/api/chat.postMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${botToken}` },
        body: JSON.stringify({
          channel: mirrorChannel,
          text: `🧪 LinkedIn sandbox post (would publish to the connected page):\n\n${text}`,
        }),
      }).catch(() => {})
    }
    return NextResponse.json({ ok: true, sandbox: true, postId: sandboxId })
  }

  if (new Date(account.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { error: 'LinkedIn access token expired. Re-connect from /marketing/settings.', accountId: account.id },
      { status: 401 },
    )
  }

  try {
    const result = await postToLinkedIn({
      accessToken: account.access_token,
      authorUrn: account.external_urn,
      text,
    })
    await query(
      `INSERT INTO marketing_social_posts (platform, integration_id, content, state, postiz_post_id, channel_name)
       VALUES ('linkedin', $1, $2, 'published', $3, $4)`,
      [account.id, text, result.id, 'LinkedIn — personal'],
    )
    return NextResponse.json({ ok: true, postId: result.id, raw: result.raw })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
