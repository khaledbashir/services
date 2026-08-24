export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'

/**
 * Every address this venue has actually corresponded with, newest first.
 *
 * Jireh, on a ticket whose venue had nothing on file: "possible to add a drop down
 * of previous emails sent from account or way to edit list?" He had just typed
 * three DC United addresses in by hand. The addresses were not lost — they were
 * sitting in the venue's own email history, one ticket over — but the only way to
 * put one on the list was to remember it and type it correctly.
 *
 * Three places hold that history, and all three are read:
 *   - the ticket's own stored contact
 *   - inbound mail, recorded as "Email from Name (address)"
 *   - outbound mail, recorded as "Email sent to a, b, c from support@anc.com"
 *
 * Addresses already on the venue's list are dropped, because the point of the list
 * is what is NOT on it yet. ANC's own addresses are kept but flagged, not hidden —
 * a venue's list legitimately carries staff, and Capital One Arena's held nothing
 * else — so the picker can say which is which rather than quietly offering someone
 * their own address as a client contact.
 */

const INTERNAL_EMAIL_DOMAINS = ['anc.com', 'ancsports.net']

function isInternalEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? ''
  return INTERNAL_EMAIL_DOMAINS.some(d => domain === d || domain.endsWith(`.${d}`))
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request)
    if (isAuthError(auth)) return auth

    const venueId = params.id

    const result = await query(
      `WITH venue_tickets AS (
         SELECT id FROM tickets WHERE venue_id = $1
       ),
       seen AS (
         SELECT t.contact_email AS email, t.created_at AS at, 'Ticket contact' AS source
         FROM tickets t
         WHERE t.venue_id = $1 AND t.contact_email IS NOT NULL

         UNION ALL

         -- Inbound: "Email from Nick Kanine (nicholas.kanine@louisville.edu)"
         SELECT (regexp_match(c.body, '^Email from[^\n(]*\\(([^)]+)\\)'))[1], c.created_at, 'Wrote in'
         FROM ticket_comments c
         JOIN venue_tickets vt ON vt.id = c.ticket_id
         WHERE c.deleted_at IS NULL AND c.body ~* '^Email from'

         UNION ALL

         -- Outbound: "Email sent to a, b, c from support@anc.com by Someone:"
         SELECT trim(addr), c.created_at, 'We emailed'
         FROM ticket_comments c
         JOIN venue_tickets vt ON vt.id = c.ticket_id
         CROSS JOIN LATERAL regexp_split_to_table(
           COALESCE((regexp_match(c.body, '^Email sent to (.+?) from '))[1], ''), ','
         ) AS addr
         WHERE c.deleted_at IS NULL AND c.body ~* '^Email sent to' AND trim(addr) <> ''
       )
       SELECT lower(email) AS email,
              count(*)::int AS times_used,
              max(at) AS last_used_at,
              (array_agg(source ORDER BY at DESC))[1] AS last_source
       FROM seen
       WHERE email ~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'
       GROUP BY 1
       ORDER BY max(at) DESC`,
      [venueId]
    )

    const onList = new Set(
      (
        await query(
          `SELECT COALESCE(distribution_emails, '{}') AS distribution_emails FROM venues WHERE id = $1`,
          [venueId]
        )
      ).rows[0]?.distribution_emails?.map((e: string) => e.toLowerCase()) ?? []
    )

    const emails = result.rows
      .filter(row => !onList.has(row.email))
      .map(row => ({
        email: row.email,
        timesUsed: row.times_used,
        lastUsedAt: row.last_used_at,
        lastSource: row.last_source,
        internal: isInternalEmail(row.email),
      }))

    return NextResponse.json({ emails })
  } catch (err) {
    console.error('Error fetching known venue emails:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
