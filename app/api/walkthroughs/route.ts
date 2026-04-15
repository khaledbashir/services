import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

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
