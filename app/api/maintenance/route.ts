import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const venueId = searchParams.get('venue_id')

  const conditions: string[] = []
  const params: unknown[] = []
  if (status) { params.push(status); conditions.push(`m.status = $${params.length}`) }
  if (venueId) { params.push(venueId); conditions.push(`m.venue_id = $${params.length}`) }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const result = await query(
    `SELECT m.*, v.name AS venue_name, s.full_name AS technician_name, i.item_name AS asset_name
     FROM maintenance_logs m
     LEFT JOIN venues v ON v.id = m.venue_id
     LEFT JOIN staff s ON s.id = m.technician_id
     LEFT JOIN inventory i ON i.id = m.asset_id
     ${where}
     ORDER BY m.reported_date DESC NULLS LAST, m.created_at DESC LIMIT 500`,
    params
  )
  return NextResponse.json({ logs: result.rows })
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const body = await request.json()
  const {
    venue_id, asset_id = null, station_id = null, technician_id = null,
    maintenance_type = 'reactive', issue = null, issue_summary = null, details_to_resolve = null,
    status = 'open', reported_date = null, scheduled_date = null, completed_date = null,
    escort_information = null, location_reported = null, techs_scheduled = null,
  } = body
  if (!venue_id) return NextResponse.json({ error: 'venue_id required' }, { status: 400 })

  const result = await query(
    `INSERT INTO maintenance_logs (
       venue_id, asset_id, station_id, technician_id, maintenance_type, issue, issue_summary,
       details_to_resolve, status, reported_date, scheduled_date, completed_date,
       escort_information, location_reported, techs_scheduled
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [venue_id, asset_id, station_id, technician_id, maintenance_type, issue, issue_summary,
     details_to_resolve, status, reported_date, scheduled_date, completed_date,
     escort_information, location_reported, techs_scheduled]
  )
  return NextResponse.json({ log: result.rows[0] })
}
