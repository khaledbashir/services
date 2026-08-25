import { query } from '@/lib/db'

/**
 * Who changed what on a venue, and when.
 *
 * Steve's outline asks for this by name: "Each change is logged: who updated
 * it, when — so we can trust what we're looking at is current." A reference
 * page nobody can date is a page nobody believes.
 *
 * `activity_log` already carries exactly this shape for tickets (4,038 rows),
 * so venue and equipment edits join the same table rather than growing a
 * second one — one timeline, one query, and the ticket history UI already
 * knows how to read it.
 */
export type AuditEntity = 'venue' | 'venue_equipment' | 'equipment' | 'venue_issue' | 'equipment_issue'

export async function logVenueChange(
  entityType: AuditEntity,
  entityId: string,
  action: string,
  staffId: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    await query(
      `INSERT INTO activity_log (action, entity_type, entity_id, staff_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [action, entityType, entityId, staffId, JSON.stringify(details)],
    )
  } catch (err) {
    // An audit write must never take the edit down with it. The change the
    // user asked for has already committed by this point.
    console.warn('venue audit log failed:', err)
  }
}

/**
 * Only the fields that actually moved, old and new.
 *
 * Logging the whole row on every save makes the timeline unreadable — a tech
 * looking for "who changed the IP" should not scroll past twelve unchanged
 * fields to find it.
 */
export function changedFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {}
  for (const key of fields) {
    if (!(key in after)) continue
    const from = before?.[key] ?? null
    const to = after[key] ?? null
    const same = from instanceof Date && to instanceof Date
      ? from.getTime() === to.getTime()
      : String(from ?? '') === String(to ?? '')
    if (!same) diff[key] = { from, to }
  }
  return diff
}
