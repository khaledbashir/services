export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://crm.ancsports.net'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''

async function twentyGet(endpoint: string): Promise<Response> {
  return fetch(`${TWENTY_BASE}/rest/${endpoint}`, {
    headers: {
      Authorization: `Bearer ${TWENTY_API_KEY}`,
      'Content-Type': 'application/json',
    },
  })
}

async function twentyPatch(endpoint: string, body: unknown): Promise<Response> {
  return fetch(`${TWENTY_BASE}/rest/${endpoint}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${TWENTY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

async function fetchAll<T>(endpoint: string, objectKey: string, filter?: string): Promise<T[]> {
  const items: T[] = []
  let cursor: string | null = null
  for (let page = 0; page < 50; page++) {
    let url = cursor
      ? `${endpoint}?limit=60&starting_after=${cursor}`
      : `${endpoint}?limit=60`
    if (filter) url += `&filter=${filter}`
    const res = await twentyGet(url)
    if (!res.ok) break
    const data = await res.json()
    const records = data?.data?.[objectKey] || []
    if (records.length === 0) break
    items.push(...records)
    if (!data?.pageInfo?.hasNextPage) break
    cursor = data.pageInfo.endCursor
  }
  return items
}

// In-memory company name cache — survives across requests within the same serverless instance.
const companyNameCache = new Map<string, { name: string; ts: number }>()
const NAME_TTL = 5 * 60_000

async function resolveCompanyNames(ids: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  const missing: string[] = []
  const now = Date.now()

  for (const id of ids) {
    const cached = companyNameCache.get(id)
    if (cached && now - cached.ts < NAME_TTL) {
      result[id] = cached.name
    } else {
      missing.push(id)
    }
  }

  if (missing.length === 0) return result

  // Batch: fetch all companies and index by id. Much faster than N individual fetches.
  // Twenty's /rest/companies endpoint returns all companies; we page through once
  // and cache the full id→name map.
  if (!companyNameCache.has('__all_loaded') || now - (companyNameCache.get('__all_loaded')?.ts || 0) > NAME_TTL) {
    const allCompanies = await fetchAll<{ id: string; name: string }>('companies', 'companies')
    for (const c of allCompanies) {
      companyNameCache.set(c.id, { name: c.name, ts: now })
      result[c.id] = c.name
    }
    companyNameCache.set('__all_loaded', { name: '', ts: now })
  }

  // Fill any still-missing from cache
  for (const id of missing) {
    const cached = companyNameCache.get(id)
    if (cached) result[id] = cached.name
  }

  return result
}

/**
 * GET /api/twenty/ms?companyId=...&type=placements|contracts|verifications|all
 */
export async function GET(request: NextRequest) {
  if (!TWENTY_API_KEY) {
    return NextResponse.json({ error: 'Twenty CRM not configured' }, { status: 503 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const type = searchParams.get('type') || 'all'

    if (!companyId) {
      return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    }

    const homeFilter = `homeTeamId[eq]:"${companyId}"`
    const teamFilter = `teamId[eq]:"${companyId}"`

    // Fetch data in parallel
    const [placementsRaw, contractsRaw, verificationsRaw, teamRes] = await Promise.all([
      (type === 'all' || type === 'placements')
        ? fetchAll<Record<string, unknown>>('mediaPlacements', 'mediaPlacements', homeFilter)
        : Promise.resolve([]),
      (type === 'all' || type === 'contracts')
        ? fetchAll<Record<string, unknown>>('sponsorTeamContracts', 'sponsorTeamContracts', teamFilter)
        : Promise.resolve([]),
      (type === 'all' || type === 'verifications')
        ? fetchAll<Record<string, unknown>>('nielsenVerifications', 'nielsenVerifications', teamFilter)
        : Promise.resolve([]),
      twentyGet(`companies/${companyId}`),
    ])

    let team: Record<string, unknown> | null = null
    if (teamRes.ok) {
      const td = await teamRes.json()
      team = td?.data?.company || null
    }

    // Collect all company IDs to resolve
    const companyIds = new Set<string>()
    for (const p of placementsRaw) {
      if (p.sponsorId) companyIds.add(p.sponsorId as string)
      if (p.awayTeamId) companyIds.add(p.awayTeamId as string)
    }
    for (const c of contractsRaw) if (c.sponsorId) companyIds.add(c.sponsorId as string)
    for (const v of verificationsRaw) if (v.sponsorId) companyIds.add(v.sponsorId as string)

    const companyNames = await resolveCompanyNames([...companyIds])

    return NextResponse.json({
      team,
      placements: placementsRaw,
      contracts: contractsRaw,
      verifications: verificationsRaw,
      companyNames,
    })
  } catch (err) {
    console.error('M&S fetch error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch M&S data' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/twenty/ms
 * Body: { objectType, id, fields }
 */
export async function PATCH(request: NextRequest) {
  if (!TWENTY_API_KEY) {
    return NextResponse.json({ error: 'Twenty CRM not configured' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const { objectType, id, fields } = body

    if (!objectType || !id || !fields) {
      return NextResponse.json({ error: 'objectType, id, and fields required' }, { status: 400 })
    }

    const res = await twentyPatch(`${objectType}/${id}`, fields)

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: `Twenty PATCH failed: ${text.slice(0, 200)}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (err) {
    console.error('M&S patch error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update' },
      { status: 500 }
    )
  }
}
