export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getPortalSession, getScopedPortalVenueIds } from '@/lib/portal-auth'
import { presentDesignRequest } from '@/lib/design-request-client-view'

/**
 * The client's design requests with their proof and approval state, scoped to
 * the venues they are granted (Charlie 2026-08-10).
 *
 * Proof state comes from the most recent share for each request. The share
 * token itself IS the proof link, so the client gets a working review link
 * without ANC re-sending an email. Internal fields — designer, hours, QC
 * reviewer, FTP paths — are never selected into the response.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getPortalSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const venueIds = await getScopedPortalVenueIds(
      session,
      request.nextUrl.searchParams.get('venue')
    )
    if (venueIds.length === 0) return NextResponse.json({ requests: [] })

    const result = await query(
      `SELECT d.id, d.job_title, d.status, d.due_date, d.created_at, d.updated_at,
              d.boards_requested, d.sizes_requested,
              v.name AS venue_name,
              p.token AS proof_token,
              p.client_response, p.client_response_at
       FROM design_requests d
       JOIN venues v ON v.id = d.venue_id
       LEFT JOIN LATERAL (
         SELECT token, client_response, client_response_at
         FROM proof_shares ps
         WHERE ps.twenty_record_id = d.id
         ORDER BY ps.created_at DESC
         LIMIT 1
       ) p ON TRUE
       WHERE d.venue_id = ANY($1::uuid[])
         AND d.deleted_at IS NULL
       ORDER BY COALESCE(d.updated_at, d.created_at) DESC
       LIMIT 200`,
      [venueIds]
    )

    const requests = result.rows.map((row: any) => {
      const presentation = presentDesignRequest({
        status: row.status,
        proofResponse: row.client_response,
        hasProof: Boolean(row.proof_token),
      })
      return {
        id: row.id,
        title: row.job_title,
        venue_name: row.venue_name,
        boards: row.boards_requested,
        sizes: row.sizes_requested,
        due_date: row.due_date,
        created_at: row.created_at,
        updated_at: row.updated_at,
        state: presentation.state,
        state_label: presentation.label,
        needs_your_action: presentation.needsClientAction,
        proof_url: row.proof_token ? `/proof/${row.proof_token}` : null,
        responded_at: row.client_response_at,
      }
    })

    return NextResponse.json({
      requests,
      awaiting_you: requests.filter((r) => r.needs_your_action).length,
    })
  } catch (err) {
    console.error('Portal design requests error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
