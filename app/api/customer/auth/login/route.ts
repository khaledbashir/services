export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { authenticatePortalUser, createPortalJWT, PORTAL_COOKIE } from '@/lib/portal-auth'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const session = await authenticatePortalUser(email, password)
    if (!session) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const token = await createPortalJWT(session)
    const response = NextResponse.json({ user: session })
    response.cookies.set(PORTAL_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 7,
    })
    return response
  } catch (err) {
    console.error('Portal login error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
