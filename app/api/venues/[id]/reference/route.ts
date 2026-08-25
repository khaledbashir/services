export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { logVenueChange, changedFields } from '@/lib/venue-audit'
import { versionStatus, softwareStatus, VERSION_STATUS_LABEL } from '@/lib/venue-reference'

/**
 * The Overview splash — what a tech needs in the first three seconds.
 *
 * Steve: "the splash screen: rack diagram, signal map, common issues", and
 * separately that contract and licence status belong here too, because a
 * lapsed licence can be the actual cause of the fault being reported. So this
 * one call returns everything above the fold and the tabs load their own
 * detail after.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const venueRes = await query(
      `SELECT v.*, m.name AS market_name,
              vm.full_name AS venue_manager_name,
              lr.full_name AS lead_field_rep_name
         FROM venues v
         LEFT JOIN markets m ON m.id = v.market_id
         LEFT JOIN staff vm ON vm.id = v.venue_manager_id
         LEFT JOIN staff lr ON lr.id = v.lead_field_rep_id
        WHERE v.id = $1`,
      [params.id],
    )
    if (venueRes.rows.length === 0) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
    }
    const venue = venueRes.rows[0]

    const [equipment, venueIssues, hardwareIssues, docs, openTickets, lastTouch] = await Promise.all([
      query(
        `SELECT ve.id, ve.label, ve.installed_version, e.latest_version, e.category
           FROM venue_equipment ve
           LEFT JOIN equipment e ON e.id = ve.equipment_id
          WHERE ve.venue_id = $1`,
        [params.id],
      ),
      query(
        `SELECT id, title, symptom, resolution FROM venue_issues
          WHERE venue_id = $1 ORDER BY created_at DESC LIMIT 6`,
        [params.id],
      ),
      query(
        `SELECT DISTINCT ei.id, ei.title, ei.symptom, ei.resolution, e.manufacturer, e.model
           FROM equipment_issues ei
           JOIN equipment e ON e.id = ei.equipment_id
           JOIN venue_equipment ve ON ve.equipment_id = e.id
          WHERE ve.venue_id = $1
          LIMIT 6`,
        [params.id],
      ),
      query(
        `SELECT id, file_type, original_name, filename, created_at
           FROM venue_documents
          WHERE venue_id = $1 AND is_archived = false`,
        [params.id],
      ),
      query(
        `SELECT COUNT(*)::int AS open FROM tickets
          WHERE venue_id = $1 AND status NOT IN ('resolved','closed')`,
        [params.id],
      ),
      // The page has to be able to say how current it is. Without this the
      // reader has no way to tell a reviewed venue from an abandoned one.
      query(
        `SELECT MAX(created_at) AS at FROM activity_log
          WHERE (entity_type = 'venue' AND entity_id = $1)
             OR (entity_type = 'venue_equipment'
                 AND entity_id IN (SELECT id FROM venue_equipment WHERE venue_id = $1))`,
        [params.id],
      ),
    ])

    const gear = equipment.rows.map((r: any) => ({
      ...r, software_status: softwareStatus(r.installed_version, r.latest_version),
    }))

    const status = versionStatus(venue.season_start_date, venue.versions_updated_at)

    return NextResponse.json({
      venue: {
        id: venue.id,
        name: venue.name,
        sport: venue.sport,
        season_start_date: venue.season_start_date,
        market_name: venue.market_name,
        venue_manager_name: venue.venue_manager_name,
        lead_field_rep_name: venue.lead_field_rep_name,
        cms_version: venue.cms_version,
        led_firmware_version: venue.led_firmware_version,
        versions_updated_at: venue.versions_updated_at,
        contract_status: venue.contract_status,
        contract_expires_on: venue.contract_expires_on,
        livesync_license_status: venue.livesync_license_status,
        livesync_license_expires_on: venue.livesync_license_expires_on,
        rack_document_id: venue.rack_document_id,
        signal_map_document_id: venue.signal_map_document_id,
        slack_channel_id: venue.slack_channel_id,
        notes: venue.notes,
      },
      version_status: status,
      version_status_label: VERSION_STATUS_LABEL[status],
      rack_document: docs.rows.find((d: any) => d.id === venue.rack_document_id) || null,
      signal_map_document: docs.rows.find((d: any) => d.id === venue.signal_map_document_id) || null,
      counts: {
        equipment: gear.length,
        behind: gear.filter((g: any) => g.software_status === 'update_available').length,
        documents: docs.rows.length,
        drawings: docs.rows.filter((d: any) => d.file_type === 'drawing' || d.file_type === 'image').length,
        open_tickets: openTickets.rows[0]?.open || 0,
      },
      venue_issues: venueIssues.rows,
      hardware_issues: hardwareIssues.rows,
      last_reviewed_at: lastTouch.rows[0]?.at || null,
    })
  } catch (err) {
    console.error('Error building venue reference:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const EDITABLE = [
  'sport', 'season_start_date', 'cms_version', 'led_firmware_version',
  'contract_status', 'contract_expires_on', 'livesync_license_status',
  'livesync_license_expires_on', 'rack_document_id', 'signal_map_document_id',
]

/**
 * Coworkers edit venue info directly, and every change is attributed.
 *
 * Touching either version stamps `versions_updated_at`, which is what the
 * season-readiness badge reads — the badge means "somebody confirmed this",
 * so only a human save is allowed to move it.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json().catch(() => ({}))
    const before = await query(`SELECT * FROM venues WHERE id = $1`, [params.id])
    if (before.rows.length === 0) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
    }

    const sets: string[] = []
    const values: any[] = []
    for (const field of EDITABLE) {
      if (!(field in body)) continue
      values.push(body[field] === '' ? null : body[field])
      sets.push(`${field} = $${values.length}`)
    }
    if (!sets.length) return NextResponse.json({ venue: before.rows[0] })

    const touchedVersions = 'cms_version' in body || 'led_firmware_version' in body
    if (touchedVersions) {
      values.push(auth.userId)
      sets.push(`versions_updated_by = $${values.length}`)
      sets.push(`versions_updated_at = NOW()`)
    }
    values.push(params.id)

    const result = await query(
      `UPDATE venues SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values,
    )
    const diff = changedFields(before.rows[0], body, EDITABLE)
    if (Object.keys(diff).length) {
      await logVenueChange('venue', params.id, 'venue_reference_updated', auth.userId, diff)
    }

    const venue = result.rows[0]
    const status = versionStatus(venue.season_start_date, venue.versions_updated_at)
    return NextResponse.json({
      venue,
      version_status: status,
      version_status_label: VERSION_STATUS_LABEL[status],
    })
  } catch (err) {
    console.error('Error updating venue reference:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
