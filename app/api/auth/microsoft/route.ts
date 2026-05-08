import { NextRequest, NextResponse } from 'next/server'
import {
  getMicrosoftConfig,
  getMicrosoftDiscovery,
  makeOauthState,
  microsoftCookieNames,
  microsoftRedirectUri,
  safeRedirectPath,
} from '@/lib/microsoft-sso'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  try {
    const config = getMicrosoftConfig()
    const discovery = await getMicrosoftDiscovery(config.issuer)
    const redirect = safeRedirectPath(request.nextUrl.searchParams.get('redirect'))
    const { state, verifier, challenge } = makeOauthState()
    const redirectUri = microsoftRedirectUri(request)

    const authorizeUrl = new URL(discovery.authorization_endpoint)
    authorizeUrl.searchParams.set('client_id', config.clientId)
    authorizeUrl.searchParams.set('response_type', 'code')
    authorizeUrl.searchParams.set('redirect_uri', redirectUri)
    authorizeUrl.searchParams.set('response_mode', 'query')
    authorizeUrl.searchParams.set('scope', 'openid profile email User.Read')
    authorizeUrl.searchParams.set('state', state)
    authorizeUrl.searchParams.set('code_challenge', challenge)
    authorizeUrl.searchParams.set('code_challenge_method', 'S256')

    const response = NextResponse.redirect(authorizeUrl)
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 10 * 60,
    }

    response.cookies.set(microsoftCookieNames.state, state, cookieOptions)
    response.cookies.set(microsoftCookieNames.verifier, verifier, cookieOptions)
    response.cookies.set(microsoftCookieNames.redirect, redirect, cookieOptions)

    return response
  } catch (err) {
    console.error('[Microsoft SSO start] error:', err)
    const url = new URL('/login', request.url)
    url.searchParams.set('error', 'microsoft_config')
    return NextResponse.redirect(url)
  }
}
