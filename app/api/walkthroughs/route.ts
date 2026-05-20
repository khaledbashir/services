export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Walkthroughs, isTwentyBackedEnabled, twentyVenueToDashboard, type TwentyWalkthroughLog } from '@/lib/twenty-ops'
import { awardPointsOnce } from '@/lib/gamification'

// Legacy response shape the /walkthroughs page consumes:
//   { walkthroughs: [ { id, venue_id, venue_name, technician_id, technician_name,
//                       log_date, log_time, locations_visited, issues_found,
//                       result, in_person, three_letter_code, notes,
//                       created_at, updated_at } ] }

function normalizeResult(raw: string | null | undefined): string {
  if (!raw) return 'good'
  // Twenty stores RESULT_GOOD / RESULT_PROBLEM / RESULT_MINOR — strip + lowercase.
  return raw.toString().replace(/^RESULT_/i, '').toLowerCase() || 'good'
}

async function reshapeWalkthrough(log: TwentyWalkthroughLog) {
  const l = log as any
  const notes = typeof l.notes === 'object'
    ? l.notes?.markdown || l.notes?.blocknote || ''
    : (l.notes || '')
  const issuesFound = typeof l.issuesFound === 'object'
    ? l.issuesFound?.markdown || l.issuesFound?.blocknote || ''
    : (l.issuesFound || '')
  const venue = l.walkVenueId ? await twentyVenueToDashboard(l.walkVenueId) : null
  return {
    id: log.id,
    venue_id: venue?.venue_id || null,
    venue_name: venue?.venue_name || '',
    technician_id: l.walkTechnicianId || null,
    technician_name: l.technicianName || null,
    log_date: l.logDate,
    log_time: l.logTime,
    locations_visited: l.locationsVisited || null,
    issues_found: issuesFound,
    result: normalizeResult(l.result),
    in_person: l.inPerson ?? true,
    three_letter_code: l.threeLetterCode || null,
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
      const { searchParams } = new URL(request.url)
      const from = searchParams.get('from')
      const to = searchParams.get('to')
      const result = searchParams.get('result')
      const limit = Math.min(Math.max(Number(searchParams.get('limit') || 200), 1), 2000)

      // Walkthrough log has 15k+ records. Filters are mandatory.
      const filters: string[] = []
      if (result && result !== 'all') filters.push(`result[eq]:"${result}"`)
      if (from) filters.push(`logDate[gte]:"${from}"`)
      if (to)   filters.push(`logDate[lte]:"${to}"`)

      const items: any[] = []
      let cursor: string | null = null
      while (items.length < limit) {
        const pageSize = Math.min(60, limit - items.length)
        const page = await Walkthroughs.list({
          limit: pageSize,
          startingAfter: cursor || undefined,
          filter: filters.length ? filters.join(',') : undefined,
          orderBy: 'logDate[DescNullsLast]',
        })
        for (const log of page.items) items.push(await reshapeWalkthrough(log))
        if (!page.hasNextPage || !page.nextCursor) break
        cursor = page.nextCursor
      }
      return NextResponse.json({ walkthroughs: items, next_cursor: cursor, filters_applied: filters.length })
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
      if (technician_id && technician_name) {
        awardPointsOnce(technician_id, technician_name, 'WALKTHROUGH_COMPLETED', `walkthrough:${created.id}`, { venue_id, walkthrough_id: created.id }).catch(() => {})
      }
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

  // Gamification: award points for walkthrough completion
  if (technician_id && technician_name) {
    awardPointsOnce(technician_id, technician_name, 'WALKTHROUGH_COMPLETED', `walkthrough:${r.rows[0]?.id}`, { venue_id, walkthrough_id: r.rows[0]?.id }).catch(() => {})
  }

  return NextResponse.json({ walkthrough: r.rows[0] })
}
