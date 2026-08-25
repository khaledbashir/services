export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'
import { normalizePhone, formatPhone, phoneDecision } from '@/lib/venue-reference'

/**
 * "Has this number called about a venue before?"
 *
 * One match sends the tech straight there. Two or more means the number has
 * called about several buildings — a travelling tech, a shared support line —
 * and the dashboard asks rather than guessing, because silently filing a
 * ticket against the wrong venue is worse than one extra click.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (isAuthError(auth)) return auth

    const raw = request.nextUrl.searchParams.get('phone')
    const key = normalizePhone(raw)
    if (!key) {
      // "Unknown" is what the phone system sends when it has no caller ID, and
      // it arrives on roughly a third of voicemails. Not an error — just nothing
      // to match on.
      return NextResponse.json({ action: 'none', options: [], phone: null })
    }

    const result = await query(
      `SELECT vpn.venue_id, vpn.call_count, vpn.last_seen_at, vpn.origin,
              vpn.caller_name, v.name AS venue_name
         FROM venue_phone_numbers vpn
         JOIN venues v ON v.id = vpn.venue_id
        WHERE vpn.phone = $1`,
      [key],
    )

    const decision = phoneDecision(result.rows as any[])
    return NextResponse.json({
      phone: key,
      phone_display: formatPhone(key),
      action: decision.action,
      venue: decision.venue || null,
      options: decision.options,
    })
  } catch (err) {
    console.error('Error looking up phone:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Link a number to a venue, or unlink one that was wrong.
 *
 * Steve's "this isn't for [venue]" flag is the unlink; adding a second venue
 * to the same number is just another link, which is why the table is a
 * many-to-many rather than a column on the venue.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request)
    if (isAuthError(auth)) return auth

    const body = await request.json().catch(() => ({}))
    const key = normalizePhone(body.phone)
    const venueId = String(body.venue_id || '')
    const unlink = body.unlink === true

    if (!key) return NextResponse.json({ error: 'A usable phone number is required' }, { status: 400 })
    if (!venueId) return NextResponse.json({ error: 'venue_id is required' }, { status: 400 })

    if (unlink) {
      await query(`DELETE FROM venue_phone_numbers WHERE phone = $1 AND venue_id = $2`, [key, venueId])
      return NextResponse.json({ ok: true, unlinked: true })
    }

    // A human confirming a link promotes a backfilled guess to confirmed and
    // never demotes one that was already confirmed.
    const result = await query(
      `INSERT INTO venue_phone_numbers (phone, venue_id, caller_name, origin, confirmed_by, confirmed_at)
       VALUES ($1,$2,$3,'confirmed',$4,NOW())
       ON CONFLICT (phone, venue_id) DO UPDATE
          SET origin = 'confirmed',
              confirmed_by = EXCLUDED.confirmed_by,
              confirmed_at = NOW(),
              caller_name = COALESCE(EXCLUDED.caller_name, venue_phone_numbers.caller_name),
              call_count = venue_phone_numbers.call_count + 1,
              last_seen_at = NOW()
       RETURNING *`,
      [key, venueId, body.caller_name || null, auth.userId],
    )
    return NextResponse.json({ ok: true, link: result.rows[0] })
  } catch (err) {
    console.error('Error linking phone to venue:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
