import { createHash, randomBytes } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { query } from './db'

const STATE_COOKIE = 'anc_ms_oauth_state'
const VERIFIER_COOKIE = 'anc_ms_oauth_verifier'
const REDIRECT_COOKIE = 'anc_ms_oauth_redirect'

export interface MicrosoftDiscovery {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  jwks_uri: string
}

export interface MicrosoftConfig {
  clientId: string
  clientSecret: string
  issuer: string
  allowedDomains: string[]
}

export interface StaffIdentity {
  userId: string
  email: string
  fullName: string
  role: string
}

export const microsoftCookieNames = {
  state: STATE_COOKIE,
  verifier: VERIFIER_COOKIE,
  redirect: REDIRECT_COOKIE,
}

export function getMicrosoftConfig(): MicrosoftConfig {
  const clientId =
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID ||
    process.env.AUTH_MICROSOFT_CLIENT_ID ||
    ''
  const clientSecret =
    process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET ||
    process.env.AUTH_MICROSOFT_CLIENT_SECRET ||
    ''
  const issuer =
    process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER ||
    process.env.AUTH_MICROSOFT_ISSUER ||
    ''

  if (!clientId || !clientSecret || !issuer) {
    throw new Error('Microsoft Entra SSO is missing client id, secret, or tenant issuer.')
  }

  const allowedDomains = (process.env.AUTH_MICROSOFT_ALLOWED_DOMAINS || 'anc.com')
    .split(',')
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean)

  return {
    clientId,
    clientSecret,
    issuer: issuer.replace(/\/?$/, '/'),
    allowedDomains,
  }
}

export async function getMicrosoftDiscovery(issuer: string): Promise<MicrosoftDiscovery> {
  const res = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`, {
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Microsoft discovery failed with ${res.status}`)
  const discovery = await res.json()
  const tenantId = issuer.match(/microsoftonline\.com\/([^/]+)\/v2\.0/i)?.[1]
  if (tenantId && typeof discovery.issuer === 'string') {
    discovery.issuer = discovery.issuer.replace('{tenantid}', tenantId)
  }
  return discovery
}

export function microsoftRedirectUri(request: Request): string {
  return (
    process.env.AUTH_MICROSOFT_ENTRA_ID_CALLBACK_URL ||
    process.env.AUTH_MICROSOFT_CALLBACK_URL ||
    `${new URL(request.url).origin}/api/auth/callback/microsoft-entra-id`
  )
}

export function safeRedirectPath(raw: string | null): string {
  if (!raw) return '/dashboard'
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/dashboard'
  if (raw.startsWith('/login')) return '/dashboard'
  return raw
}

export function makeOauthState() {
  const state = randomBytes(24).toString('base64url')
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { state, verifier, challenge }
}

export function emailFromClaims(claims: Record<string, unknown>): string {
  const raw =
    claims.email ||
    claims.preferred_username ||
    claims.upn ||
    claims.unique_name
  return typeof raw === 'string' ? raw.trim().toLowerCase() : ''
}

export function assertAllowedEmail(email: string, allowedDomains: string[]) {
  const domain = email.split('@')[1] || ''
  if (!email || !allowedDomains.includes(domain)) {
    throw new Error('This Microsoft account is not allowed for ANC Services.')
  }
}

export async function verifyMicrosoftIdToken(
  idToken: string,
  discovery: MicrosoftDiscovery,
  clientId: string,
) {
  const jwks = createRemoteJWKSet(new URL(discovery.jwks_uri))
  const verified = await jwtVerify(idToken, jwks, {
    issuer: discovery.issuer,
    audience: clientId,
  })
  return verified.payload as Record<string, unknown>
}

export async function findActiveStaffByEmail(email: string): Promise<StaffIdentity | null> {
  const result = await query(
    'SELECT id, full_name, email, role FROM staff WHERE LOWER(email) = LOWER($1) AND is_active = true LIMIT 1',
    [email],
  )

  if (result.rows.length === 0) return null
  const user = result.rows[0]

  return {
    userId: String(user.id),
    email: String(user.email),
    fullName: String(user.full_name || user.email),
    role: String(user.role),
  }
}
