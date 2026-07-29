export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import {
  buildImpersonationSession,
  createPortalJWT,
  IMPERSONATION_MAX_AGE_SECONDS,
  PORTAL_COOKIE,
} from '@/lib/portal-auth'

/**
 * Start a "view as customer" session.
 *
 * Admin-only: this hands a staff member the customer's exact view, so it sits
 * above the manager tier that merely administers portal accounts.
 *
 * The staff `token` cookie is left untouched — impersonation only sets
 * `portal_session`, so exiting restores the staff session with no re-login.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const session = await buildImpersonationSession(params.id, {
      userId: auth.userId,
      fullName: auth.fullName,
      email: auth.email,
    })
    if (!session) {
      return NextResponse.json(
        { error: 'That customer account is missing or deactivated — reactivate it first.' },
        { status: 404 }
      )
    }

    const token = await createPortalJWT(session, `${IMPERSONATION_MAX_AGE_SECONDS}s`)

    await query(
      `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
       VALUES ('portal_impersonation_started', 'portal_user', $1, $2, $3::jsonb)`,
      [
        session.portalUserId,
        auth.userId,
        JSON.stringify({
          customer_email: session.email,
          customer_name: session.fullName,
          client_name: session.clientName,
          staff_email: auth.email,
        }),
      ]
    ).catch((err) => console.error('[impersonate] audit write failed:', err))

    const origin = request.headers.get('origin') || `https://${request.headers.get('host')}`
    const response = NextResponse.json({
      ok: true,
      customer_url: `${origin}/customer`,
      viewing_as: {
        fullName: session.fullName,
        email: session.email,
        clientName: session.clientName,
      },
      expires_in_seconds: IMPERSONATION_MAX_AGE_SECONDS,
    })
    response.cookies.set(PORTAL_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: IMPERSONATION_MAX_AGE_SECONDS,
    })
    return response
  } catch (err) {
    console.error('Portal impersonate error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
