export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS report_schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      venue_ids TEXT[] NOT NULL DEFAULT '{}',
      frequency TEXT NOT NULL DEFAULT 'weekly',
      recipients TEXT[] NOT NULL DEFAULT '{}',
      enabled BOOLEAN NOT NULL DEFAULT true,
      last_sent_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `)
}

export async function GET() {
  try {
    await ensureTable()
    const result = await query(
      `SELECT rs.*,
        (SELECT array_agg(v.name) FROM venues v WHERE v.id::text = ANY(rs.venue_ids)) as venue_names
       FROM report_schedules rs ORDER BY rs.created_at`
    )
    return NextResponse.json({ schedules: result.rows })
  } catch (err) {
    console.error('Error fetching report schedules:', err)
    return NextResponse.json({ schedules: [] })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth
    await ensureTable()

    const body = await request.json()

    // Toggle enabled
    if (body.id && typeof body.enabled === 'boolean') {
      await query(`UPDATE report_schedules SET enabled = $1 WHERE id = $2`, [body.enabled, body.id])
    }
    // Create new schedule
    else if (body.name && body.recipients && body.recipients.length > 0) {
      const { name, venue_ids, frequency, recipients } = body
      const validFreqs = ['weekly', 'monthly']
      const freq = validFreqs.includes(frequency) ? frequency : 'weekly'

      await query(
        `INSERT INTO report_schedules (name, venue_ids, frequency, recipients, enabled)
         VALUES ($1, $2, $3, $4, true)`,
        [name, venue_ids || [], freq, recipients]
      )
    }

    const result = await query(
      `SELECT rs.*,
        (SELECT array_agg(v.name) FROM venues v WHERE v.id::text = ANY(rs.venue_ids)) as venue_names
       FROM report_schedules rs ORDER BY rs.created_at`
    )
    return NextResponse.json({ schedules: result.rows })
  } catch (err) {
    console.error('Error managing report schedule:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth
    await ensureTable()

    const { id } = await request.json()
    await query(`DELETE FROM report_schedules WHERE id = $1`, [id])

    const result = await query(
      `SELECT rs.*,
        (SELECT array_agg(v.name) FROM venues v WHERE v.id::text = ANY(rs.venue_ids)) as venue_names
       FROM report_schedules rs ORDER BY rs.created_at`
    )
    return NextResponse.json({ schedules: result.rows })
  } catch (err) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
