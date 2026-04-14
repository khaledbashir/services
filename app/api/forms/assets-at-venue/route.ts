import { NextRequest, NextResponse } from 'next/server'

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''

/**
 * GET /api/forms/assets-at-venue?venueId=<uuid>
 *
 * Returns all display/inventoryAsset records linked to a venue. The design
 * intake form uses this to power the "which boards/sections" picker so
 * Alexis picks from a real list instead of typing free-text.
 */
export async function GET(request: NextRequest) {
  const venueId = request.nextUrl.searchParams.get('venueId') || ''
  if (!venueId || !TWENTY_API_KEY) return NextResponse.json({ assets: [] })
  try {
    const res = await fetch(
      `${TWENTY_BASE}/rest/inventoryAssets?filter=assetVenueId[eq]:"${venueId}"&limit=60`,
      { headers: { Authorization: `Bearer ${TWENTY_API_KEY}` } }
    )
    if (!res.ok) return NextResponse.json({ assets: [] })
    const json = await res.json()
    const assets = (json?.data?.inventoryAssets || []).map((a: any) => ({
      id: a.id,
      name: a.name || a.partName || a.assetNumber || 'Untitled asset',
      displayType: a.displayType || null,
      screenLocation: a.screenLocation || null,
      orientation: a.orientation || null,
      resolution: a.resolution || null,
    }))
    return NextResponse.json({ assets })
  } catch {
    return NextResponse.json({ assets: [] })
  }
}
