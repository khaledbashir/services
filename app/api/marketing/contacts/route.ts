export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { cleanEmail, splitName } from '@/lib/marketing'

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const audienceId = sp.get('audienceId')
    const search = (sp.get('search') || '').trim()
    const params: any[] = []
    const where: string[] = []
    let join = ''

    if (audienceId) {
      params.push(audienceId)
      join = `JOIN marketing_audience_members m ON m.contact_id = c.id AND m.audience_id = $${params.length} AND m.status = 'active'`
    }
    if (search) {
      params.push(`%${search.toLowerCase()}%`)
      where.push(`(LOWER(c.email) LIKE $${params.length} OR LOWER(COALESCE(c.first_name, '') || ' ' || COALESCE(c.last_name, '')) LIKE $${params.length} OR LOWER(COALESCE(c.company_name, '')) LIKE $${params.length})`)
    }

    const result = await query(
      `SELECT c.*
       FROM marketing_contacts c
       ${join}
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY c.updated_at DESC
       LIMIT 200`,
      params,
    )
    return NextResponse.json({ contacts: result.rows })
  } catch (err) {
    console.error('Error loading marketing contacts:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const email = cleanEmail(body.email)
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    const named = splitName(String(body.name || ''))
    const firstName = body.firstName || named.firstName
    const lastName = body.lastName || named.lastName
    const audienceId = body.audienceId || null

    const result = await query(
      `INSERT INTO marketing_contacts
        (email, first_name, last_name, company_name, source, subscription_status, metadata)
       VALUES ($1, $2, $3, $4, $5, 'subscribed', $6::jsonb)
       ON CONFLICT (email) DO UPDATE
         SET first_name = COALESCE(EXCLUDED.first_name, marketing_contacts.first_name),
             last_name = COALESCE(EXCLUDED.last_name, marketing_contacts.last_name),
             company_name = COALESCE(EXCLUDED.company_name, marketing_contacts.company_name),
             subscription_status = 'subscribed',
             unsubscribed_at = NULL,
             updated_at = NOW()
       RETURNING *`,
      [
        email,
        firstName || null,
        lastName || null,
        body.companyName || null,
        body.source || 'manual',
        JSON.stringify(body.metadata || {}),
      ],
    )
    const contact = result.rows[0]

    if (audienceId) {
      await query(
        `INSERT INTO marketing_audience_members (audience_id, contact_id, status)
         VALUES ($1, $2, 'active')
         ON CONFLICT (audience_id, contact_id) DO UPDATE
           SET status = 'active', added_at = NOW()`,
        [audienceId, contact.id],
      )
    }

    return NextResponse.json({ contact })
  } catch (err) {
    console.error('Error saving marketing contact:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
