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

async function twentyMutation(method: 'POST' | 'PATCH' | 'DELETE', endpoint: string, body?: unknown): Promise<Response> {
  return fetch(`${TWENTY_BASE}/rest/${endpoint}`, {
    method,
    headers: {
      'Authorization': `Bearer ${TWENTY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

function invalidateCache(prefix: string): void {
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k)
  }
}

function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
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

  async findPersonByEmail(email: string): Promise<TwentyPerson | null> {
    const normalized = email.trim().toLowerCase()
    if (!normalized) return null
    const params = new URLSearchParams({
      limit: '1',
      filter: `emails.primaryEmail[eq]:"${escapeFilterValue(normalized)}"`,
    })
    const res = await twentyGet(`people?${params.toString()}`)
    if (!res.ok) return null
    const data = await res.json()
    const people = (data?.data?.people || []) as TwentyPerson[]
    return people.find(person => person.emails?.primaryEmail?.toLowerCase() === normalized) || people[0] || null
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

  // ============================================================
  // WRITES — used by the ElevenLabs CRM voice tools.
  // Each method returns the created/updated record or throws.
  // The CRUD cache is invalidated on every write so subsequent
  // reads see fresh data.
  // ============================================================

  async createCompany(input: { name: string; domain?: string; address?: { city?: string; state?: string } }): Promise<TwentyCompany> {
    const body: Record<string, unknown> = { name: input.name }
    if (input.domain) body.domainName = { primaryLinkUrl: input.domain }
    if (input.address) {
      body.address = {
        addressCity: input.address.city || '',
        addressState: input.address.state || '',
      }
    }
    const res = await twentyMutation('POST', 'companies', body)
    if (!res.ok) throw new Error(`createCompany failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
    invalidateCache('companies')
    const data = await res.json()
    return data?.data?.createCompany
  }

  async createPerson(input: {
    firstName: string
    lastName: string
    email?: string
    phone?: string
    companyId?: string
    jobTitle?: string
  }): Promise<TwentyPerson> {
    const body: Record<string, unknown> = {
      name: { firstName: input.firstName, lastName: input.lastName },
    }
    if (input.email) body.emails = { primaryEmail: input.email }
    if (input.phone) body.phones = { primaryPhoneNumber: input.phone }
    if (input.companyId) body.companyId = input.companyId
    if (input.jobTitle) body.jobTitle = input.jobTitle
    const res = await twentyMutation('POST', 'people', body)
    if (!res.ok) throw new Error(`createPerson failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
    invalidateCache('people')
    const data = await res.json()
    return data?.data?.createPerson
  }

  async createOpportunity(input: {
    name: string
    companyId?: string
    venueId?: string
    stage?: string
    bidStatus?: string
    amount?: number
    currency?: string
    closeDate?: string
  }): Promise<TwentyOpportunity> {
    const body: Record<string, unknown> = { name: input.name }
    if (input.companyId) body.companyId = input.companyId
    if (input.venueId) body.venueId = input.venueId
    if (input.stage) body.stage = input.stage
    if (input.bidStatus) body.bidStatus = input.bidStatus
    if (typeof input.amount === 'number') {
      body.amount = {
        amountMicros: Math.round(input.amount * 1_000_000),
        currencyCode: input.currency || 'USD',
      }
    }
    if (input.closeDate) body.closeDate = input.closeDate
    const res = await twentyMutation('POST', 'opportunities', body)
    if (!res.ok) throw new Error(`createOpportunity failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
    invalidateCache('opportunities')
    const data = await res.json()
    return data?.data?.createOpportunity
  }

  async updateOpportunity(id: string, patch: { stage?: string; bidStatus?: string; amount?: number; currency?: string; closeDate?: string }): Promise<TwentyOpportunity> {
    const body: Record<string, unknown> = {}
    if (patch.stage) body.stage = patch.stage
    if (patch.bidStatus) body.bidStatus = patch.bidStatus
    if (typeof patch.amount === 'number') {
      body.amount = { amountMicros: Math.round(patch.amount * 1_000_000), currencyCode: patch.currency || 'USD' }
    }
    if (patch.closeDate) body.closeDate = patch.closeDate
    const res = await twentyMutation('PATCH', `opportunities/${id}`, body)
    if (!res.ok) throw new Error(`updateOpportunity failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
    invalidateCache('opportunities')
    const data = await res.json()
    return data?.data?.updateOpportunity
  }

  async createTask(input: {
    title: string
    body?: string
    status?: 'TODO' | 'IN_PROGRESS' | 'DONE'
    dueAt?: string // ISO timestamp
    assigneeId?: string
  }): Promise<TwentyTask> {
    const body: Record<string, unknown> = {
      title: input.title,
      status: input.status || 'TODO',
    }
    if (input.body) {
      body.bodyV2 = { markdown: input.body, blocknote: '' }
    }
    if (input.dueAt) body.dueAt = input.dueAt
    if (input.assigneeId) body.assigneeId = input.assigneeId
    const res = await twentyMutation('POST', 'tasks', body)
    if (!res.ok) throw new Error(`createTask failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
    invalidateCache('tasks')
    const data = await res.json()
    return data?.data?.createTask
  }

  async createTaskTarget(input: { taskId: string; companyId?: string; personId?: string; opportunityId?: string }): Promise<unknown> {
    const body: Record<string, unknown> = { taskId: input.taskId }
    if (input.companyId) body.companyId = input.companyId
    if (input.personId) body.personId = input.personId
    if (input.opportunityId) body.opportunityId = input.opportunityId
    const res = await twentyMutation('POST', 'taskTargets', body)
    if (!res.ok) throw new Error(`createTaskTarget failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
    return res.json()
  }

  async createNote(input: { title: string; bodyMarkdown?: string }): Promise<{ id: string; title: string }> {
    const body: Record<string, unknown> = { title: input.title }
    if (input.bodyMarkdown) {
      body.bodyV2 = { markdown: input.bodyMarkdown, blocknote: '' }
    }
    const res = await twentyMutation('POST', 'notes', body)
    if (!res.ok) throw new Error(`createNote failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
    invalidateCache('notes')
    const data = await res.json()
    return data?.data?.createNote
  }

  async createNoteTarget(input: { noteId: string; companyId?: string; personId?: string; opportunityId?: string }): Promise<unknown> {
    const body: Record<string, unknown> = { noteId: input.noteId }
    if (input.companyId) body.targetCompanyId = input.companyId
    if (input.personId) body.targetPersonId = input.personId
    if (input.opportunityId) body.targetOpportunityId = input.opportunityId
    const res = await twentyMutation('POST', 'noteTargets', body)
    if (!res.ok) throw new Error(`createNoteTarget failed (${res.status}): ${(await res.text()).slice(0, 200)}`)
    return res.json()
  }
}

// Singleton instance
export const twentyClient = new TwentyClient()
