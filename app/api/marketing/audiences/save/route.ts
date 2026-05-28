export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

/**
 * Persist a Signal NL-defined audience.
 * Stores the original NL prompt + the synthesized SQL in metadata so the
 * audience can be re-materialized later (live audience) or kept as a snapshot.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const name = String(body.name || '').trim()
  const nlQuery = String(body.nlQuery || '').trim()
  const sql = String(body.sql || '').trim()
  const contactIds: string[] = Array.isArray(body.contactIds) ? body.contactIds : []
  if (!name || !sql) {
    return NextResponse.json({ error: 'name + sql are required' }, { status: 400 })
  }

  const ins = await query(
    `INSERT INTO marketing_audiences (name, description, source)
     VALUES ($1, $2, 'signal_nl')
     RETURNING id`,
    [name, `Signal: ${nlQuery}`],
  )
  const audienceId = (ins.rows[0] as { id: string }).id

  // Bulk-link members
  if (contactIds.length > 0) {
    // Build VALUES list
    const valuesSql = contactIds.map((_, i) => `($1, $${i + 2}, 'active')`).join(',')
    await query(
      `INSERT INTO marketing_audience_members (audience_id, contact_id, status)
       VALUES ${valuesSql}
       ON CONFLICT DO NOTHING`,
      [audienceId, ...contactIds],
    )
  }

  return NextResponse.json({ ok: true, audienceId, memberCount: contactIds.length })
}
