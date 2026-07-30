export const dynamic = 'force-dynamic'
export const revalidate = 0

import type { PoolClient } from 'pg'
import { NextRequest, NextResponse } from 'next/server'
import { getClient, query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { generateInviteToken } from '@/lib/portal-auth'
import { sendPortalInviteEmail } from '@/lib/email'
import {
  DEFAULT_CUSTOMER_PORTAL_TABS,
  normalizeCustomerPortalTabs,
} from '@/lib/customer-portal-tabs'

interface PortalContactInput {
  full_name: string
  email: string
}

const EMAIL_ADDRESS_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i

function isValidEmailAddress(email: string): boolean {
  if (email.length > 254) return false
  const [localPart] = email.split('@')
  return Boolean(localPart)
    && localPart.length <= 64
    && !localPart.startsWith('.')
    && !localPart.endsWith('.')
    && !localPart.includes('..')
    && EMAIL_ADDRESS_PATTERN.test(email)
}

function cleanVenueIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(
    value
      .filter((id): id is string => typeof id === 'string')
      .map((id) => id.trim())
      .filter(Boolean)
  )]
}

function cleanContacts(body: any): PortalContactInput[] {
  const source = Array.isArray(body.contacts)
    ? body.contacts
    : body.email || body.full_name
      ? [{ email: body.email, full_name: body.full_name }]
      : []

  const contacts: PortalContactInput[] = source.map((contact: any) => ({
    full_name: typeof contact?.full_name === 'string' ? contact.full_name.trim() : '',
    email: typeof contact?.email === 'string' ? contact.email.trim().toLowerCase() : '',
  }))
  const uniqueEmails = new Set(contacts.map((contact) => contact.email))
  if (contacts.some((contact) => !contact.full_name || !contact.email)) {
    throw new Error('CONTACT_REQUIRED')
  }
  if (contacts.some((contact) => !isValidEmailAddress(contact.email))) {
    throw new Error('CONTACT_EMAIL_INVALID')
  }
  if (uniqueEmails.size !== contacts.length) {
    throw new Error('CONTACT_DUPLICATE')
  }
  return contacts
}

function cleanVisibleTabs(value: unknown, useDefault = true): string[] {
  const tabs = value === undefined && useDefault
    ? [...DEFAULT_CUSTOMER_PORTAL_TABS]
    : normalizeCustomerPortalTabs(value)
  if (tabs.length === 0) throw new Error('TAB_REQUIRED')
  return tabs
}

async function validateActiveVenues(client: PoolClient, venueIds: string[]) {
  if (venueIds.length === 0) throw new Error('VENUE_REQUIRED')

  const venueCheck = await client.query(
    `SELECT COUNT(*)::int AS count
     FROM venues
     WHERE id = ANY($1::uuid[]) AND COALESCE(is_active, true) = true`,
    [venueIds]
  )
  if (Number(venueCheck.rows[0]?.count) !== venueIds.length) {
    throw new Error('VENUE_INVALID')
  }
}

async function resolveExistingClientForVenues(client: PoolClient, venueIds: string[]) {
  await validateActiveVenues(client, venueIds)

  const clientResult = await client.query(
    `SELECT c.id, c.name
     FROM clients c
     JOIN client_venues cv ON cv.client_id = c.id
     WHERE cv.venue_id = ANY($1::uuid[])
       AND COALESCE(c.is_active, true) = true
     GROUP BY c.id, c.name
     HAVING COUNT(DISTINCT cv.venue_id) = $2
     ORDER BY c.name`,
    [venueIds, venueIds.length]
  )
  if (clientResult.rows.length === 0) throw new Error('CLIENT_NOT_FOUND')
  if (clientResult.rows.length > 1) throw new Error('CLIENT_AMBIGUOUS')
  return clientResult.rows[0] as { id: string; name: string }
}

async function replaceVenueGrants(client: PoolClient, portalUserId: string, venueIds: string[]) {
  await client.query('DELETE FROM portal_user_venues WHERE portal_user_id = $1', [portalUserId])
  if (venueIds.length === 0) return
  await client.query(
    `INSERT INTO portal_user_venues (portal_user_id, venue_id)
     SELECT $1, UNNEST($2::uuid[])`,
    [portalUserId, venueIds]
  )
}

