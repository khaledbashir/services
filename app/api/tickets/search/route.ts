import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// Search resolved tickets by keyword matching against title, description, resolution_notes
export async function POST(request: NextRequest) {
  try {
    const { text, limit = 5 } = await request.json()

    if (!text) {
      return NextResponse.json({ error: 'text required' }, { status: 400 })
    }

    // Split search into keywords for flexible matching
    const keywords = text.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2)
    if (keywords.length === 0) {
      return NextResponse.json({ matches: [] })
    }

    // Build a search that matches any keyword in title, description, or resolution_notes
    // Rank by number of keyword matches
    const conditions = keywords.map((_: string, i: number) =>
      `(LOWER(t.title) LIKE $${i + 1} OR LOWER(t.description) LIKE $${i + 1} OR LOWER(t.resolution_notes) LIKE $${i + 1})`
    ).join(' OR ')

    const rankExpr = keywords.map((_: string, i: number) =>
      `CASE WHEN LOWER(t.title) LIKE $${i + 1} THEN 3 ELSE 0 END + CASE WHEN LOWER(t.description) LIKE $${i + 1} THEN 1 ELSE 0 END + CASE WHEN LOWER(t.resolution_notes) LIKE $${i + 1} THEN 2 ELSE 0 END`
    ).join(' + ')

    const params = keywords.map((k: string) => `%${k}%`)
    const limitIdx = params.length + 1

    const result = await query(
      `SELECT t.id, t.ticket_number, t.title, v.name as venue_name,
              t.resolution_notes, t.category,
              TO_CHAR(t.resolved_at, 'Mon DD, YYYY') as resolved_date,
              (${rankExpr}) as relevance
       FROM tickets t
       LEFT JOIN venues v ON t.venue_id = v.id
       WHERE t.status = 'closed'
         AND t.resolution_notes IS NOT NULL
         AND t.resolution_notes != ''
         AND (${conditions})
       ORDER BY relevance DESC, t.resolved_at DESC
       LIMIT $${limitIdx}`,
      [...params, limit]
    )

    return NextResponse.json({ matches: result.rows })
  } catch (err: any) {
    console.error('Ticket search error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
