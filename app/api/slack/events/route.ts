import { NextRequest, NextResponse } from 'next/server'
import { cleanSlackPrompt, markSlackEventProcessed, resolveSlackCaller, runSlackAssistantTurn, verifySlackSignature } from '@/lib/slack-assistant'
import { sendSlackMessage } from '@/lib/slack'
import { handleSlackReactionAdded, captureDirectMessageToInbox } from '@/lib/slack-inbox'
import { captureCodexMention, shouldCaptureCodexMention } from '@/lib/codex-request-inbox'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function assistantMuted(): boolean {
  const v = (process.env.SLACK_ASSISTANT_ENABLED || '').trim().toLowerCase()
  return v === 'false' || v === '0' || v === 'off' || v === 'no'
}

function shouldHandleEvent(event: any, botUserId?: string): boolean {
  if (!event || event.subtype === 'bot_message' || event.bot_id) return false
  if (assistantMuted()) return false
  // Require an explicit @-mention everywhere — channels AND DMs. Without
  // this, a bare "ANC hi" in a DM (channel_type=im) would auto-reply.
  if (event.type === 'app_mention') return true
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
  const body = JSON.parse(rawBody || '{}')
  if (body.type === 'url_verification') {
    const verificationToken = process.env.SLACK_VERIFICATION_TOKEN || ''
    if (verificationToken && body.token !== verificationToken) {
      return NextResponse.json({ ok: false, error: 'invalid_verification_token' }, { status: 401 })
    }
    return new Response(String(body.challenge || ''), {
      status: 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  if (!verifySlackSignature(request.headers, rawBody)) {
    return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 401 })
  }

  if (body.type !== 'event_callback' || !body.event_id || !body.event) {
    return NextResponse.json({ ok: true })
  }

  const accepted = await markSlackEventProcessed(String(body.event_id))
  if (!accepted) return NextResponse.json({ ok: true })

  const botUserId = typeof body.authorizations?.[0]?.user_id === 'string' ? body.authorizations[0].user_id : undefined

  // Inbox capture pipeline runs in parallel with the assistant. Fire-and-forget
  // so a Slack hiccup never blocks the Slack 3-second ack window.
  if (body.event?.type === 'reaction_added') {
    void handleSlackReactionAdded(body.event).catch((err) => {
      console.error('Slack inbox reaction capture failed:', err)
    })
  } else if (
    body.event?.type === 'message' &&
    body.event?.channel_type === 'im' &&
    !body.event?.subtype &&
    !body.event?.bot_id &&
    !(typeof body.event?.text === 'string' && botUserId && body.event.text.includes(`<@${botUserId}>`))
  ) {
    // Non-@-mention DM to the bot — capture to inbox (doesn't reply).
    void captureDirectMessageToInbox(body.event).catch((err) => {
      console.error('Slack inbox DM capture failed:', err)
    })
  }

  const codexShouldCapture = shouldCaptureCodexMention(body.event, botUserId)
  if (codexShouldCapture) {
    void captureCodexMention(body.event, botUserId).catch((err) => {
      console.error('Codex request inbox capture failed:', err)
    })
  }

  if (shouldHandleEvent(body.event, botUserId) && !codexShouldCapture) {
    void processSlackEvent(body.event, botUserId).catch((err) => {
      console.error('Slack assistant event failed:', err)
    })
  }

  return NextResponse.json({ ok: true })
}
