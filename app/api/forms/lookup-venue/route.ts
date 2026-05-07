export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { lookupVenueDetails } from '../_helpers'

/**
 * GET /api/forms/lookup-venue?id=<uuid>
 *
 * Given a venue id, returns its address + contact info for auto-filling
 * shipping fields on parts/print forms. Public intake forms use this so
 * users never type the shipping address manually.
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id') || ''
  if (!id) return NextResponse.json({ venue: null })
  const venue = await lookupVenueDetails(id)
  return NextResponse.json({ venue })
}
