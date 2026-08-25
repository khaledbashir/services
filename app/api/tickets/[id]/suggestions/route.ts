export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'
import {
  normalizePhone, formatPhone, phoneDecision, rankMatches, keywords,
} from '@/lib/venue-reference'

/**
 * What the dashboard can tell a tech before they call back.
 *
 * Two answers off one ticket: which venue this number has called about before,
 * and which past tickets or known issues sound like what the caller just said.
 *
 * The matching is keyword-based over the transcript, deliberately. It runs on
 * every ticket with no model call, no cost and no wait, and 365 tickets already
 * carry resolution notes to match against. A semantic pass can layer on top
 * later; it cannot be the thing that has to work at 6pm on a game day.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireAuth(request)
    if (isAuthError(auth)) return auth

    const ticketRes = await query(
      `SELECT id, venue_id, title, description, original_message, contact_phone, contact_name
         FROM tickets WHERE id = $1`,
      [params.id],
    )
    if (ticketRes.rows.length === 0) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })
    }
    const ticket = ticketRes.rows[0]

    // The transcript is the caller's own words; title and description are ours.
    // All three go in, because a voicemail with no transcript still has a title.
    const spoken = [ticket.original_message, ticket.title, ticket.description]
      .filter(Boolean).join(' \n ')

    const key = normalizePhone(ticket.contact_phone)
    let phone: any = { action: 'none', options: [], phone: null }
    if (key) {
      const matches = await query(
        `SELECT vpn.venue_id, vpn.call_count, vpn.last_seen_at, vpn.origin,
                vpn.caller_name, v.name AS venue_name
           FROM venue_phone_numbers vpn
           JOIN venues v ON v.id = vpn.venue_id
          WHERE vpn.phone = $1`,
        [key],
      )
      const decision = phoneDecision(matches.rows as any[])
      phone = {
        phone: key,
        phone_display: formatPhone(key),
        action: decision.action,
        venue: decision.venue || null,
        options: decision.options,
        already_linked: !!ticket.venue_id,
      }
    }

    // The caller's own name is not a symptom. Excluding it (and any bare
    // number — case numbers, callbacks, dates) keeps a voicemail from matching
    // an unrelated ticket that happens to mention another David.
    const callerNoise = [ticket.contact_name, ticket.contact_phone].filter(Boolean).join(' ')
    const words = keywords(spoken, callerNoise)
    let relatedTickets: any[] = []
    let relatedIssues: any[] = []

    if (words.length) {
      // Narrow in SQL before scoring in JS — matching 1,897 tickets word by
      // word in the request would be slow for no gain. Candidates are drawn
      // from the same venue first, then anywhere, and only resolved tickets
      // qualify: an unresolved one has no answer to offer.
      const candidates = await query(
        `SELECT id, ticket_number, title, description, resolution_notes, venue_id, resolved_at
           FROM tickets
          WHERE id <> $1
            AND resolution_notes IS NOT NULL AND resolution_notes <> ''
            AND ($2::uuid IS NULL OR venue_id = $2::uuid)
          ORDER BY resolved_at DESC NULLS LAST
          LIMIT 300`,
        [ticket.id, ticket.venue_id || null],
      )
      relatedTickets = rankMatches(
        spoken,
        candidates.rows,
        (t: any) => [t.title, t.description, t.resolution_notes].filter(Boolean).join(' '),
        5,
        callerNoise,
      ).map((s) => ({ ...s.item, score: Number(s.score.toFixed(3)) }))

      const issueRows = ticket.venue_id
        ? await query(
            `SELECT vi.id, vi.title, vi.symptom, vi.resolution, 'venue' AS kind
               FROM venue_issues vi WHERE vi.venue_id = $1
             UNION ALL
             SELECT DISTINCT ei.id, ei.title, ei.symptom, ei.resolution, 'hardware' AS kind
               FROM equipment_issues ei
               JOIN equipment e ON e.id = ei.equipment_id
               JOIN venue_equipment ve ON ve.equipment_id = e.id
              WHERE ve.venue_id = $1`,
            [ticket.venue_id],
          )
        : { rows: [] as any[] }

      relatedIssues = rankMatches(
        spoken,
        issueRows.rows,
        (i: any) => [i.title, i.symptom, i.resolution].filter(Boolean).join(' '),
        5,
        callerNoise,
      ).map((s) => ({ ...s.item, score: Number(s.score.toFixed(3)) }))
    }

    return NextResponse.json({
      phone,
      related_tickets: relatedTickets,
      related_issues: relatedIssues,
      matched_on: words.slice(0, 12),
    })
  } catch (err) {
    console.error('Error building ticket suggestions:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
