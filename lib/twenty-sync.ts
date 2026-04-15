/**
 * Twenty CRM Sync Module
 *
 * Syncs events, tickets, and technicians from the Services Dashboard DB to Twenty CRM.
 * Handles venueId relation matching, ticketSource, staffingRequired, and opportunity creation.
 */

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''

interface TwentyVenue {
  id: string
  name: string
  servicesId: string
}

interface SyncResult {
  events: { synced: number; updated: number; errors: number }
  tickets: { synced: number; updated: number; errors: number }
  venueMatches: number
  venueUnmatched: string[]
}

// --- Rate Limiter ---
let _reqCount = 0
let _windowStart = Date.now()
const MAX_REQ_PER_MIN = 80 // buffer under 100 limit

async function rateLimitWait() {
  const now = Date.now()
  if (now - _windowStart > 60_000) {
    _reqCount = 0
    _windowStart = now
  }
  if (_reqCount >= MAX_REQ_PER_MIN) {
    const waitMs = 60_000 - (now - _windowStart) + 200
    await new Promise(r => setTimeout(r, waitMs))
    _reqCount = 0
    _windowStart = Date.now()
  }
  _reqCount++
}

// --- Core fetch with rate limiting + retry ---
async function twentyFetch(endpoint: string, options: RequestInit = {}, retries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    await rateLimitWait()
    const res = await fetch(`${TWENTY_BASE}/rest/${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${TWENTY_API_KEY}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    })
    if (res.ok || res.status < 500 || attempt === retries) return res
    // Exponential backoff on 5xx
    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)))
  }
  // Unreachable but satisfies TS
  return fetch(`${TWENTY_BASE}/rest/${endpoint}`, { ...options, headers: { 'Authorization': `Bearer ${TWENTY_API_KEY}`, 'Content-Type': 'application/json' } })
}

async function fetchAllTwenty<T>(endpoint: string): Promise<T[]> {
  const items: T[] = []
  let cursor: string | null = null

  for (let page = 0; page < 50; page++) {
    const url = cursor
      ? `${endpoint}?limit=60&starting_after=${cursor}`
      : `${endpoint}?limit=60`
    const res = await twentyFetch(url)
    const data = await res.json()
    const key = endpoint.split('?')[0]
    const records = data?.data?.[key] || []
    if (records.length === 0) break
    items.push(...records)
    if (!data?.pageInfo?.hasNextPage) break
    cursor = data.pageInfo.endCursor
  }

  return items
}

/** Build a map of venue name -> Twenty venue ID for matching */
async function buildVenueIndex(): Promise<Map<string, string>> {
  const venues = await fetchAllTwenty<TwentyVenue>('venues')
  const index = new Map<string, string>()

  for (const v of venues) {
    // Index by exact name (case-insensitive)
    index.set(v.name.toLowerCase(), v.id)
    // Also index by servicesId (Services Dashboard UUID)
    if (v.servicesId) {
      index.set(v.servicesId, v.id)
    }
  }

  return index
}

/** Look up a Twenty venue ID from a venue name */
function resolveVenueId(name: string, venueIndex: Map<string, string>): string | null {
  if (!name) return null

  // Try exact match
  const exact = venueIndex.get(name.toLowerCase())
  if (exact) return exact

  // Try partial match
  for (const [key, id] of venueIndex.entries()) {
    if (key.includes(name.toLowerCase()) || name.toLowerCase().includes(key)) {
      return id
    }
  }

  return null
}

/** Sync events from Services Dashboard DB to Twenty CRM */
export async function syncEventsToTwenty(
  dbEvents: Array<{
    id: string
    name: string
    event_date: string
    venue_name: string
    venue_id?: string
    league?: string
    workflow_status: string
    assigned_techs?: string
    summary?: string
    start_time?: string
  }>
): Promise<SyncResult['events'] & { venueMatches: number; venueUnmatched: string[] }> {
  if (!TWENTY_API_KEY) {
    console.warn('TWENTY_API_KEY not set, skipping Twenty sync')
    return { synced: 0, updated: 0, errors: 0, venueMatches: 0, venueUnmatched: [] }
  }

  const venueIndex = await buildVenueIndex()

  // Get existing Twenty events by servicesId for dedup
  const existingEvents = await fetchAllTwenty<{ id: string; servicesId: string }>('venueEvents')
  const existingByServicesId = new Map<string, string>()
  for (const e of existingEvents) {
    if (e.servicesId) existingByServicesId.set(e.servicesId, e.id)
  }

  let synced = 0, updated = 0, errors = 0, venueMatches = 0
  const venueUnmatched: string[] = []

  // Map workflow statuses
  const statusMap: Record<string, string> = {
    'pending': 'STATUS_PENDING',
    'confirmed': 'STATUS_CONFIRMED',
    'staffed': 'STATUS_STAFFED',
    'completed': 'STATUS_COMPLETED',
    'cancelled': 'STATUS_CANCELLED',
  }

  // Map leagues
  const leagueMap: Record<string, string> = {
    'NFL': 'LEAGUE_NFL',
    'NBA': 'LEAGUE_NBA',
    'MLB': 'LEAGUE_MLB',
    'MLS': 'LEAGUE_MLS',
    'NHL': 'LEAGUE_NHL',
    'NCAA': 'LEAGUE_NCAA',
  }

  for (const event of dbEvents) {
    try {
      const venueId = resolveVenueId(event.venue_name, venueIndex)
      if (venueId) {
        venueMatches++
      } else if (event.venue_name) {
        if (!venueUnmatched.includes(event.venue_name)) {
          venueUnmatched.push(event.venue_name)
        }
      }

      const hasAssignedTechs = !!(event.assigned_techs && event.assigned_techs.trim())

      const twentyData: Record<string, unknown> = {
        name: event.name,
        eventDate: event.event_date,
        venueName: event.venue_name || '',
        league: leagueMap[event.league || ''] || null,
        workflowStatus: statusMap[event.workflow_status] || 'STATUS_PENDING',
        assignedTechs: event.assigned_techs || '',
        summary: event.summary || event.name,
        servicesId: event.id,
        startTime: event.start_time || '',
        staffingRequired: hasAssignedTechs,
      }

      if (venueId) {
        twentyData.venueId = venueId
      }

      const existingId = existingByServicesId.get(event.id)

      if (existingId) {
        // Update existing
        const res = await twentyFetch(`venueEvents/${existingId}`, {
          method: 'PATCH',
          body: JSON.stringify(twentyData),
        })
        if (res.ok) {
          updated++
        } else {
          errors++
          console.error(`Failed to update event ${event.id}:`, await res.text())
        }
      } else {
        // Create new
        const res = await twentyFetch('venueEvents', {
          method: 'POST',
          body: JSON.stringify(twentyData),
        })
        if (res.ok) {
          synced++
        } else {
          errors++
          console.error(`Failed to create event ${event.id}:`, await res.text())
        }
      }
    } catch (err) {
      errors++
      console.error(`Error syncing event ${event.id}:`, err)
    }
  }

  return { synced, updated, errors, venueMatches, venueUnmatched }
}

/** Sync tickets from Services Dashboard DB to Twenty CRM */
export async function syncTicketsToTwenty(
  dbTickets: Array<{
    id: string
    title: string
    ticket_number: string
    status: string
    priority: string
    category?: string
    venue_name: string
    venue_id?: string
    assigned_to?: string
    description?: string
    resolution_notes?: string
  }>
): Promise<SyncResult['tickets'] & { venueMatches: number; venueUnmatched: string[] }> {
  if (!TWENTY_API_KEY) {
    console.warn('TWENTY_API_KEY not set, skipping Twenty sync')
    return { synced: 0, updated: 0, errors: 0, venueMatches: 0, venueUnmatched: [] }
  }

  const venueIndex = await buildVenueIndex()

  // Get existing Twenty tickets by servicesId for dedup
  const existingTickets = await fetchAllTwenty<{ id: string; servicesId: string }>('serviceTickets')
  const existingByServicesId = new Map<string, string>()
  for (const t of existingTickets) {
    if (t.servicesId) existingByServicesId.set(t.servicesId, t.id)
  }

  let synced = 0, updated = 0, errors = 0, venueMatches = 0
  const venueUnmatched: string[] = []

  // Map statuses
  const statusMap: Record<string, string> = {
    'new': 'TICKET_NEW',
    'open': 'STATUS_OPEN',
    'in_progress': 'STATUS_PROGRESS',
    'resolved': 'STATUS_RESOLVED',
    'closed': 'STATUS_CLOSED',
  }

  // Map priorities
  const priorityMap: Record<string, string> = {
    'low': 'PRI_LOW',
    'medium': 'PRI_MEDIUM',
    'high': 'PRI_HIGH',
  }

  // Map categories
  const categoryMap: Record<string, string> = {
    'hardware': 'CATEGORY_HARDWARE',
    'software': 'CATEGORY_SOFTWARE',
    'general': 'CATEGORY_GENERAL',
    'content': 'CATEGORY_CONTENT',
  }

  for (const ticket of dbTickets) {
    try {
      const venueId = resolveVenueId(ticket.venue_name, venueIndex)
      if (venueId) {
        venueMatches++
      } else if (ticket.venue_name) {
        if (!venueUnmatched.includes(ticket.venue_name)) {
          venueUnmatched.push(ticket.venue_name)
        }
      }

      const twentyData: Record<string, unknown> = {
        name: ticket.title || `Ticket ${ticket.ticket_number}`,
        ticketNumber: ticket.ticket_number,
        ticketStatus: statusMap[ticket.status] || 'TICKET_NEW',
        priority: priorityMap[ticket.priority] || null,
        category: categoryMap[ticket.category || ''] || null,
        venueName: ticket.venue_name || '',
        assignedToName: ticket.assigned_to || '',
        description: ticket.description || '',
        resolutionNotes: ticket.resolution_notes || '',
        servicesId: ticket.id,
        ticketSource: 'DASHBOARD',
      }

      if (venueId) {
        twentyData.venueId = venueId
      }

      const existingId = existingByServicesId.get(ticket.id)

      if (existingId) {
        const res = await twentyFetch(`serviceTickets/${existingId}`, {
          method: 'PATCH',
          body: JSON.stringify(twentyData),
        })
        if (res.ok) {
          updated++
        } else {
          errors++
          console.error(`Failed to update ticket ${ticket.id}:`, await res.text())
        }
      } else {
        const res = await twentyFetch('serviceTickets', {
          method: 'POST',
          body: JSON.stringify(twentyData),
        })
        if (res.ok) {
          synced++
        } else {
          errors++
          console.error(`Failed to create ticket ${ticket.id}:`, await res.text())
        }
      }
    } catch (err) {
      errors++
      console.error(`Error syncing ticket ${ticket.id}:`, err)
    }
  }

  return { synced, updated, errors, venueMatches, venueUnmatched }
}

// --- Phase 3A: Technician Sync ---

const roleMap: Record<string, string> = {
  'technician': 'ROLE_TECH',
  'tech': 'ROLE_TECH',
  'manager': 'ROLE_MANAGER',
  'admin': 'ROLE_ADMIN',
}

const regionByCityPrefix: Record<string, string> = {
  'new york': 'NORTHEAST', 'newark': 'NORTHEAST', 'boston': 'NORTHEAST',
  'philadelphia': 'NORTHEAST', 'pittsburgh': 'NORTHEAST', 'hartford': 'NORTHEAST',
  'providence': 'NORTHEAST', 'buffalo': 'NORTHEAST', 'albany': 'NORTHEAST',
  'charlotte': 'SOUTHEAST', 'atlanta': 'SOUTHEAST', 'miami': 'SOUTHEAST',
  'tampa': 'SOUTHEAST', 'orlando': 'SOUTHEAST', 'jacksonville': 'SOUTHEAST',
  'nashville': 'SOUTHEAST', 'raleigh': 'SOUTHEAST', 'richmond': 'SOUTHEAST',
  'chicago': 'MIDWEST', 'detroit': 'MIDWEST', 'cleveland': 'MIDWEST',
  'columbus': 'MIDWEST', 'indianapolis': 'MIDWEST', 'milwaukee': 'MIDWEST',
  'minneapolis': 'MIDWEST', 'kansas city': 'MIDWEST', 'st. louis': 'MIDWEST',
  'dallas': 'SOUTHWEST', 'houston': 'SOUTHWEST', 'san antonio': 'SOUTHWEST',
  'austin': 'SOUTHWEST', 'phoenix': 'SOUTHWEST', 'denver': 'SOUTHWEST',
  'las vegas': 'SOUTHWEST', 'oklahoma city': 'SOUTHWEST',
  'los angeles': 'WEST', 'san francisco': 'WEST', 'seattle': 'WEST',
  'portland': 'WEST', 'san diego': 'WEST', 'sacramento': 'WEST',
  'salt lake city': 'WEST',
}

function cityToRegion(city: string): string | null {
  if (!city) return null
  const lower = city.toLowerCase().trim()
  for (const [prefix, region] of Object.entries(regionByCityPrefix)) {
    if (lower.startsWith(prefix) || lower.includes(prefix)) return region
  }
  return null
}

export async function syncTechniciansToTwenty(
  dbStaff: Array<{
    id: string
    full_name: string
    email: string
    phone: string
    role: string
    title: string
    city: string
    venue_id?: string
  }>
): Promise<{ synced: number; updated: number; errors: number }> {
  if (!TWENTY_API_KEY) {
    console.warn('TWENTY_API_KEY not set, skipping technician sync')
    return { synced: 0, updated: 0, errors: 0 }
  }

  const existingTechs = await fetchAllTwenty<{ id: string; servicesId: string }>('technicians')
  const existingByServicesId = new Map<string, string>()
  for (const t of existingTechs) {
    if (t.servicesId) existingByServicesId.set(t.servicesId, t.id)
  }

  const venueIndex = await buildVenueIndex()
  let synced = 0, updated = 0, errors = 0

  for (const staff of dbStaff) {
    try {
      const twentyData: Record<string, unknown> = {
        name: staff.full_name || '',
        email: staff.email || '',
        phone: staff.phone || '',
        title: staff.title || '',
        city: staff.city || '',
        staffRole: roleMap[(staff.role || '').toLowerCase()] || 'ROLE_TECH',
        servicesId: staff.id,
      }

      const region = cityToRegion(staff.city)
      if (region) twentyData.techRegion = region

      if (staff.venue_id) {
        const venueId = venueIndex.get(staff.venue_id)
        if (venueId) twentyData.homeVenueId = venueId
      }

      const existingId = existingByServicesId.get(staff.id)

      if (existingId) {
        const res = await twentyFetch(`technicians/${existingId}`, {
          method: 'PATCH',
          body: JSON.stringify(twentyData),
        })
        if (res.ok) updated++
        else { errors++; console.error(`Failed to update tech ${staff.id}:`, await res.text()) }
      } else {
        const res = await twentyFetch('technicians', {
          method: 'POST',
          body: JSON.stringify(twentyData),
        })
        if (res.ok) synced++
        else { errors++; console.error(`Failed to create tech ${staff.id}:`, await res.text()) }
      }
    } catch (err) {
      errors++
      console.error(`Error syncing technician ${staff.id}:`, err)
    }
  }

  return { synced, updated, errors }
}

// --- Phase 3B: Proposal Integration Helpers ---

/** Find a company in Twenty by name, create if not found */
export async function findOrCreateTwentyCompany(name: string): Promise<string> {
  const res = await twentyFetch(`companies?filter=name[ilike]:${encodeURIComponent(`"${name}"`)}`)
  const data = await res.json()
  const existing = data?.data?.companies?.[0]
  if (existing) return existing.id

  const createRes = await twentyFetch('companies', {
    method: 'POST',
    body: JSON.stringify({ name, partnerType: 'CLIENT', serviceStatus: 'PROSPECT' }),
  })
  const created = await createRes.json()
  return created?.data?.createCompany?.id || created?.data?.createCompanies?.[0]?.id
}

/** Find a venue in Twenty by name/servicesId, create if not found */
export async function findOrCreateTwentyVenue(
  name: string,
  dashboardVenueId: string,
  companyId: string
): Promise<string> {
  const venueIndex = await buildVenueIndex()

  const byId = venueIndex.get(dashboardVenueId)
  if (byId) return byId
  const byName = resolveVenueId(name, venueIndex)
  if (byName) return byName

  const createRes = await twentyFetch('venues', {
    method: 'POST',
    body: JSON.stringify({ name, companyId, servicesId: dashboardVenueId, venueCategory: 'CAT_SPORTS' }),
  })
  const created = await createRes.json()
  return created?.data?.createVenue?.id || created?.data?.createVenues?.[0]?.id
}

/** Create or update an opportunity in Twenty */
export async function createOrUpdateOpportunity(data: {
  name: string
  bidStatus: string
  stage: string
  amount?: number
  proposalUrl?: string
  ledSqFt?: number
  manufacturer?: string
  companyId: string
  venueId: string
}): Promise<string> {
  const res = await twentyFetch(`opportunities?filter=name[ilike]:${encodeURIComponent(`"${data.name}"`)}`)
  const existing = (await res.json())?.data?.opportunities?.[0]

  const body: Record<string, unknown> = {
    name: data.name,
    bidStatus: data.bidStatus,
    stage: data.stage,
    companyId: data.companyId,
    venueId: data.venueId,
  }
  if (data.amount) body.amount = { amountMicros: data.amount * 1_000_000, currencyCode: 'USD' }
  if (data.proposalUrl) body.proposalUrl = data.proposalUrl
  if (data.ledSqFt) body.ledSqFt = data.ledSqFt
  if (data.manufacturer) body.manufacturer = data.manufacturer

  if (existing) {
    await twentyFetch(`opportunities/${existing.id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    })
    return existing.id
  }

  const createRes = await twentyFetch('opportunities', {
    method: 'POST',
    body: JSON.stringify(body),
  })
  const created = await createRes.json()
  return created?.data?.createOpportunity?.id || created?.data?.createOpportunities?.[0]?.id
}

/** Create service records for a venue in Twenty */
export async function createServiceRecords(
  venueId: string,
  companyId: string,
  serviceTypes: string[]
): Promise<void> {
  for (const serviceType of serviceTypes) {
    const res = await twentyFetch('services', {
      method: 'POST',
      body: JSON.stringify({
        name: `${serviceType} Service`,
        serviceType,
        serviceStatus: 'ACTIVE',
        venueId,
        companyId,
        requiresStaffing: serviceType === 'STAFFING' || serviceType === 'LED_MAINTENANCE',
      }),
    })
    if (!res.ok) {
      console.error(`Failed to create service ${serviceType}:`, await res.text())
    }
  }

  await twentyFetch(`venues/${venueId}`, {
    method: 'PATCH',
    body: JSON.stringify({ hasContractedServices: true }),
  })
}

// Export helpers for external use
export { twentyFetch, fetchAllTwenty, buildVenueIndex, resolveVenueId }
