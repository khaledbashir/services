export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { createRequest } from '@/lib/request-hub/core'
import { getHubConfig } from '@/lib/request-hub/config'
import { assistIntake } from '@/lib/request-hub/ai'
import { dmRequesterConfirmation, postIntakeCard } from '@/lib/request-hub/slack'

// POST /api/request-hub/intake/email — inbound-email webhook.
// Auth: Authorization: Bearer $REQUEST_HUB_EMAIL_TOKEN (fail-closed: unset
// token = endpoint disabled). Body: { from_email, from_name?, subject, body,
// message_id? }. Point your inbound-parse provider (or a mail rule) here.
export async function POST(request: NextRequest) {
  const expected = process.env.REQUEST_HUB_EMAIL_TOKEN
  const provided = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const fromEmail = String(body?.from_email || '').trim().toLowerCase()
  const subject = String(body?.subject || '').trim()
  const text = String(body?.body || '').trim()
  if (!fromEmail || !text) {
    return NextResponse.json({ error: 'from_email and body are required' }, { status: 400 })
  }

  // Idempotency on provider message id.
  if (body?.message_id) {
    const dupe = await query(
      `SELECT id, request_number FROM request_hub_items WHERE source = 'email' AND source_message_ts = $1 LIMIT 1`,
      [String(body.message_id)]
    )
    if (dupe.rows[0]) {
      return NextResponse.json({ request: dupe.rows[0], duplicate: true })
    }
  }

  const staffRes = await query(
    `SELECT id, full_name FROM staff WHERE LOWER(email) = $1 AND is_active = true LIMIT 1`,
    [fromEmail]
  )
  const staff = staffRes.rows[0] || null

  const req = await createRequest({
    type: 'idea',
    status: 'submitted',
    title: subject.slice(0, 120) || null,
    summary: text.slice(0, 1000),
    answers: { want: text, source_email_subject: subject },
    requester: {
      userId: staff?.id || null,
      fullName: staff?.full_name || String(body?.from_name || fromEmail),
      email: fromEmail,
    },
    source: 'email',
    sourceMessageTs: body?.message_id ? String(body.message_id) : null,
  })

  void (async () => {
    try {
      const config = await getHubConfig()
      const assist = await assistIntake(req, config)
      let current = req
      if (assist) {
        const upd = await query(
          `UPDATE request_hub_items SET title = $2, summary = $3, ai_suggestions = $4::jsonb, updated_at = NOW()
           WHERE id = $1 RETURNING *`,
          [req.id, assist.title?.slice(0, 120) || req.title, assist.summary || req.summary, JSON.stringify(assist)]
        )
        if (upd.rows[0]) current = upd.rows[0]
      }
      await dmRequesterConfirmation(current, config)
      await postIntakeCard(current, config)
    } catch (err) {
      console.warn('[request-hub] email intake pipeline failed:', err)
    }
  })()

  return NextResponse.json({ request: { id: req.id, request_number: req.request_number } }, { status: 201 })
}
