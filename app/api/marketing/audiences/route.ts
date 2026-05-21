export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const result = await query(`SELECT a.*,
        COUNT(m.contact_id) FILTER (WHERE m.status = 'active')::int AS member_count
      FROM marketing_audiences a
      LEFT JOIN marketing_audience_members m ON m.audience_id = a.id
      WHERE a.is_active = true
      GROUP BY a.id
      ORDER BY a.created_at DESC`)
    return NextResponse.json({ audiences: result.rows })
  } catch (err) {
    console.error('Error loading audiences:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const name = String(body.name || '').trim()
    if (!name) return NextResponse.json({ error: 'Audience name is required' }, { status: 400 })

    const result = await query(
      `INSERT INTO marketing_audiences (name, description, source)
       VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE
         SET description = EXCLUDED.description,
             source = EXCLUDED.source,
             is_active = true,
             updated_at = NOW()
       RETURNING *`,
      [name, body.description || null, body.source || 'manual'],
    )
    return NextResponse.json({ audience: result.rows[0] })
  } catch (err) {
    console.error('Error saving audience:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
