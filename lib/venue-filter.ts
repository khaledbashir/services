import { query } from '@/lib/db'

/**
 * Returns venue IDs a staff member is linked to.
 * - admin/manager: returns null (no filter — sees everything)
 * - technician: returns array of venue_ids from staff_venues
 */
export async function getStaffVenueIds(
  staffId: string,
  role: string
): Promise<string[] | null> {
  if (role === 'admin' || role === 'manager') return null

  const result = await query(
    `SELECT venue_id FROM staff_venues WHERE staff_id = $1`,
    [staffId]
  )
  return result.rows.map((r: any) => r.venue_id.toString())
}

/**
 * Builds a SQL WHERE clause fragment for event-level assignment filtering.
 * Technicians only see events they are personally assigned to.
 * Returns { clause, params, nextIdx } where clause is empty string for admin/manager.
 *
 * @param role - user role
 * @param staffId - staff member's ID
 * @param eventColumn - SQL column reference for the event ID (e.g., 'e.id')
 * @param startIdx - parameter index to start from
 */
export function buildAssignmentFilterClause(
  role: string,
  staffId: string,
  eventColumn: string,
  startIdx: number
): { clause: string; params: string[]; nextIdx: number } {
  if (role === 'admin' || role === 'manager') {
    return { clause: '', params: [], nextIdx: startIdx }
  }

  return {
    clause: `AND ${eventColumn} IN (SELECT event_id FROM event_assignments WHERE staff_id = $${startIdx})`,
    params: [staffId],
    nextIdx: startIdx + 1,
  }
}

/**
 * Builds a SQL WHERE clause fragment for venue filtering.
 * Returns { clause, params, nextIdx } where clause is empty string for admin/manager.
 *
 * @param venueIds - result from getStaffVenueIds
 * @param venueColumn - SQL column reference (e.g., 'e.venue_id', 'v.id', 't.venue_id')
 * @param startIdx - parameter index to start from (e.g., if you already have $1, $2, pass 3)
 */
export function buildVenueFilterClause(
  venueIds: string[] | null,
  venueColumn: string,
  startIdx: number
): { clause: string; params: string[]; nextIdx: number } {
  if (venueIds === null) {
    return { clause: '', params: [], nextIdx: startIdx }
  }

  if (venueIds.length === 0) {
    // Technician with no linked venues — show nothing
    return { clause: `AND FALSE`, params: [], nextIdx: startIdx }
  }

  const placeholders = venueIds.map((_, i) => `$${startIdx + i}`).join(', ')
  return {
    clause: `AND ${venueColumn} IN (${placeholders})`,
    params: venueIds,
    nextIdx: startIdx + venueIds.length,
  }
}
