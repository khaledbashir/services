import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || ''
const API_KEY = process.env.JWT_SECRET || 'anc-services-secret-key-change-me'

async function slackAPI(method: string, body: any) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const key = searchParams.get('key')
    if (key !== API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!SLACK_BOT_TOKEN) {
      return NextResponse.json({ error: 'SLACK_BOT_TOKEN not configured' }, { status: 500 })
    }

    const { message, user_ids, blocks } = await request.json()

    if (!message) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 })
    }

    let targetUsers: string[] = []

    if (user_ids && Array.isArray(user_ids) && user_ids.length > 0) {
      // Send to specific users
      targetUsers = user_ids
    } else {
      // Broadcast to all workspace members
      const usersRes = await slackAPI('users.list', {})
      if (!usersRes.ok) {
        return NextResponse.json({ error: 'Failed to list users', detail: usersRes.error }, { status: 500 })
      }
      targetUsers = usersRes.members
        .filter((u: any) => !u.is_bot && !u.deleted && u.id !== 'USLACKBOT')
        .map((u: any) => u.id)
    }

    const sent: string[] = []
    const failed: string[] = []

    for (const userId of targetUsers) {
      try {
        // Open DM channel
        const dmRes = await slackAPI('conversations.open', { users: userId })
        if (!dmRes.ok) {
          failed.push(userId)
          continue
        }

        const channelId = dmRes.channel.id

        // Send message
        const msgPayload: any = { channel: channelId, text: message }
        if (blocks) msgPayload.blocks = blocks

        const sendRes = await slackAPI('chat.postMessage', msgPayload)
        if (sendRes.ok) {
          sent.push(userId)
        } else {
          failed.push(userId)
        }
      } catch {
        failed.push(userId)
      }
    }

    return NextResponse.json({ sent: sent.length, failed: failed.length, total: targetUsers.length })
  } catch (err) {
    console.error('Error broadcasting:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
