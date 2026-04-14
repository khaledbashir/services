import { NextRequest, NextResponse } from 'next/server'

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''

/**
 * GET /api/forms/search-venues?q=fenway
 *
 * Returns up to 10 matching venues for intake-form autocomplete. Forms use
 * this to replace free-text venue fields — user picks from the list, then a
 * subsequent lookup-venue call auto-fills shipping/contact.
 */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') || '').trim()
  if (!q || q.length < 2) return NextResponse.json({ venues: [] })
  if (!TWENTY_API_KEY) return NextResponse.json({ venues: [] })
  try {
    const res = await fetch(
      `${TWENTY_BASE}/rest/venues?filter=name[ilike]:"%25${encodeURIComponent(q)}%25"&limit=10`,
      { headers: { Authorization: `Bearer ${TWENTY_API_KEY}` } }
    )
    if (!res.ok) return NextResponse.json({ venues: [] })
    const json = await res.json()
    const venues = (json?.data?.venues || []).map((v: any) => ({
      id: v.id,
      name: v.name,
      market: v.market || null,
    }))
    return NextResponse.json({ venues })
  } catch {
    return NextResponse.json({ venues: [] })
  }
}
