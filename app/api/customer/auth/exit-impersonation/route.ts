export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getPortalSession, PORTAL_COOKIE } from '@/lib/portal-auth'

/**
 * End a "view as customer" session.
 *
 * Only clears `portal_session`; the staff `token` cookie was never touched by
 * impersonation, so the admin lands back in the dashboard already signed in.
 */
export async function POST() {
  const session = await getPortalSession()

  if (session?.impersonating && session.impersonatorStaffId) {
    await query(
      `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
       VALUES ('portal_impersonation_ended', 'portal_user', $1, $2, $3::jsonb)`,
      [
        session.portalUserId,
        session.impersonatorStaffId,
        JSON.stringify({
          customer_email: session.email,
          customer_name: session.fullName,
          client_name: session.clientName,
          staff_email: session.impersonatorEmail,
        }),
      ]
    ).catch((err) => console.error('[impersonate] exit audit write failed:', err))
  }

  const response = NextResponse.json({ ok: true, redirect: '/admin/portal-users' })
  response.cookies.set(PORTAL_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return response
}
