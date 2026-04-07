import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { notifyOps } from '@/lib/slack'
import { geocodeAddress } from '@/lib/geocode'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const venueId = params.id

    // Get venue details
    const venueResult = await query(
      `SELECT
        v.id,
        v.name,
        m.name as market_name,
        v.address,
        v.slack_channel_id,
        v.service_responsibilities,
        v.primary_contact_name,
        v.primary_contact_email,
        v.requires_assignment,
        v.portal_token,
        COALESCE(v.venue_type, 'sports') as venue_type,
        COALESCE(v.distribution_emails, '{}') as distribution_emails,
        v.venue_manager_id,
        v.lead_field_rep_id,
        sm.full_name as venue_manager_name,
        sl.full_name as lead_field_rep_name,
        v.logo_url,
        v.cover_image_url,
        COALESCE(v.is_active, true) as is_active,
        v.feed_url,
        COALESCE(v.feed_type, 'other') as feed_type,
        v.last_feed_synced_at,
        v.last_feed_sync_status
      FROM venues v
      LEFT JOIN markets m ON v.market_id = m.id
      LEFT JOIN staff sm ON v.venue_manager_id = sm.id
      LEFT JOIN staff sl ON v.lead_field_rep_id = sl.id
      WHERE v.id = $1`,
      [venueId]
    )

    if (venueResult.rows.length === 0) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
    }

    const venue = venueResult.rows[0]

    // Get upcoming events (next 30 days)
    const today = new Date().toISOString().split('T')[0]
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const eventsResult = await query(
      `SELECT 
        e.id,
        e.summary as event_name,
        e.league,
        TO_CHAR(e.event_date, 'YYYY-MM-DD') as event_date,
        e.start_time,
        e.workflow_status,
        STRING_AGG(s.full_name, ', ' ORDER BY s.full_name) as assigned_techs
      FROM events e
      LEFT JOIN event_assignments ea ON e.id = ea.event_id
      LEFT JOIN staff s ON ea.staff_id = s.id
      WHERE e.venue_id = $1 
        AND e.event_date >= $2 
        AND e.event_date <= $3
      GROUP BY e.id, e.summary, e.league, e.event_date, e.start_time, e.workflow_status
      ORDER BY e.start_time`,
      [venueId, today, thirtyDaysFromNow]
    )

    // Get assigned staff at this venue
    const staffResult = await query(
      `SELECT DISTINCT
        s.id,
        s.full_name,
        s.role
      FROM staff s
      JOIN event_assignments ea ON s.id = ea.staff_id
      JOIN events e ON ea.event_id = e.id
      WHERE e.venue_id = $1
      ORDER BY s.full_name`,
      [venueId]
    )

    // Get venue services
    const servicesResult = await query(
      `SELECT st.id as service_type_id, st.name, st.description,
              COALESCE(vs.enabled, false) as enabled
       FROM service_types st
       LEFT JOIN venue_services vs ON st.id = vs.service_type_id AND vs.venue_id = $1
       ORDER BY st.name`,
      [venueId]
    )

    return NextResponse.json({
      venue,
      upcomingEvents: eventsResult.rows,
      assignedStaff: staffResult.rows,
      venueServices: servicesResult.rows,
    })
  } catch (err) {
    console.error('Error fetching venue:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const venueId = params.id
    const body = await request.json()

    // Direct field updates
    for (const field of ['name', 'address', 'primary_contact_name', 'primary_contact_email']) {
      if (body[field] !== undefined) {
        await query(`UPDATE venues SET ${field} = $1 WHERE id = $2`, [body[field], venueId])
      }
    }

    if (body.feed_url !== undefined) {
      const normalizedFeedUrl = typeof body.feed_url === 'string' && body.feed_url.trim() ? body.feed_url.trim() : null
      await query(`UPDATE venues SET feed_url = $1 WHERE id = $2`, [normalizedFeedUrl, venueId])
    }

    if (body.feed_type !== undefined) {
      const validFeedTypes = ['ticketmaster', 'team-website', 'league-page', 'ical', 'other']
      const nextFeedType = validFeedTypes.includes(body.feed_type) ? body.feed_type : 'other'
      await query(`UPDATE venues SET feed_type = $1 WHERE id = $2`, [nextFeedType, venueId])
    }

    // Geocode if address changed
    if (body.address !== undefined && body.address) {
      geocodeAddress(body.address).then(geo => {
        if (geo.lat && geo.lng) {
          query('UPDATE venues SET latitude = $1, longitude = $2 WHERE id = $3', [geo.lat, geo.lng, venueId])
        }
      }).catch(err => console.warn('Geocoding failed:', err))
    }

    // Handle service toggle
    if (body.service_type_id !== undefined) {
      if (body.enabled) {
        await query(
          `INSERT INTO venue_services (venue_id, service_type_id, enabled)
           VALUES ($1, $2, true)
           ON CONFLICT (venue_id, service_type_id) DO UPDATE SET enabled = true`,
          [venueId, body.service_type_id]
        )
      } else {
        await query(
          `INSERT INTO venue_services (venue_id, service_type_id, enabled)
           VALUES ($1, $2, false)
           ON CONFLICT (venue_id, service_type_id) DO UPDATE SET enabled = false`,
          [venueId, body.service_type_id]
        )
      }
    }

    // Handle is_active toggle
    if (body.is_active !== undefined) {
      await query(`UPDATE venues SET is_active = $1 WHERE id = $2`, [body.is_active, venueId])
    }

    // Handle requires_assignment toggle
    if (body.requires_assignment !== undefined) {
      await query(
        `UPDATE venues SET requires_assignment = $1 WHERE id = $2`,
        [body.requires_assignment, venueId]
      )
    }

    // Handle slack_channel_id
    if (body.slack_channel_id !== undefined) {
      await query(
        `UPDATE venues SET slack_channel_id = $1 WHERE id = $2`,
        [body.slack_channel_id, venueId]
      )
    }

    // Handle venue_type
    if (body.venue_type !== undefined) {
      const validTypes = ['sports', 'ooh', 'facility']
      if (validTypes.includes(body.venue_type)) {
        await query(
          `UPDATE venues SET venue_type = $1 WHERE id = $2`,
          [body.venue_type, venueId]
        )
      }
    }

    // Handle distribution_emails
    if (body.distribution_emails !== undefined) {
      const emails = Array.isArray(body.distribution_emails) ? body.distribution_emails.filter((e: string) => e && e.includes('@')) : []
      await query(
        `UPDATE venues SET distribution_emails = $1 WHERE id = $2`,
        [emails, venueId]
      )
    }

    // Handle venue_manager_id
    if (body.venue_manager_id !== undefined) {
      await query(
        `UPDATE venues SET venue_manager_id = $1 WHERE id = $2`,
        [body.venue_manager_id, venueId]
      )
    }

    // Handle lead_field_rep_id
    if (body.lead_field_rep_id !== undefined) {
      await query(
        `UPDATE venues SET lead_field_rep_id = $1 WHERE id = $2`,
        [body.lead_field_rep_id, venueId]
      )
    }

    // Fetch full venue data
    const fullVenue = await query(
      `SELECT
        v.id,
        v.name,
        m.name as market_name,
        v.address,
        v.slack_channel_id,
        v.service_responsibilities,
        v.primary_contact_name,
        v.primary_contact_email,
        v.requires_assignment,
        v.portal_token,
        COALESCE(v.venue_type, 'sports') as venue_type,
        COALESCE(v.distribution_emails, '{}') as distribution_emails,
        v.venue_manager_id,
        v.lead_field_rep_id,
        sm.full_name as venue_manager_name,
        sl.full_name as lead_field_rep_name,
        v.logo_url,
        v.cover_image_url,
        COALESCE(v.is_active, true) as is_active,
        v.feed_url,
        COALESCE(v.feed_type, 'other') as feed_type,
        v.last_feed_synced_at,
        v.last_feed_sync_status
      FROM venues v
      LEFT JOIN markets m ON v.market_id = m.id
      LEFT JOIN staff sm ON v.venue_manager_id = sm.id
      LEFT JOIN staff sl ON v.lead_field_rep_id = sl.id
      WHERE v.id = $1`,
      [venueId]
    )

    if (fullVenue.rows.length === 0) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
    }

    // Get updated services
    const servicesResult = await query(
      `SELECT st.id as service_type_id, st.name, st.description,
              COALESCE(vs.enabled, false) as enabled
       FROM service_types st
       LEFT JOIN venue_services vs ON st.id = vs.service_type_id AND vs.venue_id = $1
       ORDER BY st.name`,
      [venueId]
    )

    const v = fullVenue.rows[0]
    const changes = Object.keys(body).filter(k => k !== 'service_type_id' && k !== 'enabled').join(', ')
    const detail = body.service_type_id ? `service toggled` : changes || 'settings updated'
    notifyOps(':gear:', `*Venue updated:* ${v.name} — ${detail}`, { label: 'View Venue', url: `https://abc-anc-services.izcgmb.easypanel.host/venues/${v.id}` }, v.slack_channel_id)

    return NextResponse.json({ venue: v, venueServices: servicesResult.rows })
  } catch (err) {
    console.error('Error updating venue:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
