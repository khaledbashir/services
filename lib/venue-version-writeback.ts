import { query } from '@/lib/db'
import { logVenueChange } from '@/lib/venue-audit'
export { readVersionsFromNote } from '@/lib/venue-reference'

/**
 * Closing a ticket updates the venue's Software tab.
 *
 * Steve, 2026-08-25: "When closing a ticket, tech can note what was updated
 * (e.g. CMS updated to v4.2). That writes directly to the venue's Software tab
 * — no separate manual update step."
 *
 * The separate manual step is exactly why version records go stale everywhere:
 * the tech who did the upgrade is standing in a rack room at 9pm, and a second
 * screen to go and update later is a screen nobody opens. So the close carries
 * the version with it.
 *
 * Versions stay editable outside a ticket too — this is an extra path onto the
 * same fields, not the only one.
 */
export type VersionWriteback = {
  /** Per-unit: the box this ticket actually touched. */
  equipment?: Array<{ venue_equipment_id: string; installed_version: string }>
  /** Venue-wide versions shown on the all-venues list. */
  cms_version?: string | null
  led_firmware_version?: string | null
}

export type WritebackResult = {
  equipment_updated: number
  venue_updated: boolean
}

export async function applyVersionWriteback(
  ticketId: string,
  venueId: string | null,
  updates: VersionWriteback | null | undefined,
  actorId: string | null,
): Promise<WritebackResult> {
  const result: WritebackResult = { equipment_updated: 0, venue_updated: false }
  if (!updates) return result

  for (const item of updates.equipment || []) {
    const version = String(item.installed_version || '').trim()
    if (!item.venue_equipment_id || !version) continue

    // Scoped to the ticket's own venue: a mistyped id must not be able to
    // rewrite the firmware record of a box in another building.
    const before = await query(
      `SELECT id, venue_id, label, installed_version FROM venue_equipment
        WHERE id = $1 AND ($2::uuid IS NULL OR venue_id = $2::uuid)`,
      [item.venue_equipment_id, venueId],
    )
    if (before.rows.length === 0) continue

    await query(
      `UPDATE venue_equipment
          SET installed_version = $1, updated_by = $2, updated_at = NOW()
        WHERE id = $3`,
      [version, actorId, item.venue_equipment_id],
    )
    result.equipment_updated += 1
    await logVenueChange('venue_equipment', item.venue_equipment_id, 'version_updated_from_ticket', actorId, {
      venue_id: before.rows[0].venue_id,
      label: before.rows[0].label,
      ticket_id: ticketId,
      installed_version: { from: before.rows[0].installed_version, to: version },
    })
  }

  const cms = updates.cms_version === undefined ? undefined : String(updates.cms_version || '').trim()
  const led = updates.led_firmware_version === undefined
    ? undefined
    : String(updates.led_firmware_version || '').trim()

  if (venueId && ((cms !== undefined && cms) || (led !== undefined && led))) {
    const before = await query(
      `SELECT cms_version, led_firmware_version FROM venues WHERE id = $1`, [venueId],
    )
    const sets: string[] = []
    const values: any[] = []
    if (cms) { values.push(cms); sets.push(`cms_version = $${values.length}`) }
    if (led) { values.push(led); sets.push(`led_firmware_version = $${values.length}`) }
    values.push(actorId)
    sets.push(`versions_updated_by = $${values.length}`)
    sets.push(`versions_updated_at = NOW()`)
    values.push(venueId)

    await query(`UPDATE venues SET ${sets.join(', ')} WHERE id = $${values.length}`, values)
    result.venue_updated = true
    await logVenueChange('venue', venueId, 'version_updated_from_ticket', actorId, {
      ticket_id: ticketId,
      ...(cms ? { cms_version: { from: before.rows[0]?.cms_version ?? null, to: cms } } : {}),
      ...(led ? { led_firmware_version: { from: before.rows[0]?.led_firmware_version ?? null, to: led } } : {}),
    })
  }

  return result
}
