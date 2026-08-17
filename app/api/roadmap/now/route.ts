export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

interface Summary {
  active_venues: number
  field_staff: number
  events_next_7d: number
  open_tickets: number
  open_design_requests: number
  active_clients: number
  generated_at: string
}

function intOf(v: unknown): number {
  if (typeof v === 'number') return v
  if (typeof v === 'string') return parseInt(v, 10) || 0
  return 0
}

export async function GET() {
  try {
    const result = await query(
      `SELECT
        (SELECT COUNT(*)::int FROM venues WHERE COALESCE(is_active, true)) as active_venues,
        (SELECT COUNT(*)::int FROM staff WHERE COALESCE(is_active, true)) as field_staff,
        (SELECT COUNT(*)::int FROM events WHERE COALESCE(approval_status, 'approved') = 'approved' AND event_date >= CURRENT_DATE AND event_date < CURRENT_DATE + INTERVAL '7 days') as events_next_7d,
        (SELECT COUNT(*)::int FROM tickets WHERE status NOT IN ('closed','resolved')) as open_tickets,
        (SELECT COUNT(*)::int FROM design_requests WHERE status NOT IN ('done','cancelled')) as open_design_requests,
        (SELECT COUNT(*)::int FROM clients WHERE COALESCE(is_active, true)) as active_clients`
    )
    const row = result.rows[0]
    const summary: Summary = {
      active_venues: intOf(row.active_venues),
      field_staff: intOf(row.field_staff),
      events_next_7d: intOf(row.events_next_7d),
      open_tickets: intOf(row.open_tickets),
      open_design_requests: intOf(row.open_design_requests),
      active_clients: intOf(row.active_clients),
      generated_at: new Date().toISOString(),
    }
    return NextResponse.json(summary)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'roadmap fetch failed' }, { status: 500 })
  }
}
