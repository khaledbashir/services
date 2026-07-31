export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getPortalSession, getScopedPortalVenueIds } from '@/lib/portal-auth'

const CLOSED = ['completed', 'cancelled', 'resolved', 'skipped', 'complete', 'closed']
const OFFLINE_PATTERN = '(offline|down|dark|blank|black screen|no signal|outage)'

// The customer's display inventory with a health overlay.
// Specs come from venue_screens; "attention" state is best-effort matched by
// checking open maintenance logs whose text mentions the display's name or
// zone. Unmatched open logs are still surfaced at the venue level so nothing
// in-flight is hidden.
export async function GET(request: NextRequest) {
  try {
    const session = await getPortalSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const venueIds = await getScopedPortalVenueIds(
      session,
      request.nextUrl.searchParams.get('venue')
    )
    if (venueIds.length === 0) return NextResponse.json({ venues: [] })

    const [venuesResult, screensResult, logsResult, lastServiceResult] = await Promise.all([
      query(`SELECT id, name FROM venues WHERE id = ANY($1::uuid[]) ORDER BY name`, [venueIds]),
      query(
        `SELECT id, venue_id, display_name, manufacturer, model, pixel_pitch,
                width_ft, height_ft, brightness_nits, environment, location_zone
         FROM venue_screens
         WHERE venue_id = ANY($1::uuid[]) AND COALESCE(is_active, true) = true
         ORDER BY display_name`,
        [venueIds]
      ),
      query(
        `SELECT id, venue_id, status, maintenance_type, scheduled_date,
                COALESCE(issue_summary, issue) AS summary,
                LOWER(CONCAT_WS(' ', issue, issue_summary, details_to_resolve, location_reported)) AS haystack
         FROM maintenance_logs
         WHERE venue_id = ANY($1::uuid[])
           AND status <> ALL($2::text[])
         ORDER BY COALESCE(updated_at, created_at) DESC
         LIMIT 200`,
        [venueIds, CLOSED]
      ),
      query(
        `SELECT venue_id, MAX(completed_date) AS last_service
         FROM maintenance_logs
         WHERE venue_id = ANY($1::uuid[]) AND completed_date IS NOT NULL
         GROUP BY venue_id`,
        [venueIds]
      ),
    ])

    const lastServiceByVenue: Record<string, string> = {}
    for (const r of lastServiceResult.rows) lastServiceByVenue[r.venue_id] = r.last_service

    const venues = venuesResult.rows.map((v: { id: string; name: string }) => {
      const logs = logsResult.rows.filter((l: any) => l.venue_id === v.id)
      const screens = screensResult.rows
        .filter((s: any) => s.venue_id === v.id)
        .map((s: any) => {
          const name = String(s.display_name || '').toLowerCase()
          const zone = String(s.location_zone || '').toLowerCase()
          const needles = [name, zone].filter(t => t.length >= 4)
          const match = logs.find((l: any) => needles.some(n => l.haystack.includes(n)))
          const offline = match ? new RegExp(OFFLINE_PATTERN).test(match.haystack) : false
          return {
            id: s.id,
            name: s.display_name,
            manufacturer: s.manufacturer,
            model: s.model,
            pixel_pitch: s.pixel_pitch,
            width_ft: s.width_ft,
            height_ft: s.height_ft,
            brightness_nits: s.brightness_nits,
            environment: s.environment,
            zone: s.location_zone,
            health: offline ? 'offline' : match ? 'attention' : 'ok',
            issue: match ? String(match.summary || '').slice(0, 140) : null,
          }
        })

      return {
        id: v.id,
        name: v.name,
        display_count: screens.length,
        open_issues: logs.length,
        last_service: lastServiceByVenue[v.id] || null,
        displays: screens,
        open_work: logs.slice(0, 6).map((l: any) => ({
          id: l.id,
          summary: String(l.summary || 'Maintenance in progress').slice(0, 140),
          status: l.status,
          type: l.maintenance_type,
          scheduled_date: l.scheduled_date,
        })),
      }
    })

    return NextResponse.json({ venues })
  } catch (err) {
    console.error('Customer displays error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
