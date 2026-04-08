import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request)
    const venueIds = user ? await getStaffVenueIds(user.userId, user.role) : null
    const vf = buildVenueFilterClause(venueIds, 'v.id', 1)

    const result = await query(
      `SELECT
        v.id,
        v.name,
        v.address,
        m.name as market,
        COALESCE(v.venue_type, 'sports') as venue_type,
        v.logo_url,
        v.latitude,
        v.longitude,
        COALESCE(v.is_active, true) as is_active,
        v.requires_assignment,
        COUNT(DISTINCT e.id) as event_count,
        COALESCE(
          array_remove(array_agg(DISTINCT CASE WHEN vs.enabled = true THEN st.name END), NULL),
          '{}'
        ) as service_names
      FROM venues v
      LEFT JOIN markets m ON v.market_id = m.id
      LEFT JOIN events e ON v.id = e.venue_id AND e.event_date >= CURRENT_DATE AND e.event_date < CURRENT_DATE + INTERVAL '30 days'
      LEFT JOIN venue_services vs ON vs.venue_id = v.id
      LEFT JOIN service_types st ON st.id = vs.service_type_id
      WHERE v.is_active = true ${vf.clause}
      GROUP BY v.id, v.name, v.address, m.name, v.venue_type, v.logo_url, v.latitude, v.longitude, v.is_active, v.requires_assignment
      ORDER BY v.name`,
      [...vf.params]
    )

    // Get staff assignments per venue
    const staffResult = await query(
      `SELECT sv.venue_id, s.id as staff_id, s.full_name, s.role
       FROM staff_venues sv
       JOIN staff s ON sv.staff_id = s.id
       WHERE s.is_active = true OR s.is_active IS NULL`
    )

    const staffByVenue: Record<string, Array<{ id: string; name: string; role: string }>> = {}
    for (const row of staffResult.rows) {
      if (!staffByVenue[row.venue_id]) staffByVenue[row.venue_id] = []
      staffByVenue[row.venue_id].push({ id: row.staff_id, name: row.full_name, role: row.role })
    }

    // Collect all unique service types across all venues
    const allServiceTypes = new Set<string>()

    const venues = result.rows.map(v => {
      const services: string[] = Array.isArray(v.service_names) ? v.service_names : []
      services.forEach(s => allServiceTypes.add(s))
      return {
        id: v.id,
        name: v.name,
        address: v.address,
        market: v.market,
        venue_type: v.venue_type,
        logo_url: v.logo_url,
        lat: v.latitude,
        lng: v.longitude,
        event_count: Number(v.event_count) || 0,
        requires_assignment: v.requires_assignment,
        staff: staffByVenue[v.id] || [],
        services,
      }
    })

    // Group by approximate state (from address parsing)
    const statePattern = /\b([A-Z]{2})\s+\d{5}\b/
    const byState: Record<string, { name: string; abbr: string; lat: number; lng: number; venues: typeof venues }> = {}
    
    for (const v of venues) {
      if (!v.lat || !v.lng) continue
      
      // Try to extract state from address
      const match = v.address?.match(statePattern)
      const stateAbbr = match ? match[1] : null
      
      if (stateAbbr) {
        if (!byState[stateAbbr]) {
          byState[stateAbbr] = {
            name: stateAbbr,
            abbr: stateAbbr,
            lat: v.lat,
            lng: v.lng,
            venues: [],
          }
        }
        byState[stateAbbr].venues.push(v)
      }
    }

    const unmapped = venues.filter(v => !v.lat || !v.lng)

    return NextResponse.json({
      venues,
      byState,
      unmapped,
      totalVenues: venues.length,
      mappedVenues: venues.length - unmapped.length,
      stateCount: Object.keys(byState).length,
      serviceTypes: [...allServiceTypes].sort(),
    })
  } catch (err) {
    console.error('Error fetching venue map data:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
