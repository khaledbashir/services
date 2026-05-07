export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from "next/server"
import { requireRole, isAuthError } from "@/lib/rbac"
import { PartsOrders, isTwentyBackedEnabled } from "@/lib/twenty-ops"
import { query } from "@/lib/db"

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, "manager")
  if (isAuthError(auth)) return auth

  if (isTwentyBackedEnabled("PARTS_ORDERS")) {
    try {
      const page = await PartsOrders.list({ limit: 100, orderBy: "createdAt[DescNullsLast]" })
      return NextResponse.json({ parts_orders: page.items })
    } catch (err) {
      console.error(err)
      return NextResponse.json({ error: "Failed to list parts orders" }, { status: 500 })
    }
  }

  // legacy fallback (empty array for this demo context as it's primarily twenty-backed now)
  return NextResponse.json({ parts_orders: [] })
}
