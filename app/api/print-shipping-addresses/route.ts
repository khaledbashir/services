export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { findPrintShippingAddress, getPrintShippingAddresses } from '@/lib/print-shipping-addresses'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const client = searchParams.get('client')

  if (client) {
    return NextResponse.json({ match: findPrintShippingAddress(client) })
  }

  return NextResponse.json({ addresses: getPrintShippingAddresses() })
}
