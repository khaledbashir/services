export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { query } from '@/lib/db'
import {
  PORTAL_COOKIE,
  createPortalJWT,
  getPortalSession,
  hashPassword,
} from '@/lib/portal-auth'
import {
  PortalAccountValidationError,
  planPortalAccountUpdate,
} from '@/lib/portal-account-settings'

export async function PATCH(request: NextRequest) {
  try {
    const session = await getPortalSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Staff viewing a customer's portal must never be able to change that
    // customer's name or password from inside the impersonated session.
    if (session.impersonating) {
      return NextResponse.json(
        { error: 'Account settings cannot be changed while viewing as a customer.' },
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))

    let plan
    try {
      plan = planPortalAccountUpdate(body, session.fullName || '')
    } catch (error) {
      if (error instanceof PortalAccountValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
      throw error
    }

    if (plan.password) {
      const stored = await query(
        'SELECT password_hash FROM portal_users WHERE id = $1 AND is_active = true',
        [session.portalUserId]
      )
      const hash = stored.rows[0]?.password_hash
      if (!hash) {
        return NextResponse.json(
          { error: 'Set a password from your invitation link before changing it.' },
          { status: 400 }
        )
      }
      const matches = await bcrypt.compare(plan.password.current, hash)
      if (!matches) {
        return NextResponse.json({ error: 'Your current password is incorrect.' }, { status: 400 })
      }
    }

    const sets: string[] = ['updated_at = NOW()']
    const params: any[] = [session.portalUserId]
    if (plan.fullName) {
      params.push(plan.fullName)
      sets.push(`full_name = $${params.length}`)
    }
    if (plan.password) {
      params.push(await hashPassword(plan.password.next))
      sets.push(`password_hash = $${params.length}`)
    }

    const updated = await query(
      `UPDATE portal_users SET ${sets.join(', ')} WHERE id = $1 RETURNING full_name`,
      params
    )
    if (updated.rows.length === 0) {
      return NextResponse.json({ error: 'Account not found.' }, { status: 404 })
    }

    const response = NextResponse.json({
      ok: true,
      full_name: updated.rows[0].full_name,
      name_changed: Boolean(plan.fullName),
      password_changed: Boolean(plan.password),
    })

    // The display name lives in the signed session, so a rename only shows up
    // after the cookie is reminted — otherwise the sidebar keeps the old name
    // until the customer signs out and back in.
    if (plan.fullName) {
      const token = await createPortalJWT({ ...session, fullName: updated.rows[0].full_name })
      response.cookies.set(PORTAL_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 7,
      })
    }

    return response
  } catch (err) {
    console.error('Portal account update error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
