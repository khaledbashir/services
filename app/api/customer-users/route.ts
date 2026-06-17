export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getClient, query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { generateInviteToken } from '@/lib/portal-auth'

// Staff-side management of customer portal accounts.

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const result = await query(
      `SELECT pu.id, pu.email, pu.full_name, pu.client_id, pu.is_active,
              pu.invite_token, pu.invite_expires_at, pu.last_login_at, pu.created_at,
              (pu.password_hash IS NOT NULL) AS has_password,
              c.name AS client_name,
              (SELECT COUNT(*)::int FROM client_venues cv WHERE cv.client_id = pu.client_id) AS venue_count
       FROM portal_users pu
       LEFT JOIN clients c ON c.id = pu.client_id
       ORDER BY pu.created_at DESC`
    )
    return NextResponse.json({ users: result.rows })
  } catch (err) {
    console.error('Customer users list error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const { email, full_name, client_id, organization_name, linked_venue_ids } = await request.json()
    if (!email || !full_name) {
      return NextResponse.json({ error: 'Email and full name are required' }, { status: 400 })
    }
    if (!client_id && !organization_name) {
      return NextResponse.json({ error: 'Organization is required' }, { status: 400 })
    }

    const venueIds = Array.isArray(linked_venue_ids)
      ? linked_venue_ids.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim())
      : []
    if (!client_id && venueIds.length === 0) {
      return NextResponse.json({ error: 'Select at least one venue for a new organization' }, { status: 400 })
    }

    const inviteToken = generateInviteToken()
    const client = await getClient()
    let user: any
    let effectiveClientId = client_id || null

    try {
      await client.query('BEGIN')

      if (!effectiveClientId) {
        const createdClient = await client.query(
          `INSERT INTO clients (name, client_type, client_kind, primary_contact_name, primary_contact_email, is_active, updated_at)
           VALUES ($1, 'client', 'client', $2, LOWER($3), true, NOW())
           RETURNING id, name`,
          [organization_name.trim(), full_name.trim(), email.trim()]
        )
        effectiveClientId = createdClient.rows[0].id
      }

      for (let i = 0; i < venueIds.length; i++) {
        await client.query(
          `INSERT INTO client_venues (client_id, venue_id, is_primary, relation_type)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (client_id, venue_id) DO UPDATE
             SET is_primary = client_venues.is_primary OR EXCLUDED.is_primary,
                 relation_type = EXCLUDED.relation_type`,
          [effectiveClientId, venueIds[i], i === 0, i === 0 ? 'primary' : 'secondary']
        )
      }

      const result = await client.query(
        `INSERT INTO portal_users (email, full_name, client_id, invite_token, invite_expires_at, invited_by)
         VALUES (LOWER($1), $2, $3, $4, NOW() + INTERVAL '14 days', $5)
         ON CONFLICT (email) DO UPDATE
           SET full_name = EXCLUDED.full_name,
               client_id = EXCLUDED.client_id,
               invite_token = EXCLUDED.invite_token,
               invite_expires_at = EXCLUDED.invite_expires_at,
               is_active = true,
               updated_at = NOW()
         RETURNING id, email, full_name, client_id, invite_token`,
        [email.trim(), full_name.trim(), effectiveClientId, inviteToken, auth.email]
      )
      user = result.rows[0]

      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    const origin = request.headers.get('origin') || `https://${request.headers.get('host')}`
    return NextResponse.json({
      user,
      invite_url: `${origin}/customer/invite/${user.invite_token}`,
      customer_url: `${origin}/customer`,
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

    const { id, is_active, client_id } = await request.json()
    if (!id) return NextResponse.json({ error: 'User id required' }, { status: 400 })

    const sets: string[] = ['updated_at = NOW()']
    const params: any[] = [id]
    if (typeof is_active === 'boolean') {
      params.push(is_active)
      sets.push(`is_active = $${params.length}`)
    }
    if (client_id !== undefined) {
      params.push(client_id)
      sets.push(`client_id = $${params.length}`)
    }

    const result = await query(
      `UPDATE portal_users SET ${sets.join(', ')} WHERE id = $1 RETURNING id, email, is_active, client_id`,
      params
    )
    if (result.rows.length === 0) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    return NextResponse.json({ user: result.rows[0] })
  } catch (err) {
    console.error('Customer user update error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
