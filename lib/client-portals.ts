import { randomBytes } from 'crypto'
import { getClient, query } from '@/lib/db'
import {
  Inventory,
  dashboardVenueIdToTwentyId,
  isTwentyBackedEnabled,
} from '@/lib/twenty-ops'

export interface ClientPortalRecord {
  id: string
  token: string
  twenty_venue_id: string | null
  dashboard_venue_id: string
  created_by_email: string
  expires_at: string | null
  created_at: string
  last_viewed_at: string | null
  view_count: number
  revoked_at: string | null
}

export interface ClientPortalVenue {
  id: string
  name: string
  address: string | null
  primary_contact_name: string | null
  primary_contact_email: string | null
  twenty_id: string | null
}

export interface ClientPortalListItem extends ClientPortalRecord {
  venue_name: string
}

export interface PortalTicketSummary {
  id: string
  ticket_number: number
  title: string
  priority: string
  status: string
  category: string | null
  created_at: string
  updated_at: string
}

export interface PortalMaintenanceSummary {
  id: string
  issue: string | null
  issue_summary: string | null
  status: string
  maintenance_type: string
  reported_date: string | null
  scheduled_date: string | null
  completed_date: string | null
  updated_at: string
  technician_name: string | null
  asset_name: string | null
}

export interface ClientPortalPublicData {
  portal: {
    id: string
    token: string
    created_at: string
    expires_at: string | null
    last_viewed_at: string | null
    view_count: number
  }
  venue: {
    id: string
    name: string
    address: string | null
    primary_contact_name: string | null
    primary_contact_email: string | null
  }
  stats: {
    total_displays: number
    displays_with_open_issues: number
    displays_offline: number
    open_tickets: number
  }
  open_tickets: PortalTicketSummary[]
  maintenance_logs: PortalMaintenanceSummary[]
}

const MAINTENANCE_CLOSED_STATUSES = ['completed', 'cancelled', 'resolved', 'skipped', 'complete', 'closed']
const OFFLINE_PATTERN = '(offline|down|dark|blank|black screen|no signal|outage)'

export function generateClientPortalToken() {
  return randomBytes(32).toString('base64url')
}

export function buildClientPortalUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, '')}/portals/${token}`
}

export async function getVenueForPortal(venueId: string): Promise<ClientPortalVenue | null> {
  const result = await query(
    `SELECT id, name, address, primary_contact_name, primary_contact_email, twenty_id
     FROM venues
     WHERE id = $1`,
    [venueId]
  )

  return result.rows[0] || null
}

export async function listClientPortalsForVenue(venueId: string): Promise<ClientPortalListItem[]> {
  const result = await query(
    `SELECT cp.*, v.name AS venue_name
     FROM client_portals cp
     JOIN venues v ON v.id = cp.dashboard_venue_id
     WHERE cp.dashboard_venue_id = $1
     ORDER BY (cp.revoked_at IS NULL) DESC, cp.created_at DESC`,
    [venueId]
  )

  return result.rows
}

export async function createClientPortal(params: {
  venueId: string
  createdByEmail: string
  expiresAt?: string | null
}) {
  const venue = await getVenueForPortal(params.venueId)
  if (!venue) throw new Error('Venue not found')

  const twentyVenueId =
    venue.twenty_id && /^[0-9a-f-]{36}$/i.test(venue.twenty_id)
      ? venue.twenty_id
      : await dashboardVenueIdToTwentyId(params.venueId)

  const token = generateClientPortalToken()
  const result = await query(
    `INSERT INTO client_portals (
       token,
       twenty_venue_id,
       dashboard_venue_id,
       created_by_email,
       expires_at
     ) VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [token, twentyVenueId, params.venueId, params.createdByEmail, params.expiresAt || null]
  )

  return {
    portal: result.rows[0] as ClientPortalRecord,
    venue,
  }
}

export async function revokeClientPortal(id: string) {
  const result = await query(
    `UPDATE client_portals
     SET revoked_at = COALESCE(revoked_at, NOW())
     WHERE id = $1
     RETURNING *`,
    [id]
  )

  return result.rows[0] || null
}

async function countDisplaysFromTwentyInventory(dashboardVenueId: string): Promise<number> {
  const twentyVenueId = await dashboardVenueIdToTwentyId(dashboardVenueId)
  if (!twentyVenueId) return 0

  let total = 0
  let cursor: string | null = null

  for (let page = 0; page < 50; page++) {
    const response = await Inventory.list({
      limit: 60,
      startingAfter: cursor || undefined,
      filter: `assetVenueId[eq]:"${twentyVenueId}"`,
      orderBy: 'updatedAt[DescNullsLast]',
    })
    total += response.items.length
    if (!response.hasNextPage || !response.nextCursor) break
    cursor = response.nextCursor
  }

  return total
}

