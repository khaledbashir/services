export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { lookupCompanyByEmail } from '../_helpers'

/**
 * GET /api/forms/lookup-company?email=person@mlb.com
 *
 * Given an email, returns the matching Twenty company if we can confidently
 * guess it from the email domain. Used by intake forms for one-field
 * auto-fill of the client.
 *
 * Returns:
 *   { match: { id, name, domain } } on a hit
 *   { match: null } when we don't have a confident match (or the user is on
 *   a free-mail domain like gmail)
 */
export async function GET(request: NextRequest) {
  const email = request.nextUrl.searchParams.get('email') || ''
  if (!email) return NextResponse.json({ match: null })
  const match = await lookupCompanyByEmail(email)
  return NextResponse.json({ match })
}
