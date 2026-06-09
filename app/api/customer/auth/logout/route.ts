export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { PORTAL_COOKIE } from '@/lib/portal-auth'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(PORTAL_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return response
}
