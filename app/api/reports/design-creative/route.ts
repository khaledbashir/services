export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

// Charlie 2026-07-14: customer-facing reporting for the Design & Creative
// department — "hours used for clients, amount of time spent per client."
//
// Per-client rollup over BOTH request pipelines (design_requests +
// cg_design_requests). Hours are the lifetime time-entry hours logged
// against each request (designer_time_entries), so a request's hours travel
// with the request rather than being split across date buckets.
//
// GET /api/reports/design-creative?from=&to=&client=&all=1&format=json|csv
//   from/to  filter by request created date (default: last 90 days)
//   all=1    explicit all-time (suppresses the 90-day default)
//   client   substring match on client name or tri-code
//   format   json (default) | csv — one line per request

interface RequestDetail {
  id: string
  source: 'design' | 'cg'
  title: string
  status: string
  designer: string | null
  venue_name: string | null
  hours: number
  created_at: string
  due_date: string | null
}

interface ClientRollup {
  client: string
  tricode: string | null
  total: number
  hours: number
  designers: number
  by_status: Record<string, number>
  requests: RequestDetail[]
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  return `"${String(v).replace(/"/g, '""')}"`
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const url = new URL(request.url)
  const allTime = ['1', 'true', 'yes'].includes((url.searchParams.get('all') || '').toLowerCase())
  let from = url.searchParams.get('from') || null
  const to = url.searchParams.get('to') || null
  const client = (url.searchParams.get('client') || '').trim() || null
  const format = (url.searchParams.get('format') || 'json').toLowerCase()

  // Default window: last 90 days, unless explicitly asked for all-time.
  if (!from && !to && !allTime) {
    const d = new Date()
    d.setDate(d.getDate() - 90)
    from = d.toISOString().slice(0, 10)
  }

  const clientLike = client ? `%${client.replace(/[\\%_]/g, '\\$&')}%` : null
  const params = [from, to, clientLike]

  // $1 = from date, $2 = to date, $3 = client filter (all nullable).
  // Hours + the set of designers who logged time come from a lateral per
  // request; the per-request designer column is the assigned designer.
  const r = await query(
    `SELECT dr.id::text AS id,
            'design' AS source,
            COALESCE(NULLIF(TRIM(dr.company_name), ''), '(no client)') AS client,
            NULLIF(TRIM(dr.tricode), '') AS tricode,
            dr.job_title AS title,
            dr.status,
            s.full_name AS designer,
            v.name AS venue_name,
            dr.created_at,
            dr.due_date::text AS due_date,
            COALESCE(h.hours, 0)::float8 AS hours,
            h.entry_designers
     FROM design_requests dr
     LEFT JOIN staff s ON s.id = dr.designer_id
     LEFT JOIN venues v ON v.id = dr.venue_id
     LEFT JOIN LATERAL (
       SELECT SUM(te.hours) AS hours,
              array_agg(DISTINCT st.full_name) FILTER (WHERE st.full_name IS NOT NULL) AS entry_designers
       FROM designer_time_entries te
       LEFT JOIN staff st ON st.id = te.designer_id
       WHERE te.design_request_id = dr.id
     ) h ON true
     WHERE dr.deleted_at IS NULL
       AND dr.is_rando = false
       AND ($1::date IS NULL OR dr.created_at::date >= $1::date)
       AND ($2::date IS NULL OR dr.created_at::date <= $2::date)
       AND ($3::text IS NULL
         OR COALESCE(dr.company_name, '') ILIKE $3 ESCAPE '\\'
         OR COALESCE(dr.tricode, '') ILIKE $3 ESCAPE '\\')

     UNION ALL

     SELECT cg.id::text,
            'cg',
            COALESCE(NULLIF(TRIM(cg.team_name), ''), '(no client)'),
            NULLIF(TRIM(cg.tricode), ''),
            cg.job_title,
            cg.status,
            s.full_name,
            v.name,
            cg.created_at,
            cg.due_date::text,
            COALESCE(h.hours, 0)::float8,
            h.entry_designers
     FROM cg_design_requests cg
     LEFT JOIN staff s ON s.id = cg.designer_id
     LEFT JOIN venues v ON v.id = cg.venue_id
     LEFT JOIN LATERAL (
       SELECT SUM(te.hours) AS hours,
              array_agg(DISTINCT st.full_name) FILTER (WHERE st.full_name IS NOT NULL) AS entry_designers
       FROM designer_time_entries te
       LEFT JOIN staff st ON st.id = te.designer_id
       WHERE te.cg_design_request_id = cg.id
     ) h ON true
     WHERE cg.deleted_at IS NULL
       AND ($1::date IS NULL OR cg.created_at::date >= $1::date)
       AND ($2::date IS NULL OR cg.created_at::date <= $2::date)
       AND ($3::text IS NULL
         OR COALESCE(cg.team_name, '') ILIKE $3 ESCAPE '\\'
         OR COALESCE(cg.tricode, '') ILIKE $3 ESCAPE '\\')

     ORDER BY created_at DESC`,
    params
  )

  const clients = new Map<string, ClientRollup & { designerSet: Set<string> }>()
  const allDesigners = new Set<string>()
  let totalHours = 0

  for (const row of r.rows) {
    const key = row.client as string
    let cur = clients.get(key)
    if (!cur) {
      cur = { client: key, tricode: null, total: 0, hours: 0, designers: 0, by_status: {}, requests: [], designerSet: new Set<string>() }
      clients.set(key, cur)
    }
    if (row.tricode && !cur.tricode) cur.tricode = row.tricode

    const hours = Number(row.hours || 0)
    cur.total++
    cur.hours += hours
    totalHours += hours
    cur.by_status[row.status] = (cur.by_status[row.status] || 0) + 1

    if (row.designer) { cur.designerSet.add(row.designer); allDesigners.add(row.designer) }
    for (const name of (row.entry_designers || []) as string[]) {
      cur.designerSet.add(name)
      allDesigners.add(name)
    }

    cur.requests.push({
      id: row.id,
      source: row.source,
      title: row.title,
      status: row.status,
      designer: row.designer || null,
      venue_name: row.venue_name || null,
      hours: Number(hours.toFixed(2)),
      created_at: row.created_at,
      due_date: row.due_date || null,
    })
  }

  const rows: ClientRollup[] = Array.from(clients.values())
    .map(({ designerSet, ...c }) => ({
      ...c,
      hours: Number(c.hours.toFixed(2)),
      designers: designerSet.size,
    }))
    .sort((a, b) => b.hours - a.hours || b.total - a.total)

  if (format === 'csv') {
    const header = ['Client', 'Tri-code', 'Type', 'Title', 'Status', 'Designer', 'Hours', 'Venue', 'Created', 'Due']
    const body: unknown[][] = []
    for (const c of rows) {
      for (const req of c.requests) {
        body.push([
          c.client, c.tricode || '', req.source === 'cg' ? 'CG' : 'Design', req.title,
          req.status.replace(/_/g, ' '), req.designer || '', req.hours, req.venue_name || '',
          req.created_at ? new Date(req.created_at).toISOString().slice(0, 10) : '',
          req.due_date || '',
        ])
      }
    }
    const csv = [header, ...body].map(line => line.map(csvEscape).join(',')).join('\n')
    const span = `${from || 'all'}-to-${to || new Date().toISOString().slice(0, 10)}`
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="design-creative-${span}.csv"`,
      },
    })
  }

  return NextResponse.json({
    from, to, client,
    totals: {
      requests: r.rows.length,
      hours: Number(totalHours.toFixed(2)),
      clients: rows.length,
      designers: allDesigners.size,
    },
    clients: rows,
  })
}
