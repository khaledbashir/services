import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { notifyOps } from '@/lib/slack'
import { geocodeAddress } from '@/lib/geocode'
import { twentyClient } from '@/lib/twenty-client'

async function getVenuePrimaryClientId(venueId: string): Promise<string | null> {
  const result = await query(
    `SELECT cv.client_id
     FROM client_venues cv
     WHERE cv.venue_id = $1
     ORDER BY CASE WHEN cv.relation_type = 'primary' THEN 0 ELSE 1 END, cv.created_at ASC
     LIMIT 1`,
    [venueId]
  )
  return result.rows[0]?.client_id || null
}

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
        COALESCE(v.timezone, 'America/New_York') as timezone,
        v.last_feed_synced_at,
        v.last_feed_sync_status,
        primary_client.id as primary_client_id,
        primary_client.name as primary_client_name
      FROM venues v
      LEFT JOIN markets m ON v.market_id = m.id
      LEFT JOIN staff sm ON v.venue_manager_id = sm.id
      LEFT JOIN staff sl ON v.lead_field_rep_id = sl.id
      LEFT JOIN LATERAL (
        SELECT c.id, c.name
        FROM client_venues cv
        JOIN clients c ON c.id = cv.client_id
        WHERE cv.venue_id = v.id
        ORDER BY CASE WHEN cv.relation_type = 'primary' THEN 0 ELSE 1 END, c.name ASC
        LIMIT 1
      ) primary_client ON true
      WHERE v.id = $1`,
      [venueId]
    )

    if (venueResult.rows.length === 0) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
    }

    const venue = venueResult.rows[0]

    const linkedClientsResult = await query(
      `SELECT c.id, c.name, c.client_kind, c.sport, cv.relation_type
       FROM client_venues cv
       JOIN clients c ON c.id = cv.client_id
       WHERE cv.venue_id = $1
       ORDER BY CASE WHEN cv.relation_type = 'primary' THEN 0 ELSE 1 END, c.name ASC`,
      [venueId]
    )

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

    const primaryClientId = venue.primary_client_id || await getVenuePrimaryClientId(venueId)

    // Get venue services
    const servicesResult = await query(
      `SELECT st.id as service_type_id, st.name, st.description,
              COALESCE(vs.enabled, false) as enabled
       FROM service_types st
       LEFT JOIN client_services vs ON st.id = vs.service_type_id AND vs.client_id = $1
       ORDER BY st.name`,
      [primaryClientId]
    )

    // Creative requests tied to this venue — design / CG / print / content schedule
    const [designRows, cgRows, printRows, contentRows] = await Promise.all([
      query(
        `SELECT id, job_title, status, due_date, hours_estimated, hours_spent,
                TO_CHAR(created_at, 'YYYY-MM-DD') as created_at
         FROM design_requests WHERE venue_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [venueId]
      ),
      query(
        `SELECT id, job_title, league, team_name, status, due_date,
                TO_CHAR(created_at, 'YYYY-MM-DD') as created_at
         FROM cg_design_requests WHERE venue_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [venueId]
      ),
      query(
        `SELECT id, job_title, client_name, status, ship_date, arrival_date,
                TO_CHAR(created_at, 'YYYY-MM-DD') as created_at
         FROM print_requests WHERE venue_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [venueId]
      ),
      query(
        `SELECT id, content_name, company_name, status, launch_date, end_date,
                TO_CHAR(created_at, 'YYYY-MM-DD') as created_at
         FROM content_schedules WHERE venue_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [venueId]
      ),
    ])
    const creative = {
      designRequests: designRows.rows,
      cgDesigns: cgRows.rows,
      printRequests: printRows.rows,
      contentSchedules: contentRows.rows,
      totalCount: designRows.rows.length + cgRows.rows.length + printRows.rows.length + contentRows.rows.length,
    }

    // Enrich with Twenty CRM data (non-fatal)
    let twentyCrm: Record<string, unknown> | null = null
    if (twentyClient.isConfigured()) {
      try {
        const twentyVenues = await twentyClient.getVenues()
        const matched = twentyVenues.find(
          tv => tv.servicesId === venueId || tv.name.toLowerCase() === venue.name.toLowerCase()
        )
        if (matched) {
          const [crmServices, company] = await Promise.all([
            twentyClient.getServices(`venueId[eq]:"${matched.id}"`),
            matched.companyId ? twentyClient.getCompany(matched.companyId) : null,
          ])
          twentyCrm = {
            venueId: matched.id,
            venueStatus: matched.venueStatus,
            hasContractedServices: matched.hasContractedServices,
            services: crmServices,
            company,
          }
        }
      } catch (err) {
        console.warn('Twenty CRM enrichment failed (non-fatal):', err)
      }
    }

    return NextResponse.json({
      venue,
      linkedClients: linkedClientsResult.rows,
      upcomingEvents: eventsResult.rows,
      assignedStaff: staffResult.rows,
      venueServices: servicesResult.rows,
      creative,
      twentyCrm,
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

    let feedChanged = false
    let normalizedFeedUrl: string | null = null
    if (body.feed_url !== undefined) {
      // Strip any whitespace the user accidentally pasted inside the URL.
      normalizedFeedUrl = typeof body.feed_url === 'string' && body.feed_url.trim()
        ? body.feed_url.trim().replace(/\s+/g, '')
        : null
      await query(`UPDATE venues SET feed_url = $1 WHERE id = $2`, [normalizedFeedUrl, venueId])
      feedChanged = feedChanged || !!normalizedFeedUrl
    }

    if (body.feed_type !== undefined) {
      const validFeedTypes = ['ticketmaster', 'team-website', 'league-page', 'mlb-schedule', 'ical', 'other']
      const nextFeedType = validFeedTypes.includes(body.feed_type) ? body.feed_type : 'other'
      await query(`UPDATE venues SET feed_type = $1 WHERE id = $2`, [nextFeedType, venueId])
      feedChanged = true
    }

    // Smart auto-detect: if the URL obviously belongs to a different
    // parser than what the user selected, overwrite feed_type to match.
    // Saves Chris from the "picked Ticketmaster but pasted mlb.com" trap.
    if (feedChanged) {
      const row = await query(`SELECT feed_url, feed_type FROM venues WHERE id = $1`, [venueId])
      const url = (row.rows[0]?.feed_url || '').toLowerCase()
      let inferred: string | null = null
      if (/statsapi\.mlb\.com|mlb\.com\/[^/]+\/schedule/.test(url)) inferred = 'mlb-schedule'
      else if (/ticketmaster\.(com|ca)/.test(url)) inferred = 'ticketmaster'
      else if (/\.(ics|ical)(\?|$)/.test(url) || /\/ical/.test(url)) inferred = 'ical'
      if (inferred && inferred !== row.rows[0]?.feed_type) {
        await query(`UPDATE venues SET feed_type = $1 WHERE id = $2`, [inferred, venueId])
      }
    }

    // Auto-sync the feed right after the manager saves it — Joe's team
    // shouldn't need to know about cron URLs. Fire-and-forget so the PATCH
    // response returns instantly; the UI will pick up new events on its
    // next refetch.
    if (feedChanged) {
      const savingUserId = (auth as { userId: string }).userId
      import('@/lib/feed-sync').then(async ({ syncVenueFeed }) => {
        const venueRow = await query(
          `SELECT v.id, v.name, v.address, v.feed_url,
                  COALESCE(v.feed_type, 'other') as feed_type,
                  0 AS active_service_count,
                  ARRAY[]::text[] AS active_service_names,
                  ARRAY[]::text[] AS active_service_descriptions,
                  true AS requires_staffing_default
           FROM venues v WHERE v.id = $1 AND COALESCE(v.feed_url,'') <> ''`,
          [venueId]
        )
        if (venueRow.rows[0]) {
          // syncVenueFeed writes its own discovery_log row, stamped with the
          // saving user + trigger='auto_save' so the audit page knows who
          // pasted the URL.
          await syncVenueFeed(venueRow.rows[0], { triggeredByUserId: savingUserId, trigger: 'auto_save' })
        }
      }).catch((err) => console.warn('Post-save feed auto-sync failed:', err))
    }

    if (body.timezone !== undefined) {
      const tz = typeof body.timezone === 'string' && body.timezone.trim() ? body.timezone.trim() : 'America/New_York'
      await query(`UPDATE venues SET timezone = $1 WHERE id = $2`, [tz, venueId])
    }

    // Geocode if address changed
    if (body.address !== undefined && body.address) {
      geocodeAddress(body.address).then(geo => {
        if (geo.lat && geo.lng) {
          query('UPDATE venues SET latitude = $1, longitude = $2 WHERE id = $3', [geo.lat, geo.lng, venueId])
        }
      }).catch(err => console.warn('Geocoding failed:', err))
    }

    const primaryClientId = await getVenuePrimaryClientId(venueId)

    // Handle service toggle
    if (body.service_type_id !== undefined) {
      if (!primaryClientId) {
        return NextResponse.json({ error: 'Link a client to this venue before toggling services' }, { status: 400 })
      }
      if (body.enabled) {
        await query(
          `INSERT INTO client_services (client_id, service_type_id, enabled)
           VALUES ($1, $2, true)
           ON CONFLICT (client_id, service_type_id) DO UPDATE SET enabled = true, updated_at = NOW()`,
          [primaryClientId, body.service_type_id]
        )
      } else {
        await query(
          `INSERT INTO client_services (client_id, service_type_id, enabled)
           VALUES ($1, $2, false)
           ON CONFLICT (client_id, service_type_id) DO UPDATE SET enabled = false, updated_at = NOW()`,
          [primaryClientId, body.service_type_id]
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
        COALESCE(v.timezone, 'America/New_York') as timezone,
        v.last_feed_synced_at,
        v.last_feed_sync_status,
        primary_client.id as primary_client_id,
        primary_client.name as primary_client_name
      FROM venues v
      LEFT JOIN markets m ON v.market_id = m.id
      LEFT JOIN staff sm ON v.venue_manager_id = sm.id
      LEFT JOIN staff sl ON v.lead_field_rep_id = sl.id
      LEFT JOIN LATERAL (
        SELECT c.id, c.name
        FROM client_venues cv
        JOIN clients c ON c.id = cv.client_id
        WHERE cv.venue_id = v.id
        ORDER BY CASE WHEN cv.relation_type = 'primary' THEN 0 ELSE 1 END, c.name ASC
        LIMIT 1
      ) primary_client ON true
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
       LEFT JOIN client_services vs ON st.id = vs.service_type_id AND vs.client_id = $1
       ORDER BY st.name`,
      [primaryClientId]
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
