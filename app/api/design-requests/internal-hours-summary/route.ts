export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { INTERNAL_CATEGORIES } from '@/lib/design-internal-category'
import { Designs, isTwentyBackedEnabled } from '@/lib/twenty-ops'

// Aggregate hours_spent grouped by internal category. Joins the local
// design_request_internal_categories tag table to design_requests
// (Postgres) OR to Twenty designRequests (when TWENTY_BACKED_DESIGNS is on
// — in that case we pull effortHours from Twenty for the tagged ids).
//
// Optional `?from=YYYY-MM-DD&to=YYYY-MM-DD` filters by request created_at.
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from') || null
    const to = searchParams.get('to') || null

    const tagsRes = await query(
      `SELECT design_request_id, category FROM design_request_internal_categories`,
    )
    if (tagsRes.rows.length === 0) {
      return NextResponse.json({
        from, to,
        categories: INTERNAL_CATEGORIES.map((c) => ({ key: c.key, label: c.label, hours: 0, count: 0 })),
        total_hours: 0,
        total_count: 0,
      })
    }

    const tagByRequestId = new Map<string, string>()
    tagsRes.rows.forEach((r: any) => tagByRequestId.set(r.design_request_id, r.category))
    const allTaggedIds = Array.from(tagByRequestId.keys())

    // category -> { hours, count }
    const totals = new Map<string, { hours: number; count: number }>()
    INTERNAL_CATEGORIES.forEach((c) => totals.set(c.key, { hours: 0, count: 0 }))

    if (isTwentyBackedEnabled('DESIGNS')) {
      // Fetch each tagged request from Twenty. Twenty doesn't filter by an
      // arbitrary id list cheaply, so we hit each one. Volume here is bounded
      // by the number of internally-tagged requests, which is small.
      for (const id of allTaggedIds) {
        const cat = tagByRequestId.get(id)!
        const bucket = totals.get(cat)
        if (!bucket) continue
        try {
          const d = await Designs.get(id) as any
          if (!d) continue
          if (from || to) {
            const created = (d.createdAt || '').slice(0, 10)
            if (from && created < from) continue
            if (to && created > to) continue
          }
          bucket.count += 1
          // Twenty exposes `effortHours` (estimated) — closest signal to time
          // spent until we wire actual time entries into Twenty as well.
          if (typeof d.effortHours === 'number') bucket.hours += d.effortHours
        } catch {
          // Skip stale tag rows that point at deleted Twenty records.
        }
      }
    } else {
      const conditions: string[] = ['dr.id::text = ANY($1::text[])']
      const params: any[] = [allTaggedIds]
      if (from) { params.push(from); conditions.push(`dr.created_at >= $${params.length}`) }
      if (to) { params.push(to); conditions.push(`dr.created_at <= $${params.length}`) }

      const rowsRes = await query(
        `SELECT dr.id::text, dr.hours_spent, dr.hours_estimated
         FROM design_requests dr
         WHERE ${conditions.join(' AND ')}`,
        params,
      )
      for (const row of rowsRes.rows) {
        const cat = tagByRequestId.get(row.id)
        if (!cat) continue
        const bucket = totals.get(cat)
        if (!bucket) continue
        bucket.count += 1
        bucket.hours += Number(row.hours_spent || 0)
      }
    }

    const categories = INTERNAL_CATEGORIES.map((c) => {
      const bucket = totals.get(c.key)!
      return { key: c.key, label: c.label, hours: round1(bucket.hours), count: bucket.count }
    })
    const total_hours = round1(categories.reduce((sum, c) => sum + c.hours, 0))
    const total_count = categories.reduce((sum, c) => sum + c.count, 0)

    return NextResponse.json({ from, to, categories, total_hours, total_count })
  } catch (err) {
    console.error('Error aggregating internal hours:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}
