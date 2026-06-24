export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import {
  findAddressByTriCode,
  findPrintShippingAddress,
  getPrintShippingAddresses,
} from '@/lib/print-shipping-addresses'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const client = searchParams.get('client')
  const tricode = searchParams.get('tricode')

  // Tri-code takes precedence (Alexis 2026-06-24). Falls back to the client
  // name match if the tri-code can't be resolved to an address.
  if (tricode) {
    const byTriCode = await findAddressByTriCode(tricode)
    if (byTriCode) return NextResponse.json({ match: byTriCode, matched_by: 'tricode' })
    if (client) {
      return NextResponse.json({ match: findPrintShippingAddress(client), matched_by: 'client' })
    }
    return NextResponse.json({ match: null, matched_by: null })
  }

  if (client) {
    return NextResponse.json({ match: findPrintShippingAddress(client), matched_by: 'client' })
  }

  return NextResponse.json({ addresses: getPrintShippingAddresses() })
}
