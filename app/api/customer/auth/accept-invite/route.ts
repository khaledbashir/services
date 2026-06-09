export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { hashPassword, createPortalJWT, PORTAL_COOKIE } from '@/lib/portal-auth'

// GET — validate an invite token so the page can greet the user by name
export async function GET(request: NextRequest) {
  try {
    const token = new URL(request.url).searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

    const result = await query(
      `SELECT pu.email, pu.full_name, c.name AS client_name
       FROM portal_users pu
       LEFT JOIN clients c ON c.id = pu.client_id
       WHERE pu.invite_token = $1
         AND pu.is_active = true
         AND (pu.invite_expires_at IS NULL OR pu.invite_expires_at > NOW())`,
      [token]
    )
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 })
    }
    return NextResponse.json({ invite: result.rows[0] })
  } catch (err) {
    console.error('Invite lookup error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST — set password, consume the invite, log the user straight in
export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json()
    if (!token || !password) {
      return NextResponse.json({ error: 'Token and password are required' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const passwordHash = await hashPassword(password)
    const result = await query(
      `UPDATE portal_users
       SET password_hash = $1, invite_token = NULL, invite_expires_at = NULL, updated_at = NOW()
       WHERE invite_token = $2
         AND is_active = true
         AND (invite_expires_at IS NULL OR invite_expires_at > NOW())
       RETURNING id, email, full_name, client_id`,
      [passwordHash, token]
    )
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Invalid or expired invite' }, { status: 404 })
    }

    const user = result.rows[0]
    const clientResult = user.client_id
      ? await query('SELECT name FROM clients WHERE id = $1', [user.client_id])
      : { rows: [] as { name: string }[] }

    const session = {
      portalUserId: user.id,
      email: user.email,
      fullName: user.full_name,
      clientId: user.client_id,
      clientName: clientResult.rows[0]?.name || null,
    }
    const jwt = await createPortalJWT(session)
    const response = NextResponse.json({ user: session })
    response.cookies.set(PORTAL_COOKIE, jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })
    return response
  } catch (err) {
    console.error('Accept invite error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
