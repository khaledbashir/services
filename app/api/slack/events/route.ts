import { NextRequest, NextResponse } from 'next/server'
import { cleanSlackPrompt, markSlackEventProcessed, resolveSlackCaller, runSlackAssistantTurn, verifySlackSignature } from '@/lib/slack-assistant'
import { sendSlackMessage } from '@/lib/slack'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function shouldHandleEvent(event: any, botUserId?: string): boolean {
  if (!event || event.subtype === 'bot_message' || event.bot_id) return false
  if (event.type === 'app_mention') return true
  if (event.channel_type === 'im') return true
  if (botUserId && typeof event.text === 'string' && event.text.includes(`<@${botUserId}>`)) return true
  return false
}

async function processSlackEvent(event: any, botUserId?: string) {
  const channelId = typeof event.channel === 'string' ? event.channel : ''
  const threadTs = typeof event.thread_ts === 'string' ? event.thread_ts : (typeof event.ts === 'string' ? event.ts : '')
  const eventTs = typeof event.ts === 'string' ? event.ts : undefined
  const userSlackId = typeof event.user === 'string' ? event.user : undefined
  const prompt = cleanSlackPrompt(typeof event.text === 'string' ? event.text : '', botUserId)

  if (!channelId || !threadTs || !prompt) return

  const caller = await resolveSlackCaller(userSlackId)
  if (!caller) {
    await sendSlackMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: 'I can help once your Slack user is mapped to a dashboard staff account. Add your Slack user ID to `staff.slack_user_ids` or include you in `ANC_SLACK_ADMIN_IDS`.',
    })
    return
  }

  const reply = await runSlackAssistantTurn({
    caller,
    channelId,
    threadTs,
    eventTs,
    prompt,
  })

  await sendSlackMessage({
    channel: channelId,
    thread_ts: threadTs,
    text: reply,
  })
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  if (!verifySlackSignature(request.headers, rawBody)) {
    return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 401 })
  }

  const body = JSON.parse(rawBody || '{}')
  if (body.type === 'url_verification') {
    return NextResponse.json({ challenge: body.challenge })
  }

  if (body.type !== 'event_callback' || !body.event_id || !body.event) {
    return NextResponse.json({ ok: true })
  }

  const accepted = await markSlackEventProcessed(String(body.event_id))
  if (!accepted) return NextResponse.json({ ok: true })

  const botUserId = typeof body.authorizations?.[0]?.user_id === 'string' ? body.authorizations[0].user_id : undefined
  if (shouldHandleEvent(body.event, botUserId)) {
    void processSlackEvent(body.event, botUserId).catch((err) => {
      console.error('Slack assistant event failed:', err)
    })
  }

  return NextResponse.json({ ok: true })
}
