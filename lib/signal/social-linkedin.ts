/**
 * LinkedIn native integration for Signal.
 *
 * Replaces the Postiz LinkedIn provider — we own the OAuth, tokens, and the
 * direct call to LinkedIn's UGC posts API.
 *
 * Personal-profile only (`w_member_social`). Company-page posting (LinkedIn
 * Marketing Developer Platform scopes) is out of scope until LinkedIn approves
 * MDP for ANC; this module is forward-compatible — the same provider can grow
 * to add it later.
 */

const LINKEDIN_AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization'
const LINKEDIN_TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken'
const LINKEDIN_USERINFO_URL = 'https://api.linkedin.com/v2/userinfo'
const LINKEDIN_UGC_URL = 'https://api.linkedin.com/v2/ugcPosts'

const SCOPES = ['openid', 'profile', 'w_member_social']

interface LinkedInTokens {
  access_token: string
  expires_in: number
  scope: string
  refresh_token?: string
  refresh_token_expires_in?: number
  token_type: string
}

interface LinkedInUserinfo {
  sub: string // urn:li:person:{id} without the prefix — see LinkedIn docs
  name: string
  email?: string
  picture?: string
}

function clientCreds() {
  const id = process.env.LINKEDIN_CLIENT_ID || ''
  const secret = process.env.LINKEDIN_CLIENT_SECRET || ''
  if (!id || !secret) {
    throw new Error('LINKEDIN_CLIENT_ID + LINKEDIN_CLIENT_SECRET must be set in env')
  }
  return { id, secret }
}

export function getRedirectUri(origin: string) {
  // Use Forwarded host if we're behind a proxy
  return `${origin}/api/marketing/social/callback/linkedin`
}

export function buildAuthorizeUrl(origin: string, state: string): string {
  const { id } = clientCreds()
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: id,
    redirect_uri: getRedirectUri(origin),
    state,
    scope: SCOPES.join(' '),
  })
  return `${LINKEDIN_AUTH_URL}?${params.toString()}`
}

export async function exchangeCodeForToken(origin: string, code: string): Promise<LinkedInTokens> {
  const { id, secret } = clientCreds()
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(origin),
    client_id: id,
    client_secret: secret,
  })
  const res = await fetch(LINKEDIN_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    throw new Error(`LinkedIn token exchange failed: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as LinkedInTokens
}

export async function getUserInfo(accessToken: string): Promise<LinkedInUserinfo> {
  const res = await fetch(LINKEDIN_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) {
    throw new Error(`LinkedIn userinfo failed: ${res.status} ${await res.text()}`)
  }
  return (await res.json()) as LinkedInUserinfo
}

export async function postToLinkedIn(opts: {
  accessToken: string
  authorUrn: string
  text: string
}): Promise<{ id: string; raw: unknown }> {
  const body = {
    author: opts.authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: opts.text },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  }
  const res = await fetch(LINKEDIN_UGC_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(body),
  })
  const raw = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(`LinkedIn post failed: ${res.status} ${JSON.stringify(raw)}`)
  }
  const id = (raw as { id?: string }).id || ''
  return { id, raw }
}

export function tokenLifetimeToExpiresAt(expiresInSeconds: number): Date {
  return new Date(Date.now() + expiresInSeconds * 1000)
}

export function authorUrnFromUserinfo(u: LinkedInUserinfo): string {
  // LinkedIn's `sub` claim is the member id; the post API requires the full
  // URN form for authoring.
  return u.sub.startsWith('urn:li:') ? u.sub : `urn:li:person:${u.sub}`
}
