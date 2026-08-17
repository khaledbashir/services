export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { generateInviteToken } from '@/lib/portal-auth'
import { sendPortalPasswordResetEmail } from '@/lib/email'

/**
 * Self-serve password reset for the customer portal (Charlie 2026-08-17).
 *
 * Before this, a customer who forgot their password had to reach someone at ANC
 * to re-send their invite by hand. This issues the same kind of one-time token
 * the invite flow already uses, so /customer/invite/[token] can consume it —
 * one code path for setting a portal password, not two.
 *
 * The response is deliberately identical whether or not the address matches an
 * account: a differing response would turn this endpoint into a way to discover
 * which of a client's staff have portal access.
 */

/** Shorter than the 14-day invite — a reset is answered in a sitting. */
const RESET_TOKEN_HOURS = 2

/** One reset email per account per this window. */
const RESET_THROTTLE_MINUTES = 5

const GENERIC_RESPONSE = {
  ok: true,
  message: 'If that email has portal access, a reset link is on its way.',
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const userResult = await query(
      `SELECT pu.id, pu.email, pu.full_name, pu.last_password_reset_requested_at, c.name AS client_name
       FROM portal_users pu
       LEFT JOIN clients c ON c.id = pu.client_id
       WHERE LOWER(pu.email) = $1 AND pu.is_active = true`,
      [email]
    )
    const user = userResult.rows[0]
    if (!user) {
      console.log(`[portal-reset] No active portal account for ${email} — responding generically`)
      return NextResponse.json(GENERIC_RESPONSE)
    }

    const lastRequested = user.last_password_reset_requested_at
      ? new Date(user.last_password_reset_requested_at).getTime()
      : 0
    if (Date.now() - lastRequested < RESET_THROTTLE_MINUTES * 60_000) {
      console.log(`[portal-reset] Throttled repeat request for ${email}`)
      return NextResponse.json(GENERIC_RESPONSE)
    }

    // Issuing a new token invalidates any previous one, so a reset link that
    // was mailed and then re-requested cannot be used twice.
    const token = generateInviteToken()
    await query(
      `UPDATE portal_users
       SET invite_token = $2,
           invite_expires_at = NOW() + ($3 || ' hours')::interval,
           invite_purpose = 'reset',
           last_password_reset_requested_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [user.id, token, String(RESET_TOKEN_HOURS)]
    )

    const origin = request.headers.get('origin') || `https://${request.headers.get('host')}`
    const resetUrl = `${origin}/customer/invite/${token}`

    try {
      const sent = await sendPortalPasswordResetEmail({
        to: user.email,
        fullName: user.full_name,
        clientName: user.client_name,
        resetUrl,
        expiresInHours: RESET_TOKEN_HOURS,
      })
      if (!sent) console.error(`[portal-reset] Reset email not accepted for ${user.email}`)
    } catch (error) {
      // The token is already stored; a mail failure must not tell the caller
      // whether the account exists.
      console.error(`[portal-reset] Reset email failed for ${user.email}:`, error)
    }

    return NextResponse.json(GENERIC_RESPONSE)
  } catch (err) {
    console.error('Portal password reset error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
