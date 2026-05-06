import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Designs, isTwentyBackedEnabled, type TwentyDesignRequest } from '@/lib/twenty-ops'

// GET /api/reports/designs-by-client
//
// Per-client design-request counts (Alexis 5/6 — "how many requests for
// design we have per client similar to how we have the hour budgets page").
// Status breakdown so designers see the open + in-flight load per client at
// a glance.
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  if (isTwentyBackedEnabled('DESIGNS')) {
    try {
      // Aggregate over all designs in Twenty. Cap at 1500 — past that we'd
      // want server-side aggregation in Twenty, but we're well under.
      const items: any[] = []
      let cursor: string | null = null
      while (items.length < 1500) {
        const page = await Designs.list({
          limit: Math.min(60, 1500 - items.length),
          startingAfter: cursor || undefined,
          orderBy: 'updatedAt[DescNullsLast]',
        })
        for (const d of page.items) items.push(d)
        if (!page.hasNextPage || !page.nextCursor) break
        cursor = page.nextCursor
      }
      const buckets = aggregate(items.map(twentyToBucketRow))
      return NextResponse.json({ rows: buckets })
    } catch (err) {
      console.error('[reports/designs-by-client twenty] error:', err)
      return NextResponse.json({ error: 'Failed to aggregate from Twenty' }, { status: 500 })
    }
  }

  try {
    const result = await query(
      `SELECT dr.company_name, dr.tricode, dr.status, dr.due_date, dr.hours_estimated
       FROM design_requests dr
       WHERE dr.is_rando = false`,
    )
    const rows = aggregate(result.rows.map((r: any) => ({
      client: r.company_name || '(no client)',
      tricode: r.tricode || null,
      status: r.status || 'request_submitted',
      due_date: r.due_date || null,
      hours_estimated: r.hours_estimated == null ? null : Number(r.hours_estimated),
    })))
    return NextResponse.json({ rows })
  } catch (err) {
    console.error('[reports/designs-by-client local] error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function twentyToBucketRow(d: TwentyDesignRequest) {
  const r = d as any
  const status = ((r.status || '') + '').replace(/^STATUS_/i, '').toLowerCase() || 'request_submitted'
  return {
    client: r.designClient?.name || '(no client)',
    tricode: r.clientTriCode || null,
    status,
    due_date: r.dueDate || null,
    hours_estimated: r.effortHours == null ? null : Number(r.effortHours),
  }
}

interface BucketRow {
  client: string
  tricode: string | null
  status: string
  due_date: string | null
  hours_estimated: number | null
}

function aggregate(rows: BucketRow[]) {
  const m = new Map<string, {
    client: string
    tricode: string | null
    total: number
    open: number
    in_progress: number
    in_review: number
    done: number
    overdue: number
    estimated_hours: number
  }>()
  const todayIso = new Date().toISOString().slice(0, 10)
  for (const r of rows) {
    const key = r.client
    let cur = m.get(key)
    if (!cur) {
      cur = { client: r.client, tricode: r.tricode, total: 0, open: 0, in_progress: 0, in_review: 0, done: 0, overdue: 0, estimated_hours: 0 }
      m.set(key, cur)
    }
    cur.total++
    if (r.tricode && !cur.tricode) cur.tricode = r.tricode
    if (r.hours_estimated != null) cur.estimated_hours += r.hours_estimated
    if (r.status === 'done' || r.status === 'approved') cur.done++
    else if (r.status === 'request_submitted' || r.status === 'in_queue') cur.open++
    else if (r.status === 'in_qc' || r.status === 'client_review') cur.in_review++
    else cur.in_progress++
    if (r.due_date && r.due_date < todayIso && r.status !== 'done' && r.status !== 'approved') cur.overdue++
  }
  return Array.from(m.values()).sort((a, b) => b.total - a.total)
}
