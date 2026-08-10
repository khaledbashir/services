export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getPortalSession, getScopedPortalVenueIds } from '@/lib/portal-auth'

/**
 * The client's real approval queue.
 *
 * This page previously rendered three invented rows ("Main concourse proof
 * package", "Primary venue") with local-only Approve buttons that changed
 * nothing. It now reads actual proof shares for the venues the customer is
 * granted, and the decision itself is taken on the proof page, which already
 * records the response, the timestamp and any note.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getPortalSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const venueIds = await getScopedPortalVenueIds(
      session,
      request.nextUrl.searchParams.get('venue')
    )
    if (venueIds.length === 0) return NextResponse.json({ pending: [], decided: [] })

    const result = await query(
      `SELECT ps.token, ps.client_response, ps.client_response_at, ps.client_response_note,
              ps.created_at, ps.message,
              d.id AS design_request_id, d.job_title, d.due_date,
              v.name AS venue_name
       FROM proof_shares ps
       JOIN design_requests d ON d.id = ps.twenty_record_id
       JOIN venues v ON v.id = d.venue_id
       WHERE d.venue_id = ANY($1::uuid[])
         AND d.deleted_at IS NULL
         -- A finished job must not sit here asking to be reviewed. Without
         -- this, a request showing "Complete" on Design Requests appeared as
         -- "waiting on you" here, because its proof was never formally
         -- answered. Decided proofs still show under Already decided.
         AND (ps.client_response IS NOT NULL OR LOWER(d.status) NOT IN ('done', 'approved'))
       ORDER BY ps.created_at DESC
       LIMIT 200`,
      [venueIds]
    )

    const rows = result.rows.map((row: any) => ({
      token: row.token,
      title: row.job_title,
      venue_name: row.venue_name,
      due_date: row.due_date,
      shared_at: row.created_at,
      message: row.message,
      response: row.client_response,
      responded_at: row.client_response_at,
      note: row.client_response_note,
      review_url: `/proof/${row.token}`,
    }))

    return NextResponse.json({
      pending: rows.filter((r) => !r.response),
      decided: rows.filter((r) => r.response),
    })
  } catch (err) {
    console.error('Portal approvals error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
