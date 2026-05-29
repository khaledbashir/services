export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { suppressMarketingEmail } from '@/lib/marketing-sync'

function lower(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function readPath(record: Record<string, any>, paths: string[]): unknown {
  for (const path of paths) {
    const value = path.split('.').reduce<unknown>((acc, key) => {
      if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
      return undefined
    }, record)
    if (value !== undefined && value !== null && String(value).trim() !== '') return value
  }
  return null
}

function firstEmail(value: unknown): string | null {
  if (Array.isArray(value)) return firstEmail(value[0])
  if (value && typeof value === 'object') {
    return firstEmail((value as Record<string, unknown>).email || (value as Record<string, unknown>).address)
  }
  const email = lower(value)
  return email && email.includes('@') ? email : null
}

function eventReason(type: string): 'bounce' | 'complaint' | 'unsubscribe' | null {
  if (/bounce|bounced|delivery_failed|email\.bounced/.test(type)) return 'bounce'
  if (/complaint|complained|spam|abuse/.test(type)) return 'complaint'
  if (/unsubscribe|unsubscribed/.test(type)) return 'unsubscribe'
  return null
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.MARKETING_EMAIL_WEBHOOK_SECRET || process.env.RESEND_WEBHOOK_SECRET || ''
  if (!secret) return process.env.NODE_ENV !== 'production'
  const auth = request.headers.get('authorization') || ''
  const explicit = request.headers.get('x-webhook-secret') || request.headers.get('x-resend-webhook-secret') || ''
  // SendGrid's Event Webhook can't send custom headers — allow ?secret= on the URL too.
  const qp = request.nextUrl.searchParams.get('secret') || ''
  return auth === `Bearer ${secret}` || explicit === secret || qp === secret
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    // SendGrid posts a BATCHED ARRAY of events; Resend/others post a single object.
    // Normalize to an array and process each event.
    const events: any[] = Array.isArray(body) ? body : [body]
    const results: any[] = []

    for (const evt of events) {
      const type = lower(readPath(evt, ['type', 'event', 'event_type', 'data.type']))
      const reason = eventReason(type)
      if (!reason) { results.push({ ignored: true, type }); continue }

      const email = firstEmail(readPath(evt, [
        'data.to',
        'data.email',
        'data.recipient',
        'email',
        'recipient',
        'to',
      ]))
      if (!email) { results.push({ error: 'no email', type }); continue }

      const recipientId = String(readPath(evt, [
        'data.tags.recipient_id',
        'data.tags.newsletter_recipient_id',
        'tags.recipient_id',
        'recipient_id',
        'newsletter_recipient_id',
        'sg_message_id',
      ]) || '').trim() || null
      const campaignId = String(readPath(evt, [
        'data.tags.campaign_id',
        'data.tags.newsletter_campaign_id',
        'tags.campaign_id',
        'campaign_id',
        'newsletter_campaign_id',
      ]) || '').trim() || null

      const result = await suppressMarketingEmail({
        email,
        reason,
        recipientId,
        campaignId,
        rawEvent: {
          type,
          provider_id: readPath(evt, ['data.email_id', 'data.id', 'id', 'sg_event_id']),
          reason: readPath(evt, ['data.reason', 'reason']),
        },
      })
      results.push({ ok: true, type, reason, email, ...result })
    }

    return NextResponse.json({ ok: true, processed: results.length, results })
  } catch (err) {
    console.error('Error processing marketing email webhook:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
