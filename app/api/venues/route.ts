import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/rbac'
import { getStaffVenueIds, buildVenueFilterClause } from '@/lib/venue-filter'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') || 'week'
    const includeInactive = searchParams.get('include_inactive') === 'true'

    const user = await getAuthUser(request)
    const venueIds = user ? await getStaffVenueIds(user.userId, user.role) : null
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
        COUNT(e.id) as event_count,
        COUNT(CASE WHEN ea.event_id IS NOT NULL THEN 1 END) as assigned_count
      FROM venues v
      LEFT JOIN markets m ON v.market_id = m.id
      LEFT JOIN events e ON v.id = e.venue_id ${dateFilter}
      LEFT JOIN (SELECT DISTINCT event_id FROM event_assignments) ea ON e.id = ea.event_id
      ${whereClause}
      GROUP BY v.id, v.name, m.name, v.requires_assignment, v.portal_token, v.primary_contact_name, v.primary_contact_email, v.venue_type, v.is_active
      ORDER BY v.name`,
      [...vf.params]
    )

    return NextResponse.json({ venues: result.rows })
  } catch (err) {
    console.error('Error fetching venues:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
