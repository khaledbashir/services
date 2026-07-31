import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { query } from './db'
import {
  normalizeCustomerPortalTabs,
  type CustomerPortalTabKey,
} from './customer-portal-tabs'
import { scopePortalVenueIds } from './customer-portal-scope'

// Customer-portal sessions live in their own cookie with their own audience
// claim so a customer token can never authenticate against staff routes
// (and vice versa), even though both sign with the same server secret.
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'your-secret-key-change-in-production')
const PORTAL_AUDIENCE = 'anc-customer-portal'
export const PORTAL_COOKIE = 'portal_session'

// Impersonation sessions are deliberately short-lived. A staff member is
// "looking at" the portal, not living in it — an hour is plenty and it means
// a forgotten tab stops acting as the customer on its own.
export const IMPERSONATION_MAX_AGE_SECONDS = 60 * 60

export interface PortalSession {
  portalUserId: string
  email: string
  fullName: string
  clientId: string | null
  clientName: string | null
  visibleTabs: CustomerPortalTabKey[]
  /** Set only on impersonation sessions minted by staff — never on a real login. */
  impersonating?: true
  impersonatorStaffId?: string
  impersonatorName?: string
  impersonatorEmail?: string
  [key: string]: any
}

export async function createPortalJWT(
  payload: PortalSession,
  expiresIn: string = '7d'
): Promise<string> {
  return new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(PORTAL_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET)
}

export async function verifyPortalJWT(token: string): Promise<PortalSession | null> {
  try {
    const verified = await jwtVerify(token, JWT_SECRET, { audience: PORTAL_AUDIENCE })
    return verified.payload as unknown as PortalSession
  } catch {
    return null
  }
}

export async function getPortalSession(): Promise<PortalSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(PORTAL_COOKIE)?.value
  if (!token) return null
  const session = await verifyPortalJWT(token)
  if (!session) return null

  // Sessions outlive admin actions (deactivation, client reassignment) by up
  // to 7 days unless re-checked — so re-check on every request.
  const result = await query(
    `SELECT pu.id, pu.is_active, pu.email, pu.full_name, pu.client_id, pu.visible_tabs,
            c.name AS client_name
     FROM portal_users pu
     LEFT JOIN clients c ON c.id = pu.client_id
     WHERE pu.id = $1`,
    [session.portalUserId]
  )
  if (result.rows.length === 0 || !result.rows[0].is_active) return null
  const current = result.rows[0]
  session.email = current.email
  session.fullName = current.full_name
  session.clientId = current.client_id
  session.clientName = current.client_name
  session.visibleTabs = normalizeCustomerPortalTabs(current.visible_tabs)
  return session
}

export async function authenticatePortalUser(email: string, password: string): Promise<PortalSession | null> {
  const result = await query(
    `SELECT pu.id, pu.email, pu.full_name, pu.password_hash, pu.client_id, pu.visible_tabs,
            c.name AS client_name
     FROM portal_users pu
     LEFT JOIN clients c ON c.id = pu.client_id
     WHERE LOWER(pu.email) = LOWER($1) AND pu.is_active = true`,
    [email]
  )
  if (result.rows.length === 0) return null
  const user = result.rows[0]
  if (!user.password_hash) return null

  const ok = await bcrypt.compare(password, user.password_hash)
  if (!ok) return null

  await query('UPDATE portal_users SET last_login_at = NOW() WHERE id = $1', [user.id])

  return {
    portalUserId: user.id,
    email: user.email,
    fullName: user.full_name,
    clientId: user.client_id,
    clientName: user.client_name,
    visibleTabs: normalizeCustomerPortalTabs(user.visible_tabs),
  }
}

/**
 * Build a portal session for a customer WITHOUT their password, on behalf of a
 * staff member ("view as"). The impersonation claims are inside the signed JWT
 * so they cannot be stripped or forged client-side, and every consumer of
 * getPortalSession() sees exactly what the customer would see.
 *
 * Returns null when the account can't be viewed (missing or deactivated) so the
 * caller can say why instead of minting a session that getPortalSession()
 * would reject on the next request anyway.
 */
export async function buildImpersonationSession(
  portalUserId: string,
  staff: { userId: string; fullName: string; email: string }
): Promise<PortalSession | null> {
  const result = await query(
    `SELECT pu.id, pu.email, pu.full_name, pu.client_id, pu.is_active, pu.visible_tabs,
            c.name AS client_name
     FROM portal_users pu
     LEFT JOIN clients c ON c.id = pu.client_id
     WHERE pu.id = $1`,
    [portalUserId]
  )
  if (result.rows.length === 0) return null
  const user = result.rows[0]
  if (!user.is_active) return null

  return {
    portalUserId: user.id,
    email: user.email,
    fullName: user.full_name,
    clientId: user.client_id,
    clientName: user.client_name,
    visibleTabs: normalizeCustomerPortalTabs(user.visible_tabs),
    impersonating: true,
    impersonatorStaffId: staff.userId,
    impersonatorName: staff.fullName,
    impersonatorEmail: staff.email,
  }
}

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

/**
 * Direct venue grants are the authoritative per-user scope. Accounts created
 * before direct grants existed retain their client venue scope until staff
 * edits them, which writes an explicit set. An empty result always means no
 * access, never all access.
 */
export async function getPortalUserVenueIds(session: PortalSession): Promise<string[]> {
  const direct = await query(
    `SELECT venue_id
     FROM portal_user_venues
     WHERE portal_user_id = $1
     ORDER BY created_at, venue_id`,
    [session.portalUserId]
  )
  if (direct.rows.length > 0) {
    return direct.rows.map((row: { venue_id: string }) => row.venue_id)
  }
  if (!session.clientId) return []

  const legacyClientScope = await query(
    `SELECT venue_id
     FROM client_venues
     WHERE client_id = $1
     ORDER BY created_at, venue_id`,
    [session.clientId]
  )
  return legacyClientScope.rows.map((row: { venue_id: string }) => row.venue_id)
}

/**
 * Resolve the venue scope selected in the customer-portal shell without ever
 * widening beyond the customer's grants. `all`, an empty value, and a missing
 * value retain the complete authorized scope; an unknown venue produces an
 * empty scope so callers cannot probe another customer's records.
 */
export async function getScopedPortalVenueIds(
  session: PortalSession,
  requestedVenueId?: string | null
): Promise<string[]> {
  const venueIds = await getPortalUserVenueIds(session)
  return scopePortalVenueIds(venueIds, requestedVenueId)
}
