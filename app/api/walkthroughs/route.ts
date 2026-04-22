import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Walkthroughs, isTwentyBackedEnabled, type TwentyWalkthroughLog } from '@/lib/twenty-ops'

// Legacy response shape the /walkthroughs page consumes:
//   { walkthroughs: [ { id, venue_id, venue_name, technician_id, technician_name,
//                       log_date, log_time, locations_visited, issues_found,
//                       result, in_person, three_letter_code, notes,
//                       created_at, updated_at } ] }

function reshapeWalkthrough(log: TwentyWalkthroughLog) {
  const notes = typeof log.notes === 'object'
    ? (log.notes as any)?.markdown || (log.notes as any)?.blocknote || ''
    : (log.notes || '')
  return {
    id: log.id,
    venue_id: null,               // walkthroughLog has no direct venue FK in Twenty
    venue_name: '',
    technician_id: null,
    technician_name: null,
    log_date: log.logDate,
    log_time: log.logTime,
    locations_visited: null,
    issues_found: null,
    result: log.result,
    in_person: true,
    three_letter_code: null,
    notes,
    created_at: log.createdAt,
    updated_at: log.updatedAt,
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  if (isTwentyBackedEnabled('WALKTHROUGHS')) {
    try {
      const items: any[] = []
      let cursor: string | null = null
      // Cap at 10 pages (600 records) — the full 15k would hurt render time; Service
      // Dashboard's walkthroughs list is for recent activity, not the archive.
      for (let p = 0; p < 10; p++) {
        const page = await Walkthroughs.list({
          limit: 60,
          startingAfter: cursor || undefined,
          orderBy: 'logDate[DescNullsLast]',
        })
        for (const log of page.items) items.push(reshapeWalkthrough(log))
        if (!page.hasNextPage || !page.nextCursor) break
        cursor = page.nextCursor
      }
      return NextResponse.json({ walkthroughs: items })
    } catch (err) {
      console.error('[walkthroughs GET twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to list walkthroughs from Twenty' }, { status: 500 })
    }
  }

  const { searchParams } = new URL(request.url)
  const venueId = searchParams.get('venue_id')
  const params: unknown[] = []
  let where = ''
  if (venueId) { params.push(venueId); where = `WHERE w.venue_id = $1` }

  const r = await query(
    `SELECT w.*, v.name AS venue_name, s.full_name AS technician_name
     FROM walkthrough_logs w
     LEFT JOIN venues v ON v.id = w.venue_id
     LEFT JOIN staff s ON s.id = w.technician_id
     ${where} ORDER BY w.log_date DESC, w.created_at DESC LIMIT 500`,
    params
  )
  return NextResponse.json({ walkthroughs: r.rows })
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const body = await request.json()
  const {
    venue_id, technician_id = null, log_date = null, log_time = null,
    locations_visited = null, issues_found = null, result = 'good',
    in_person = true, technician_name = null, three_letter_code = null, notes = null,
  } = body
  if (!venue_id) return NextResponse.json({ error: 'venue_id required' }, { status: 400 })

  if (isTwentyBackedEnabled('WALKTHROUGHS')) {
    try {
      const created = await Walkthroughs.create({
        name: `Walkthrough ${log_date || new Date().toISOString().slice(0,10)}`,
        logDate: log_date || new Date().toISOString().slice(0,10),
        logTime: log_time,
        notes: notes ? { markdown: notes } : null,
        result,
      })
      return NextResponse.json({ walkthrough: { id: created.id, ...body } })
    } catch (err) {
      console.error('[walkthroughs POST twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to create walkthrough in Twenty' }, { status: 500 })
    }
  }

  const r = await query(
    `INSERT INTO walkthrough_logs (
       venue_id, technician_id, log_date, log_time, locations_visited, issues_found,
       result, in_person, technician_name, three_letter_code, notes
     ) VALUES ($1,$2,COALESCE($3,CURRENT_DATE),$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [venue_id, technician_id, log_date, log_time, locations_visited, issues_found,
     result, in_person, technician_name, three_letter_code, notes]
  )
  return NextResponse.json({ walkthrough: r.rows[0] })
}
