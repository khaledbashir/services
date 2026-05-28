export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { query } from '@/lib/db'
import { buildAuthorizeUrl } from '@/lib/signal/social-linkedin'

export async function GET(request: NextRequest) {
  const state = randomBytes(24).toString('hex')
  const returnTo = request.nextUrl.searchParams.get('returnTo') || '/marketing/settings'

  await query(
    `INSERT INTO marketing_social_oauth_state (state, platform, return_to)
     VALUES ($1, $2, $3)`,
    [state, 'linkedin', returnTo],
  )

  // Compute origin from the incoming request — handles HTTPS reverse proxy.
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const origin = `${forwardedProto}://${forwardedHost}`

  try {
    const url = buildAuthorizeUrl(origin, state)
    return NextResponse.redirect(url, { status: 302 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
