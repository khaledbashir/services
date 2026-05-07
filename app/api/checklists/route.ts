export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const { searchParams } = new URL(request.url)
  const venueId = searchParams.get('venue_id')
  const status = searchParams.get('status')
  const params: unknown[] = []
  const conditions: string[] = []
  if (venueId) { params.push(venueId); conditions.push(`c.venue_id = $${params.length}`) }
  if (status) { params.push(status); conditions.push(`c.status = $${params.length}`) }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const r = await query(
    `SELECT c.*, v.name AS venue_name, s.full_name AS assignee_name
     FROM checklist_items c
     LEFT JOIN venues v ON v.id = c.venue_id
     LEFT JOIN staff s ON s.id = c.assignee_id
     ${where} ORDER BY c.due_date ASC NULLS LAST, c.created_at DESC LIMIT 500`,
    params
  )
  return NextResponse.json({ items: r.rows })
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth
  const body = await request.json()
  const {
    venue_id = null, days_out = '30', league = null, team_name = null,
    task_description, prompt = null, assignee_id = null, due_date = null,
    status = 'not_started',
  } = body
  if (!task_description) return NextResponse.json({ error: 'task_description required' }, { status: 400 })

  const r = await query(
    `INSERT INTO checklist_items (venue_id, days_out, league, team_name, task_description, prompt,
       assignee_id, due_date, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [venue_id, days_out, league, team_name, task_description, prompt, assignee_id, due_date, status]
  )
  return NextResponse.json({ item: r.rows[0] })
}
