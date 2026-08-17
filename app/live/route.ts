export const dynamic = 'force-dynamic'
export const revalidate = 0

import { query } from '@/lib/db'
import { TEMPLATE } from './template'

// Serves the ANC kinetic showcase — the kinetic-max engine, re-skinned to ANC,
// with every figure injected live from the operations DB at request time so the
// page is always current and the kinetic engine can split/animate real numbers.

export async function GET() {
  try {
    const totals = await query(
      `SELECT COUNT(*) AS all_events,
              COUNT(*) FILTER (WHERE event_date >= date_trunc('year', CURRENT_DATE)) AS ytd_events,
              COUNT(DISTINCT venue_id) AS venues_with_events
       FROM events
       WHERE COALESCE(approval_status, 'approved') = 'approved'`
    )
    const venueTotals = await query(`SELECT COUNT(*) AS active_venues FROM venues WHERE is_active IS NOT FALSE`)
    const marketTotals = await query(`SELECT COUNT(*) AS markets FROM markets`)
    const stateTotals = await query(
      `SELECT COUNT(DISTINCT m[1]) AS states
       FROM venues v, LATERAL regexp_matches(v.address, '([A-Z]{2})[ ,]+[0-9]{5}') AS m
       WHERE v.address IS NOT NULL`
    )
    const tickets = await query(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'closed') AS resolved FROM tickets`
    )
    const tonight = await query(
      `SELECT COUNT(*) AS events, COUNT(DISTINCT venue_id) AS venues
       FROM events
       WHERE COALESCE(approval_status, 'approved') = 'approved'
         AND event_date = (NOW() AT TIME ZONE 'America/New_York')::date`
    )
    const tonightStates = await query(
      `SELECT COUNT(DISTINCT m[1]) AS states
       FROM events e JOIN venues v ON v.id = e.venue_id,
            LATERAL regexp_matches(v.address, '([A-Z]{2})[ ,]+[0-9]{5}') AS m
       WHERE COALESCE(e.approval_status, 'approved') = 'approved'
         AND e.event_date = (NOW() AT TIME ZONE 'America/New_York')::date`
    )
    const venuePoints = await query(
      `SELECT v.name, v.latitude AS lat, v.longitude AS lng,
              EXISTS (SELECT 1 FROM events e WHERE e.venue_id = v.id
                      AND COALESCE(e.approval_status, 'approved') = 'approved'
                      AND e.event_date = (NOW() AT TIME ZONE 'America/New_York')::date) AS live
       FROM venues v
       WHERE v.latitude IS NOT NULL AND v.longitude IS NOT NULL AND v.is_active IS NOT FALSE`
    )
    const monthly = await query(
      `SELECT to_char(date_trunc('month', event_date), 'Mon') AS mon,
              EXTRACT(MONTH FROM event_date)::int AS mnum, COUNT(*) AS events
       FROM events
       WHERE COALESCE(approval_status, 'approved') = 'approved'
         AND event_date >= date_trunc('year', CURRENT_DATE)
         AND event_date < date_trunc('year', CURRENT_DATE) + interval '1 year'
       GROUP BY date_trunc('month', event_date), to_char(date_trunc('month', event_date), 'Mon'), EXTRACT(MONTH FROM event_date)
       ORDER BY mnum`
    )
    const topMarkets = await query(
      `SELECT m.name, COUNT(e.id) AS events
       FROM markets m JOIN venues v ON v.market_id = m.id
       JOIN events e ON e.venue_id = v.id AND e.event_date >= date_trunc('year', CURRENT_DATE)
       GROUP BY m.name ORDER BY events DESC LIMIT 6`
    )
    const slate = await query(
      `SELECT e.summary, v.name AS venue,
              COALESCE(v.requires_assignment, true) AS venue_req, e.requires_staffing AS ev_req,
              CASE WHEN TO_CHAR(e.start_time AT TIME ZONE 'America/New_York','HH24:MI')='00:00' THEN 'TBD'
                   ELSE TO_CHAR(e.start_time AT TIME ZONE 'America/New_York','HH12:MI AM') END AS start_et
       FROM events e LEFT JOIN venues v ON v.id = e.venue_id
       WHERE COALESCE(e.approval_status, 'approved') = 'approved'
         AND e.event_date = (NOW() AT TIME ZONE 'America/New_York')::date
       ORDER BY e.start_time ASC NULLS LAST`
    )

    const t = totals.rows[0] || {}
    const ticketsTotal = Number(tickets.rows[0]?.total) || 0
    const ticketsResolved = Number(tickets.rows[0]?.resolved) || 0
    const resolvedPct = ticketsTotal ? Math.round((ticketsResolved / ticketsTotal) * 100) : 0

    const mapPoints = venuePoints.rows.map((r: any) => ({
      name: r.name,
      lat: Number(r.lat),
      lng: Number(r.lng),
      live: r.live === true,
    }))

    const num = (v: any) => (Number(v) || 0).toLocaleString('en-US')

    const tokens: Record<string, string> = {
      YTD: num(t.ytd_events),
      ALLTIME: num(t.all_events),
      VENUES: num(venueTotals.rows[0]?.active_venues),
      STATES: num(stateTotals.rows[0]?.states),
      MARKETS: num(marketTotals.rows[0]?.markets),
      TICKETS: num(ticketsTotal),
      RESOLVED_PCT: String(resolvedPct),
      TONIGHT_EVENTS: num(tonight.rows[0]?.events),
      TONIGHT_STATES: num(tonightStates.rows[0]?.states),
      TONIGHT_VENUES: num(tonight.rows[0]?.venues),
      MAP_JSON: JSON.stringify(mapPoints),
      MONTHLY_JSON: JSON.stringify(
        monthly.rows.map((r: any) => ({ mon: r.mon, events: Number(r.events) || 0 }))
      ),
      MARKETS_JSON: JSON.stringify(
        topMarkets.rows.map((r: any) => ({ name: r.name, events: Number(r.events) || 0 }))
      ),
      SLATE_JSON: JSON.stringify(
        slate.rows.map((r: any) => {
          const needs = r.ev_req === true ? true : r.ev_req === false ? false : r.venue_req !== false
          return { t: r.start_et, s: r.summary, v: r.venue, live: needs }
        })
      ),
    }

    let html = TEMPLATE
    for (const [k, v] of Object.entries(tokens)) {
      html = html.split(`{{${k}}}`).join(v)
    }

    return new Response(html, {
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
    })
  } catch (err: any) {
    console.error('[live] render error', err)
    return new Response(`Live showcase temporarily unavailable.`, {
      status: 500,
      headers: { 'content-type': 'text/plain' },
    })
  }
}