function requestError(error: unknown): NextResponse | null {
  if (!(error instanceof Error)) return null
  const errors: Record<string, [string, number]> = {
    CONTACT_REQUIRED: ['Every customer needs a name and email address.', 400],
    CONTACT_EMAIL_INVALID: ['Enter a valid email address for every customer.', 400],
    CONTACT_DUPLICATE: ['Each customer email may only be added once.', 400],
    TAB_REQUIRED: ['Select at least one visible portal tab.', 400],
    VENUE_REQUIRED: ['Select at least one venue.', 400],
    VENUE_INVALID: ['One or more selected venues are missing or deactivated.', 400],
    CLIENT_NOT_FOUND: ['The selected venues are not attached to an existing active client.', 400],
    CLIENT_AMBIGUOUS: ['The selected venues match more than one client. Correct the venue-to-client links before creating access.', 409],
  }
  const mapped = errors[error.message]
  return mapped ? NextResponse.json({ error: mapped[0] }, { status: mapped[1] }) : null
}

function originFor(request: NextRequest): string {
  return request.headers.get('origin') || `https://${request.headers.get('host')}`
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const result = await query(
      `SELECT pu.id, pu.email, pu.full_name, pu.client_id, pu.is_active,
              pu.invite_token, pu.invite_expires_at, pu.last_login_at, pu.created_at,
              pu.visible_tabs,
              (pu.password_hash IS NOT NULL) AS has_password,
              c.name AS client_name,
              CASE
                WHEN direct_scope.venue_count > 0 THEN direct_scope.venue_count
                ELSE client_scope.venue_count
              END AS venue_count,
              CASE
                WHEN direct_scope.venue_count > 0 THEN direct_scope.venue_ids
                ELSE client_scope.venue_ids
              END AS venue_ids
       FROM portal_users pu
       LEFT JOIN clients c ON c.id = pu.client_id
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS venue_count,
                COALESCE(ARRAY_AGG(puv.venue_id ORDER BY v.name), '{}') AS venue_ids
         FROM portal_user_venues puv
         JOIN venues v ON v.id = puv.venue_id
         WHERE puv.portal_user_id = pu.id
       ) direct_scope ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS venue_count,
                COALESCE(ARRAY_AGG(cv.venue_id ORDER BY v.name), '{}') AS venue_ids
         FROM client_venues cv
         JOIN venues v ON v.id = cv.venue_id
         WHERE cv.client_id = pu.client_id
       ) client_scope ON TRUE
       ORDER BY pu.created_at DESC`
    )
    return NextResponse.json({
      users: result.rows.map((user) => ({
        ...user,
        venue_count: Number(user.venue_count) || 0,
        venue_ids: user.venue_ids || [],
        visible_tabs: normalizeCustomerPortalTabs(user.visible_tabs),
      })),
    })
  } catch (err) {
    console.error('Customer users list error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    let contacts: PortalContactInput[]
    let venueIds: string[]
    let visibleTabs: string[]
    try {
      contacts = cleanContacts(body)
      venueIds = cleanVenueIds(body.linked_venue_ids)
      visibleTabs = cleanVisibleTabs(body.visible_tabs)
      if (contacts.length === 0) throw new Error('CONTACT_REQUIRED')
    } catch (error) {
      return requestError(error) || NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const client = await getClient()
    const createdUsers: Array<{
      id: string
      email: string
      full_name: string
      client_id: string
      invite_token: string
    }> = []
    let existingClient: { id: string; name: string }

    try {
      await client.query('BEGIN')
      existingClient = await resolveExistingClientForVenues(client, venueIds)

      for (const contact of contacts) {
        const inviteToken = generateInviteToken()
        const result = await client.query(
          `INSERT INTO portal_users (
             email, full_name, client_id, visible_tabs,
             invite_token, invite_expires_at, invited_by
           )
           VALUES (LOWER($1), $2, $3, $4::text[], $5, NOW() + INTERVAL '14 days', $6)
           ON CONFLICT (email) DO UPDATE
             SET full_name = EXCLUDED.full_name,
                 client_id = EXCLUDED.client_id,
                 visible_tabs = EXCLUDED.visible_tabs,
                 invite_token = EXCLUDED.invite_token,
                 invite_expires_at = EXCLUDED.invite_expires_at,
                 is_active = true,
                 updated_at = NOW()
           RETURNING id, email, full_name, client_id, invite_token`,
          [
            contact.email,
            contact.full_name,
            existingClient.id,
            visibleTabs,
            inviteToken,
            auth.email,
          ]
        )
        const user = result.rows[0]
        await replaceVenueGrants(client, user.id, venueIds)
        createdUsers.push(user)
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      const response = requestError(error)
      if (response) return response
      throw error
    } finally {
      client.release()
    }

    const origin = originFor(request)
    const invitations = await Promise.all(createdUsers.map(async (user) => {
      const inviteUrl = `${origin}/customer/invite/${user.invite_token}`
      let inviteSent = false
      try {
        inviteSent = await sendPortalInviteEmail({
          to: user.email,
          fullName: user.full_name,
          clientName: existingClient.name,
          inviteUrl,
        })
      } catch (error) {
        console.error(`[customer-users] Invite email failed for ${user.email}:`, error)
      }
      return {
        user,
        invite_url: inviteUrl,
        invite_sent: inviteSent,
      }
    }))

    return NextResponse.json({
      invitations,
      customer_url: `${origin}/customer`,
      created_count: invitations.length,
      // Single-contact compatibility for existing internal callers.
      user: invitations[0]?.user,
      invite_url: invitations[0]?.invite_url,
      invite_sent: invitations[0]?.invite_sent,
    })
  } catch (err) {
    console.error('Customer user create error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const { id, is_active, resend_invite } = body
    if (!id) return NextResponse.json({ error: 'User id required' }, { status: 400 })

    if (resend_invite) {
      const inviteToken = generateInviteToken()
      const result = await query(
        `UPDATE portal_users
         SET invite_token = $2, invite_expires_at = NOW() + INTERVAL '14 days',
             is_active = true, updated_at = NOW()
         WHERE id = $1
         RETURNING id, email, full_name, client_id`,
        [id, inviteToken]
      )
      if (result.rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 })
      const user = result.rows[0]
      const clientRow = user.client_id
        ? await query('SELECT name FROM clients WHERE id = $1', [user.client_id])
        : null
      const inviteUrl = `${originFor(request)}/customer/invite/${inviteToken}`
      let inviteSent = false
      try {
        inviteSent = await sendPortalInviteEmail({
          to: user.email,
          fullName: user.full_name,
          clientName: clientRow?.rows[0]?.name || null,
          inviteUrl,
        })
      } catch (error) {
        console.error(`[customer-users] Invite resend failed for ${user.email}:`, error)
      }
      return NextResponse.json({ user, invite_url: inviteUrl, invite_sent: inviteSent })
    }

    let venueIds: string[] | undefined
    let visibleTabs: string[] | undefined
    try {
      if (body.linked_venue_ids !== undefined) {
        venueIds = cleanVenueIds(body.linked_venue_ids)
        if (venueIds.length === 0) throw new Error('VENUE_REQUIRED')
      }
      if (body.visible_tabs !== undefined) {
        visibleTabs = cleanVisibleTabs(body.visible_tabs, false)
      }
    } catch (error) {
      return requestError(error) || NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }

    const email = body.email === undefined ? undefined : String(body.email).trim().toLowerCase()
    const fullName = body.full_name === undefined ? undefined : String(body.full_name).trim()
    if (email !== undefined && !email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    if (fullName !== undefined && !fullName) {
      return NextResponse.json({ error: 'Customer name is required' }, { status: 400 })
    }

    const client = await getClient()
    try {
      await client.query('BEGIN')
      if (venueIds) await validateActiveVenues(client, venueIds)

      const sets = ['updated_at = NOW()']
      const params: any[] = [id]
      const addValue = (column: string, value: unknown, cast = '') => {
        params.push(value)
        sets.push(`${column} = $${params.length}${cast}`)
      }
      if (typeof is_active === 'boolean') addValue('is_active', is_active)
      if (email !== undefined) addValue('email', email)
      if (fullName !== undefined) addValue('full_name', fullName)
      if (visibleTabs !== undefined) addValue('visible_tabs', visibleTabs, '::text[]')

      const result = await client.query(
        `UPDATE portal_users
         SET ${sets.join(', ')}
         WHERE id = $1
         RETURNING id, email, full_name, is_active, client_id, visible_tabs`,
        params
      )
      if (result.rows.length === 0) {
        await client.query('ROLLBACK')
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }
      if (venueIds) await replaceVenueGrants(client, id, venueIds)
      await client.query('COMMIT')
      return NextResponse.json({
        user: {
          ...result.rows[0],
          visible_tabs: normalizeCustomerPortalTabs(result.rows[0].visible_tabs),
          venue_ids: venueIds,
        },
      })
    } catch (error: any) {
      await client.query('ROLLBACK')
      const response = requestError(error)
      if (response) return response
      if (error?.code === '23505') {
        return NextResponse.json({ error: 'That email already has portal access.' }, { status: 409 })
      }
      throw error
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('Customer user update error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