async function getDisplayCount(venueId: string): Promise<number> {
  const screensResult = await query(
    `SELECT COUNT(*)::int AS count
     FROM venue_screens
     WHERE venue_id = $1
       AND COALESCE(is_active, true) = true`,
    [venueId]
  )

  const screensCount = Number(screensResult.rows[0]?.count || 0)
  if (screensCount > 0) return screensCount

  if (isTwentyBackedEnabled('INVENTORY')) {
    return countDisplaysFromTwentyInventory(venueId)
  }

  const inventoryResult = await query(
    `SELECT COUNT(*)::int AS count
     FROM inventory
     WHERE venue_id = $1`,
    [venueId]
  )

  return Number(inventoryResult.rows[0]?.count || 0)
}

async function getPortalMetrics(venueId: string) {
  const [issueResult, offlineResult, openTicketCountResult] = await Promise.all([
    query(
      `SELECT COUNT(DISTINCT asset_id)::int AS count
       FROM maintenance_logs
       WHERE venue_id = $1
         AND asset_id IS NOT NULL
         AND status <> ALL($2::text[])`,
      [venueId, MAINTENANCE_CLOSED_STATUSES]
    ),
    query(
      `SELECT COUNT(DISTINCT asset_id)::int AS count
       FROM maintenance_logs
       WHERE venue_id = $1
         AND asset_id IS NOT NULL
         AND status <> ALL($2::text[])
         AND LOWER(CONCAT_WS(' ', issue, issue_summary, details_to_resolve, location_reported)) ~ $3`,
      [venueId, MAINTENANCE_CLOSED_STATUSES, OFFLINE_PATTERN]
    ),
    query(
      `SELECT COUNT(*)::int AS count
       FROM tickets
       WHERE venue_id = $1
         AND status <> 'closed'`,
      [venueId]
    ),
  ])

  const totalDisplays = await getDisplayCount(venueId)
  const displaysWithOpenIssues = Math.min(Number(issueResult.rows[0]?.count || 0), totalDisplays || Number.MAX_SAFE_INTEGER)
  const displaysOffline = Math.min(Number(offlineResult.rows[0]?.count || 0), totalDisplays || Number.MAX_SAFE_INTEGER)
  const openTickets = Number(openTicketCountResult.rows[0]?.count || 0)

  return {
    total_displays: totalDisplays,
    displays_with_open_issues: displaysWithOpenIssues,
    displays_offline: displaysOffline,
    open_tickets: openTickets,
  }
}

export async function getClientPortalPublicData(token: string): Promise<ClientPortalPublicData | null> {
  const client = await getClient()

  try {
    await client.query('BEGIN')

    const portalResult = await client.query(
      `SELECT cp.id, cp.token, cp.created_at, cp.expires_at, cp.last_viewed_at, cp.view_count,
              cp.revoked_at, cp.dashboard_venue_id,
              v.name, v.address, v.primary_contact_name, v.primary_contact_email
       FROM client_portals cp
       JOIN venues v ON v.id = cp.dashboard_venue_id
       WHERE cp.token = $1
       LIMIT 1`,
      [token]
    )

    if (portalResult.rows.length === 0) {
      await client.query('ROLLBACK')
      return null
    }

    const portal = portalResult.rows[0]
    if (portal.revoked_at) {
      await client.query('ROLLBACK')
      return null
    }

    if (portal.expires_at && new Date(portal.expires_at) <= new Date()) {
      await client.query('ROLLBACK')
      return null
    }

    const viewResult = await client.query(
      `UPDATE client_portals
       SET view_count = view_count + 1,
           last_viewed_at = NOW()
       WHERE token = $1
       RETURNING view_count, last_viewed_at`,
      [token]
    )

    await client.query('COMMIT')

    const [stats, ticketsResult, maintenanceResult] = await Promise.all([
      getPortalMetrics(portal.dashboard_venue_id),
      query(
        `SELECT id, ticket_number, title, priority, status, category, created_at, updated_at
         FROM tickets
         WHERE venue_id = $1
           AND status <> 'closed'
         ORDER BY created_at DESC
         LIMIT 10`,
        [portal.dashboard_venue_id]
      ),
      query(
        `SELECT m.id, m.issue, m.issue_summary, m.status, m.maintenance_type,
                m.reported_date, m.scheduled_date, m.completed_date,
                COALESCE(m.updated_at, m.created_at) AS updated_at,
                s.full_name AS technician_name,
                i.item_name AS asset_name
         FROM maintenance_logs m
         LEFT JOIN staff s ON s.id = m.technician_id
         LEFT JOIN inventory i ON i.id = m.asset_id
         WHERE m.venue_id = $1
         ORDER BY COALESCE(m.updated_at, m.created_at) DESC
         LIMIT 10`,
        [portal.dashboard_venue_id]
      ),
    ])

    return {
      portal: {
        id: portal.id,
        token: portal.token,
        created_at: portal.created_at,
        expires_at: portal.expires_at,
        last_viewed_at: viewResult.rows[0]?.last_viewed_at || portal.last_viewed_at,
        view_count: Number(viewResult.rows[0]?.view_count || portal.view_count || 0),
      },
      venue: {
        id: portal.dashboard_venue_id,
        name: portal.name,
        address: portal.address,
        primary_contact_name: portal.primary_contact_name,
        primary_contact_email: portal.primary_contact_email,
      },
      stats,
      open_tickets: ticketsResult.rows,
      maintenance_logs: maintenanceResult.rows,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
