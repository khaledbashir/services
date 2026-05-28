export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import {
  exchangeCodeForToken,
  getUserInfo,
  tokenLifetimeToExpiresAt,
  authorUrnFromUserinfo,
} from '@/lib/signal/social-linkedin'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const linkedinError = request.nextUrl.searchParams.get('error')

  if (linkedinError) {
    return NextResponse.redirect(
      `${request.nextUrl.origin}/marketing/settings?social_error=${encodeURIComponent(linkedinError)}`,
    )
  }
  if (!code || !state) {
    return NextResponse.redirect(
      `${request.nextUrl.origin}/marketing/settings?social_error=missing_code_or_state`,
    )
  }

  // Validate state
  const stateRow = await query(
    `SELECT platform, return_to FROM marketing_social_oauth_state WHERE state = $1`,
    [state],
  )
  if (stateRow.rows.length === 0) {
    return NextResponse.redirect(
      `${request.nextUrl.origin}/marketing/settings?social_error=invalid_state`,
    )
  }
  await query(`DELETE FROM marketing_social_oauth_state WHERE state = $1`, [state])

  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https'
  const forwardedHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const origin = `${forwardedProto}://${forwardedHost}`

  try {
    const tokens = await exchangeCodeForToken(origin, code)
    const userinfo = await getUserInfo(tokens.access_token)
    const authorUrn = authorUrnFromUserinfo(userinfo)
    const expiresAt = tokenLifetimeToExpiresAt(tokens.expires_in)

    await query(
      `INSERT INTO marketing_social_accounts
         (platform, account_label, external_id, external_urn, access_token, refresh_token, expires_at, scopes, metadata, connected_at)
       VALUES ('linkedin', $1, $2, $3, $4, $5, $6, $7, $8, NOW())
       ON CONFLICT (platform, external_id)
       DO UPDATE SET access_token = EXCLUDED.access_token,
                     refresh_token = EXCLUDED.refresh_token,
                     expires_at = EXCLUDED.expires_at,
                     scopes = EXCLUDED.scopes,
                     metadata = marketing_social_accounts.metadata || EXCLUDED.metadata,
                     last_refreshed_at = NOW(),
                     revoked_at = NULL,
                     updated_at = NOW()`,
      [
        userinfo.name || userinfo.email || 'LinkedIn Account',
        userinfo.sub,
        authorUrn,
        tokens.access_token,
        tokens.refresh_token || null,
        expiresAt.toISOString(),
        tokens.scope ? tokens.scope.split(' ') : [],
        JSON.stringify({
          email: userinfo.email,
          picture: userinfo.picture,
          tokenType: tokens.token_type,
        }),
      ],
    )

    const returnTo = (stateRow.rows[0] as { return_to: string }).return_to || '/marketing/settings'
    return NextResponse.redirect(`${request.nextUrl.origin}${returnTo}?social_connected=linkedin`)
  } catch (err) {
    console.error('[linkedin callback]', err)
    return NextResponse.redirect(
      `${request.nextUrl.origin}/marketing/settings?social_error=${encodeURIComponent(String(err))}`,
    )
  }
}
