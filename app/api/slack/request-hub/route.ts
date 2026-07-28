export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { verifySlackSignature } from '@/lib/slack-assistant'
import { handleHubSlashCommand } from '@/lib/request-hub/slack'

// POST /api/slack/request-hub — the `/request` slash command.
// Configure the slash command's Request URL to point here. Signature-verified
// and fail-closed (no SLACK_SIGNING_SECRET = every request rejected).
export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  if (!verifySlackSignature(request.headers, rawBody)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }
  const params = new URLSearchParams(rawBody)
  try {
    const response = await handleHubSlashCommand(params)
    if (Object.keys(response).length === 0) return new NextResponse('', { status: 200 })
    return NextResponse.json(response)
  } catch (err) {
    console.error('[request-hub] slash command failed:', err)
    return NextResponse.json({
      response_type: 'ephemeral',
      text: 'Something went wrong creating your request — try again, or use the request page.',
    })
  }
}
