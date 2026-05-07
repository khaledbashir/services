export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query as dbQuery } from '@/lib/db'
import { authorizeVoiceCall } from '@/lib/elevenlabs-internal-auth'

// Tickets where the SLA resolution clock is near or past breach.
// "near" = due within next 4 hours and still unresolved. "breached" = past due.

export async function GET(request: NextRequest) {
  const auth = await authorizeVoiceCall(request)
  if (!auth.ok) return auth.response

  const limit = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('limit') || '8', 10) || 8, 1), 25)
  const includeBreached = (request.nextUrl.searchParams.get('include_breached') || 'true').toLowerCase() !== 'false'

  try {
    const result = await dbQuery(
      `SELECT t.id, t.ticket_number, t.title, t.status, t.priority,
              v.name as venue_name,
              s.full_name as assigned_to_name,
              t.sla_resolution_due,
              EXTRACT(EPOCH FROM (t.sla_resolution_due - NOW())) / 3600.0 as hours_remaining,
              CASE WHEN t.sla_resolution_due < NOW() THEN true ELSE false END as breached
       FROM tickets t
       LEFT JOIN venues v ON v.id = t.venue_id
       LEFT JOIN staff s ON s.id = t.assigned_to
       WHERE t.status NOT IN ('closed', 'cancelled')
         AND t.sla_resolution_due IS NOT NULL
         AND ($1::boolean OR t.sla_resolution_due >= NOW())
         AND t.sla_resolution_due < NOW() + INTERVAL '4 hours'
       ORDER BY t.sla_resolution_due ASC
       LIMIT $2`,
      [includeBreached, limit]
    )

    const breached = result.rows.filter(r => r.breached).length
    const nearBreach = result.rows.length - breached

    const voiceBrief = result.rows.length === 0
      ? 'No tickets at SLA risk. The queue is healthy.'
      : [
          `${result.rows.length} ticket${result.rows.length === 1 ? '' : 's'} at SLA risk:`,
          breached ? `${breached} already past due` : null,
          nearBreach ? `${nearBreach} due in the next 4 hours` : null,
          result.rows[0]
            ? `Most urgent is ticket ${String(result.rows[0].ticket_number).padStart(4, '0')} at ${result.rows[0].venue_name || 'unspecified venue'}: ${result.rows[0].title}, ${result.rows[0].breached ? 'past due' : `due in ${Math.max(0, result.rows[0].hours_remaining).toFixed(1)} hours`}.`
            : null,
        ].filter(Boolean).join('. ').replace(/\.\./g, '.')

    return NextResponse.json({
      ok: true,
      counts: { total: result.rows.length, breached, nearBreach },
      tickets: result.rows.map(r => ({
        id: r.id,
        ticketNumber: r.ticket_number,
        ticketLabel: String(r.ticket_number).padStart(4, '0'),
        title: r.title,
        status: r.status,
        priority: r.priority,
        venue: r.venue_name,
        assignedTo: r.assigned_to_name,
        breached: r.breached,
        hoursRemaining: Number((r.hours_remaining || 0).toFixed(1)),
      })),
      voiceBrief,
    })
  } catch (error) {
    console.error('voice sla-at-risk:', error)
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'sla_query_failed' },
      { status: 500 }
    )
  }
}
