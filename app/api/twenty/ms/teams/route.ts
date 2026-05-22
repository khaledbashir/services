export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://crm.ancsports.net'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''

interface CompanyRecord {
  id: string
  name: string
  league?: string
  address?: { addressCity?: string; addressState?: string }
}

async function fetchAll(): Promise<CompanyRecord[]> {
  const items: CompanyRecord[] = []
  let cursor: string | null = null
  for (let page = 0; page < 50; page++) {
    const url = cursor
      ? `companies?limit=60&starting_after=${cursor}`
      : 'companies?limit=60'
    const res = await fetch(`${TWENTY_BASE}/rest/${url}`, {
      headers: { Authorization: `Bearer ${TWENTY_API_KEY}`, 'Content-Type': 'application/json' },
    })
    if (!res.ok) break
    const data = await res.json()
    const records = data?.data?.companies || []
    if (records.length === 0) break
    items.push(...records)
    if (!data?.pageInfo?.hasNextPage) break
    cursor = data.pageInfo.endCursor
  }
  return items
}

/**
 * GET /api/twenty/ms/teams — returns all companies that have a league field set
 */
export async function GET() {
  if (!TWENTY_API_KEY) {
    return NextResponse.json({ error: 'Twenty CRM not configured' }, { status: 503 })
  }

  try {
    const allCompanies = await fetchAll()
    const teams = allCompanies
      .filter((c) => c.league && c.league.trim() !== '')
      .map((c) => ({
        id: c.id,
        name: c.name,
        league: c.league,
        address: c.address,
      }))
      .sort((a, b) => (a.league || '').localeCompare(b.league || '') || a.name.localeCompare(b.name))

    return NextResponse.json({ teams, totalCompanies: allCompanies.length })
  } catch (err) {
    console.error('Teams fetch error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch teams' },
      { status: 500 }
    )
  }
}
