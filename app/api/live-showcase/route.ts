export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

// Powers the /live leadership showcase page — a permanent, always-current view
// of the national operation that the daily Slack digest only shows in passing.
// Every number here is computed live from the operations database; nothing is
// hard-coded. Cumulative figures use event_date so they track the real slate.
//
// Deliberately leads with scale (events / venues / states / markets). It does
// NOT surface post-game-report completion as a headline: the overwhelming
// majority of events are warranty-only (no staffing, no report expected), so a
// "reports closed %" would be misleading rather than impressive.

type TonightRow = {
  id: string
  summary: string
  venue_name: string | null
  lat: number | null
  lng: number | null
  start_et: string
  end_et: string
  needs_staffing: boolean
  assigned_count: number
}

export async function GET() {
  try {
    // --- Cumulative scale -------------------------------------------------
    const totals = await query(
      `SELECT
         COUNT(*)                                            AS all_events,
         COUNT(*) FILTER (WHERE event_date >= date_trunc('year', CURRENT_DATE)) AS ytd_events,
         COUNT(*) FILTER (WHERE event_date >= CURRENT_DATE - 30)                AS last30_events,
         COUNT(DISTINCT venue_id)                            AS venues_with_events
       FROM events`
    )

    const venueTotals = await query(
      `SELECT COUNT(*) AS active_venues FROM venues WHERE is_active IS NOT FALSE`
    )

    const marketTotals = await query(`SELECT COUNT(*) AS markets FROM markets`)

    // Distinct US states inferred from "ST 12345" in the venue address.
    const stateTotals = await query(
      `SELECT COUNT(DISTINCT m[1]) AS states
       FROM venues v, LATERAL regexp_matches(v.address, '([A-Z]{2})[ ,]+[0-9]{5}') AS m
       WHERE v.address IS NOT NULL`
    )

    // --- Tonight ----------------------------------------------------------
    const tonight = await query(
      `SELECT e.id, e.summary,
              v.name AS venue_name,
              v.latitude  AS lat,
              v.longitude AS lng,
              COALESCE(v.requires_assignment, true) AS venue_requires_assignment,
              e.requires_staffing AS event_requires_staffing,
              COUNT(DISTINCT ea.staff_id) FILTER (WHERE ea.staff_id IS NOT NULL) AS assigned_count,
              CASE WHEN TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH24:MI') = '00:00'
                   THEN 'TBD'
                   ELSE TO_CHAR(e.start_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') END AS start_et,
              CASE WHEN TO_CHAR(e.end_time AT TIME ZONE 'America/New_York', 'HH24:MI') = '00:00'
                   THEN 'TBD'
                   ELSE TO_CHAR(e.end_time AT TIME ZONE 'America/New_York', 'HH12:MI AM') END AS end_et
       FROM events e
       LEFT JOIN venues v ON v.id = e.venue_id
       LEFT JOIN event_assignments ea ON ea.event_id = e.id
       WHERE e.event_date = (NOW() AT TIME ZONE 'America/New_York')::date
       GROUP BY e.id, v.name, v.latitude, v.longitude, v.requires_assignment
       ORDER BY e.start_time ASC NULLS LAST`
    )

    const needsStaffing = (r: any): boolean => {
      if (r.event_requires_staffing === true) return true
      if (r.event_requires_staffing === false) return false
      return r.venue_requires_assignment !== false
    }

    const tonightRows: TonightRow[] = tonight.rows.map((r: any) => ({
      id: r.id,
      summary: r.summary,
      venue_name: r.venue_name,
      lat: r.lat !== null ? Number(r.lat) : null,
      lng: r.lng !== null ? Number(r.lng) : null,
      start_et: r.start_et,
      end_et: r.end_et,
      needs_staffing: needsStaffing(r),
      assigned_count: Number(r.assigned_count) || 0,
    }))

    // Distinct states represented tonight (from the venues hosting events).
    const tonightStates = await query(
      `SELECT COUNT(DISTINCT m[1]) AS states
       FROM events e
       JOIN venues v ON v.id = e.venue_id, LATERAL regexp_matches(v.address, '([A-Z]{2})[ ,]+[0-9]{5}') AS m
       WHERE e.event_date = (NOW() AT TIME ZONE 'America/New_York')::date`
    )

    const tonightVenueCount = new Set(
      tonightRows.map((r) => r.venue_name).filter(Boolean)
    ).size

    // --- Map points: every geocoded venue, with tonight's venues flagged ---
    const venuePoints = await query(
      `SELECT v.id, v.name, v.latitude AS lat, v.longitude AS lng,
              EXISTS (
                SELECT 1 FROM events e
                WHERE e.venue_id = v.id
                  AND e.event_date = (NOW() AT TIME ZONE 'America/New_York')::date
              ) AS live_tonight
       FROM venues v
       WHERE v.latitude IS NOT NULL AND v.longitude IS NOT NULL
         AND v.is_active IS NOT FALSE`
    )

    const mapPoints = venuePoints.rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      lat: Number(r.lat),
      lng: Number(r.lng),
      live: r.live_tonight === true,
    }))

    const t = totals.rows[0] || {}

    return NextResponse.json(
      {
        ok: true,
        generatedAt: new Date().toISOString(),
        cumulative: {
          allTimeEvents: Number(t.all_events) || 0,
          ytdEvents: Number(t.ytd_events) || 0,
          last30Events: Number(t.last30_events) || 0,
          venues: Number(venueTotals.rows[0]?.active_venues) || 0,
          venuesWithEvents: Number(t.venues_with_events) || 0,
          states: Number(stateTotals.rows[0]?.states) || 0,
          markets: Number(marketTotals.rows[0]?.markets) || 0,
          year: new Date().getFullYear(),
        },
        tonight: {
          events: tonightRows.length,
          venues: tonightVenueCount,
          states: Number(tonightStates.rows[0]?.states) || 0,
          list: tonightRows,
        },
        mapPoints,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err: any) {
    console.error('[live-showcase] error', err)
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 })
  }
}
