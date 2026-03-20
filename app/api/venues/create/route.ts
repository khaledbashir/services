import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const { name, market_id, address, primary_contact_name, primary_contact_email, requires_assignment } = await request.json()

    if (!name) {
      return NextResponse.json({ error: 'Venue name is required' }, { status: 400 })
    }

    const result = await query(
      `INSERT INTO venues (name, market_id, address, primary_contact_name, primary_contact_email, requires_assignment, portal_token)
       VALUES ($1, $2, $3, $4, $5, $6, encode(gen_random_bytes(16), 'hex'))
       RETURNING id, name`,
      [name, market_id || null, address || null, primary_contact_name || null, primary_contact_email || null, requires_assignment !== false]
    )

    return NextResponse.json({ venue: result.rows[0] })
  } catch (err) {
    console.error('Error creating venue:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
