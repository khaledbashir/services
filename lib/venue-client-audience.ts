import { query } from '@/lib/db'

/**
 * Does this venue actually have someone on the client side who would receive a
 * client-visible post?
 *
 * Chris D (2026-07-29) asked for notes to default to client-visible when a
 * venue has clients set up, and internal when it doesn't. The obvious signal —
 * a row in client_venues — is useless here: every venue has one (246/246), so
 * it would default every internal note to client-visible and leak them.
 *
 * The real audience is either:
 *   - a client distribution list on the venue (the email recipients), or
 *   - an active customer-portal user attached to a client for that venue.
 *
 * Only those two mean a post actually reaches a client, so only those two flip
 * the default.
 */
export async function venueHasClientAudience(venueId: string | null | undefined): Promise<boolean> {
  if (!venueId) return false

  const result = await query(
    `SELECT EXISTS (
       SELECT 1 FROM venues v
       WHERE v.id = $1
         AND v.distribution_emails IS NOT NULL
         AND array_length(v.distribution_emails, 1) > 0
     ) OR EXISTS (
       SELECT 1
       FROM client_venues cv
       JOIN portal_users pu ON pu.client_id = cv.client_id AND pu.is_active = true
       WHERE cv.venue_id = $1
     ) AS has_audience`,
    [venueId]
  )

  return result.rows[0]?.has_audience === true
}
