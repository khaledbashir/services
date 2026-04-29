import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'
import { buildAutomationSelect, classifyVenueAutomationStatus, withComputedAutomation } from '@/lib/venue-automation'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'week'
    const includeInactive = searchParams.get('include_inactive') === 'true'
    const assignedToMe = searchParams.get('assigned_to_me') === 'true'

    const user = await getAuthUser(request)
    let venueIds = user ? await getStaffVenueIds(user.userId, user.role) : null
    // "My Venues": admins/managers can opt into the technician-style filter so
    // they only see venues they're personally linked to. Technicians already
    // see only their linked venues, so the param is a no-op for them.
    if (assignedToMe && user) {
      const mine = await query(
        `SELECT venue_id FROM staff_venues WHERE staff_id = $1`,
        [user.userId]
      )
      venueIds = mine.rows.map((r: any) => r.venue_id.toString())
    }
    const vf = buildVenueFilterClause(venueIds, 'v.id', 1)

    let dateFilter: string
    if (period === 'today') {
      dateFilter = `AND e.event_date = CURRENT_DATE`
    } else if (period === 'week') {
      dateFilter = `AND e.event_date >= CURRENT_DATE AND e.event_date < CURRENT_DATE + INTERVAL '7 days'`
    } else {
      dateFilter = `AND e.event_date >= DATE_TRUNC('month', CURRENT_DATE) AND e.event_date < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'`
    }

    const activeFilter = includeInactive ? '' : `AND v.is_active = true`

    // Convert venue filter for WHERE clause
    let whereClause = ''
    const whereParts = []
    if (vf.clause) whereParts.push(vf.clause.replace(/^AND /, ''))
    if (!includeInactive) whereParts.push(`v.is_active = true`)
    if (whereParts.length) whereClause = 'WHERE ' + whereParts.join(' AND ')

    const result = await query(
      `SELECT
        v.id,
        v.name,
        m.name as market,
        v.requires_assignment,
        v.portal_token,
        v.primary_contact_name,
        v.primary_contact_email,
        COALESCE(v.venue_type, 'sports') as venue_type,
        v.logo_url,
        COALESCE(v.is_active, true) as is_active,
        v.feed_url,
        COUNT(DISTINCT cv.client_id)::int as client_count,
        -- Distinct sports across the venue's linked clients. Used by the
        -- design module's left-rail venue tree to bucket venues into
        -- League groups (College / MLB / MiLB / NBA / WNBA / NHL / NFL).
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(c.sport, '')), NULL) as sports,
        ${buildAutomationSelect('v', 'vs', 'st')},
        COUNT(DISTINCT e.id) as event_count,
        COUNT(DISTINCT CASE WHEN ea.event_id IS NOT NULL THEN e.id END) as assigned_count
      FROM venues v
      LEFT JOIN markets m ON v.market_id = m.id
      LEFT JOIN client_venues cv ON cv.venue_id = v.id
      LEFT JOIN clients c ON c.id = cv.client_id
      LEFT JOIN client_services vs ON vs.client_id = cv.client_id
      LEFT JOIN service_types st ON st.id = vs.service_type_id
      LEFT JOIN events e ON v.id = e.venue_id ${dateFilter}
      LEFT JOIN (SELECT DISTINCT event_id FROM event_assignments) ea ON e.id = ea.event_id
      ${whereClause}
      GROUP BY v.id, v.name, m.name, v.requires_assignment, v.portal_token, v.primary_contact_name, v.primary_contact_email, v.venue_type, v.is_active, v.feed_url
      ORDER BY v.name`,
      [...vf.params]
    )
    const venues = result.rows.map((row) => {
      const hydrated = withComputedAutomation(row)
      return {
        ...hydrated,
        automation_status: classifyVenueAutomationStatus({
          is_active: Boolean(hydrated.is_active),
          active_service_count: hydrated.active_service_count,
          feed_url: hydrated.feed_url,
        }),
      }
    })

    return NextResponse.json({ venues })
  } catch (err) {
    console.error('Error fetching venues:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
