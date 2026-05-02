import { NextRequest, NextResponse } from 'next/server'
import { query as dbQuery } from '@/lib/db'
import { authorizeVoiceCall, cleanQuery } from '@/lib/elevenlabs-internal-auth'

export async function GET(request: NextRequest) {
  const auth = await authorizeVoiceCall(request)
  if (!auth.ok) return auth.response

  const venueQuery = cleanQuery(request.nextUrl.searchParams.get('venue'), 80)
  const status = cleanQuery(request.nextUrl.searchParams.get('status'), 30).toLowerCase()
  const limitRaw = parseInt(request.nextUrl.searchParams.get('limit') || '8', 10)
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 8, 1), 25)

  try {
    const conditions: string[] = []
    const params: unknown[] = []

    if (venueQuery) {
      params.push(`%${venueQuery}%`)
      conditions.push(`v.name ILIKE $${params.length}`)
    }
    if (status) {
      const allowed = ['new', 'on_hold', 'in_progress', 'escalated', 'closed', 'open']
      const wanted = status === 'open'
        ? ['new', 'on_hold', 'in_progress', 'escalated']
        : allowed.includes(status)
          ? [status]
          : null
      if (wanted) {
        params.push(wanted)
        conditions.push(`t.status = ANY($${params.length}::text[])`)
      }
    } else {
      params.push(['new', 'on_hold', 'in_progress', 'escalated'])
      conditions.push(`t.status = ANY($${params.length}::text[])`)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    params.push(limit)

    const result = await dbQuery(
      `SELECT t.id, t.ticket_number, t.title, t.status, t.priority, t.category,
              v.name as venue_name,
              s.full_name as assigned_to_name,
              TO_CHAR(t.created_at AT TIME ZONE 'America/New_York', 'Mon DD, HH12:MI AM') as created_label
       FROM tickets t
       LEFT JOIN venues v ON v.id = t.venue_id
       LEFT JOIN staff s ON s.id = t.assigned_to
       ${where}
       ORDER BY t.created_at DESC
       LIMIT $${params.length}`,
      params
    )

    const rows = result.rows
    const voiceBrief = rows.length === 0
      ? `No matching tickets${venueQuery ? ` for ${venueQuery}` : ''}.`
      : `${rows.length} ticket${rows.length === 1 ? '' : 's'}${venueQuery ? ` for ${venueQuery}` : ''}. Newest is ticket ${String(rows[0].ticket_number).padStart(4, '0')}, ${rows[0].title}, ${rows[0].status.replace(/_/g, ' ')}, priority ${rows[0].priority}.`

    return NextResponse.json({
      ok: true,
      caller: auth.staff?.fullName || null,
      filter: { venue: venueQuery || null, status: status || 'open' },
      count: rows.length,
      tickets: rows.map(r => ({
        id: r.id,
        ticketNumber: r.ticket_number,
        title: r.title,
        status: r.status,
        priority: r.priority,
        category: r.category,
        venue: r.venue_name,
        assignedTo: r.assigned_to_name,
        created: r.created_label,
      })),
      voiceBrief,
    })
  } catch (error) {
    console.error('voice recent-tickets error:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'tickets_query_failed' },
      { status: 500 }
    )
  }
}
