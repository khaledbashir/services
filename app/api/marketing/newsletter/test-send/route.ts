import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/email'
import { cleanEmail } from '@/lib/marketing'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Editor-driven test send.
 *
 * Unlike /api/marketing/campaigns/[id]/send-test (which is tied to a saved
 * campaign and writes recipient rows), this route accepts the exported HTML
 * directly so a designer can preview a draft in a real inbox before saving or
 * scheduling. No DB writes — it's a pure deliverability check.
 *
 * Auth: the global JWT-cookie middleware already gates every /api/marketing/*
 * route except track/unsubscribe, so no in-route session check is needed.
 *
 * Body: { to: string, subject?: string, html: string }
 */
export async function POST(request: NextRequest) {
  // Surface configuration state without ever exposing the key value.
  const hasKey = Boolean(process.env.SENDGRID_API_KEY || process.env.EMAIL_SMTP_PASSWORD)
  if (!hasKey) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Email sending isn’t configured on this environment yet. Add the email service key, then try again.',
        code: 'email_not_configured',
      },
      { status: 503 },
    )
  }

  let body: { to?: unknown; subject?: unknown; html?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid request body.' }, { status: 400 })
  }

  const to = cleanEmail(body.to)
  const html = typeof body.html === 'string' ? body.html : ''
  const subject = typeof body.subject === 'string' && body.subject.trim() ? body.subject.trim() : 'ANC Newsletter'

  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return NextResponse.json({ ok: false, error: 'Enter a valid test email address.' }, { status: 400 })
  }
  if (!html.trim()) {
    return NextResponse.json({ ok: false, error: 'Nothing to send yet — add some content first.' }, { status: 400 })
  }

  const sent = await sendEmail([to], `[TEST] ${subject}`, html)
  if (!sent) {
    return NextResponse.json(
      { ok: false, error: 'The email service rejected the send. Check the From address and key, then retry.' },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true, to })
}
