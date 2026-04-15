/**
 * Twenty CRM Read Client
 *
 * Typed wrapper for reading data from Twenty CRM REST API.
 * Includes in-memory TTL cache (60s) to stay under rate limits.
 */

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''
const CACHE_TTL = 60_000 // 60 seconds

// --- Types ---

export interface TwentyCompany {
  id: string
  name: string
  domainName?: { primaryLinkUrl: string }
  address?: { addressCity: string; addressState: string }
  venueType?: string
  league?: string
  region?: string
  serviceStatus?: string
  partnerType?: string
  contractStart?: string
  contractEnd?: string
  annualContractValue?: { amountMicros: number; currencyCode: string }
  createdAt: string
  updatedAt: string
}

export interface TwentyPerson {
  id: string
  name: { firstName: string; lastName: string }
  emails?: { primaryEmail: string }
  phones?: { primaryPhoneNumber: string }
  companyId?: string
  isAncStaff?: boolean
  decisionRole?: string
  department?: string
  createdAt: string
}

export interface TwentyVenue {
  id: string
  name: string
  venueCategory?: string
  market?: string
  companyId?: string
  servicesId?: string
  venueStatus?: string
  hasContractedServices?: boolean
  createdAt: string
}

export interface TwentyService {
  id: string
  name: string
  serviceType: string
  serviceStatus: string
  venueId: string
  companyId?: string
  startDate?: string
  endDate?: string
  monthlyValue?: { amountMicros: number; currencyCode: string }
  requiresStaffing: boolean
  createdAt: string
}

export interface TwentyOpportunity {
  id: string
  name: string
  stage?: string
  bidStatus?: string
  amount?: { amountMicros: number; currencyCode: string }
  companyId?: string
  venueId?: string
  proposalUrl?: string
  closeDate?: string
  createdAt: string
}

export interface TwentyTechnician {
  id: string
  name: string
  staffRole?: string
  email?: string
  phone?: string
  city?: string
  homeVenueId?: string
  techRegion?: string
  servicesId?: string
  createdAt: string
}

export interface TwentyTask {
  id: string
  title: string
  body?: string
  dueAt?: string
  status: string
  assigneeId?: string
  taskType?: string
  taskPriority?: string
  taskVenueId?: string
  taskCategory?: string
  createdAt: string
  updatedAt: string
}

// --- Cache ---

const cache = new Map<string, { data: unknown; timestamp: number }>()

function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() })
}

// --- Fetch Helpers ---

async function twentyGet(endpoint: string): Promise<Response> {
  return fetch(`${TWENTY_BASE}/rest/${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${TWENTY_API_KEY}`,
      'Content-Type': 'application/json',
    },
  })
}

async function fetchList<T>(endpoint: string, objectKey: string, filter?: string): Promise<T[]> {
  const cacheKey = `${endpoint}:${filter || 'all'}`
  const cached = getCached<T[]>(cacheKey)
  if (cached) return cached

  const items: T[] = []
  let cursor: string | null = null

  for (let page = 0; page < 50; page++) {
    let url = cursor
      ? `${endpoint}?limit=60&starting_after=${cursor}`
      : `${endpoint}?limit=60`
    if (filter && !cursor) url += `&filter=${filter}`
    else if (filter && cursor) url += `&filter=${filter}`

    const res = await twentyGet(url)
    if (!res.ok) break
    const data = await res.json()
    const records = data?.data?.[objectKey] || []
    if (records.length === 0) break
    items.push(...records)
    if (!data?.pageInfo?.hasNextPage) break
    cursor = data.pageInfo.endCursor
  }

  setCache(cacheKey, items)
  return items
}

async function fetchOne<T>(endpoint: string, objectKey: string): Promise<T | null> {
  const cached = getCached<T>(endpoint)
  if (cached) return cached

  const res = await twentyGet(endpoint)
  if (!res.ok) return null
  const data = await res.json()
  const record = data?.data?.[objectKey] || null
  if (record) setCache(endpoint, record)
  return record
}

// --- Public API ---

export class TwentyClient {
  isConfigured(): boolean {
    return !!TWENTY_API_KEY
  }

  async getCompanies(filter?: string): Promise<TwentyCompany[]> {
    return fetchList<TwentyCompany>('companies', 'companies', filter)
  }

  async getCompany(id: string): Promise<TwentyCompany | null> {
    return fetchOne<TwentyCompany>(`companies/${id}`, 'company')
  }

  async getVenues(filter?: string): Promise<TwentyVenue[]> {
    return fetchList<TwentyVenue>('venues', 'venues', filter)
  }

  async getVenue(id: string): Promise<TwentyVenue | null> {
    return fetchOne<TwentyVenue>(`venues/${id}`, 'venue')
  }

  async getPeople(filter?: string): Promise<TwentyPerson[]> {
    return fetchList<TwentyPerson>('people', 'people', filter)
  }

  async getServices(filter?: string): Promise<TwentyService[]> {
    return fetchList<TwentyService>('services', 'services', filter)
  }

  async getTechnicians(filter?: string): Promise<TwentyTechnician[]> {
    return fetchList<TwentyTechnician>('technicians', 'technicians', filter)
  }

  async getOpportunities(filter?: string): Promise<TwentyOpportunity[]> {
    return fetchList<TwentyOpportunity>('opportunities', 'opportunities', filter)
  }

  async getOpportunity(id: string): Promise<TwentyOpportunity | null> {
    return fetchOne<TwentyOpportunity>(`opportunities/${id}`, 'opportunity')
  }

  async getTasks(filter?: string): Promise<TwentyTask[]> {
    return fetchList<TwentyTask>('tasks', 'tasks', filter)
  }

  async getTask(id: string): Promise<TwentyTask | null> {
    return fetchOne<TwentyTask>(`tasks/${id}`, 'task')
  }
}

// Singleton instance
export const twentyClient = new TwentyClient()
