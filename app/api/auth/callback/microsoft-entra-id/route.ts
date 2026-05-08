import { NextRequest, NextResponse } from 'next/server'
import { createJWT } from '@/lib/auth'
import {
  assertAllowedEmail,
  emailFromClaims,
  findActiveStaffByEmail,
  getMicrosoftConfig,
  getMicrosoftDiscovery,
  microsoftCookieNames,
  microsoftRedirectUri,
  verifyMicrosoftIdToken,
} from '@/lib/microsoft-sso'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function loginRedirect(request: NextRequest, reason: string) {
  const url = new URL('/login', request.url)
  url.searchParams.set('error', reason)
  return NextResponse.redirect(url)
}

function clearOauthCookies(response: NextResponse) {
  response.cookies.delete(microsoftCookieNames.state)
  response.cookies.delete(microsoftCookieNames.verifier)
  response.cookies.delete(microsoftCookieNames.redirect)
}

export async function GET(request: NextRequest) {
  const error = request.nextUrl.searchParams.get('error')
  if (error) return loginRedirect(request, error)

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const expectedState = request.cookies.get(microsoftCookieNames.state)?.value
  const verifier = request.cookies.get(microsoftCookieNames.verifier)?.value
  const redirect = request.cookies.get(microsoftCookieNames.redirect)?.value || '/dashboard'

  if (!code || !state || !expectedState || state !== expectedState || !verifier) {
    return loginRedirect(request, 'microsoft_state')
  }

  try {
    const config = getMicrosoftConfig()
    const discovery = await getMicrosoftDiscovery(config.issuer)
    const redirectUri = microsoftRedirectUri(request)

    const body = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code_verifier: verifier,
    })

    const tokenRes = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    })

    const tokens = await tokenRes.json()
    if (!tokenRes.ok || !tokens.id_token) {
      console.error('[Microsoft SSO callback] token exchange failed:', tokens)
      return loginRedirect(request, 'microsoft_token')
    }

    const claims = await verifyMicrosoftIdToken(tokens.id_token, discovery, config.clientId)
    const email = emailFromClaims(claims)
    assertAllowedEmail(email, config.allowedDomains)

    const staff = await findActiveStaffByEmail(email)
    if (!staff) return loginRedirect(request, 'microsoft_no_staff')

    const token = await createJWT(staff)
    const completeUrl = new URL('/login/sso-complete', request.url)
    completeUrl.searchParams.set('redirect', redirect)

    const response = NextResponse.redirect(completeUrl)
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24,
    })
    clearOauthCookies(response)

    return response
  } catch (err) {
    console.error('[Microsoft SSO callback] error:', err)
    return loginRedirect(request, 'microsoft_callback')
  }
}
