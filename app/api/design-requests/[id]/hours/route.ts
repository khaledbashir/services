import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

// Per-job hour logging. Alexis 2026-04-23: "designer can log hours instead
// of an estimate for the full job." The designer_time_entries table already
// has design_request_id; this endpoint is the thin read/write over it scoped
// to one design request.
//
// GET  → list this request's entries with running total
// POST → { hours, description?, entry_date?, designer_id? } add a new entry

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const r = await query(
    `SELECT te.id, te.hours, te.description, te.entry_date::text, te.created_at,
            te.designer_id, s.full_name as designer_name
     FROM designer_time_entries te
     LEFT JOIN staff s ON s.id = te.designer_id
     WHERE te.design_request_id = $1
     ORDER BY te.entry_date DESC, te.created_at DESC`,
    [params.id]
  )
  const total = r.rows.reduce((sum: number, row: any) => sum + Number(row.hours || 0), 0)
  return NextResponse.json({
    entries: r.rows,
    total_hours: Number(total.toFixed(2)),
  })
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({}))
  const hours = Number(body.hours)
  if (!Number.isFinite(hours) || hours <= 0) {
    return NextResponse.json({ error: 'hours must be a positive number' }, { status: 400 })
  }
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 500) : null
  const entryDate = typeof body.entry_date === 'string' && body.entry_date ? body.entry_date : null
  // Default the designer to whoever is logging unless a specific ID was passed
  // (managers logging on behalf of a designer).
  const designerId = typeof body.designer_id === 'string' && body.designer_id ? body.designer_id : auth.userId

  // Make sure the design request exists locally — same stub pattern as the
  // proofs upload endpoint, so Twenty-only records still work.
  const exists = await query(`SELECT id FROM design_requests WHERE id = $1`, [params.id])
  if (exists.rows.length === 0) {
    return NextResponse.json({ error: 'Design request not found' }, { status: 404 })
  }

  const inserted = await query(
    `INSERT INTO designer_time_entries
       (design_request_id, designer_id, entry_date, hours, description)
     VALUES ($1, $2, COALESCE($3::date, CURRENT_DATE), $4, $5)
     RETURNING id, hours, description, entry_date::text, created_at`,
    [params.id, designerId, entryDate, hours, description]
  )

  // Keep the denormalised hours_spent column on design_requests in sync so
  // the existing progress bar + kanban card labels don't need to change.
  await query(
    `UPDATE design_requests
     SET hours_spent = COALESCE((
       SELECT SUM(hours) FROM designer_time_entries WHERE design_request_id = $1
     ), 0), updated_at = NOW()
     WHERE id = $1`,
    [params.id]
  )

  return NextResponse.json({ entry: inserted.rows[0] })
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  const url = new URL(request.url)
  const entryId = url.searchParams.get('entry_id')
  if (!entryId) return NextResponse.json({ error: 'entry_id required' }, { status: 400 })

  await query(
    `DELETE FROM designer_time_entries WHERE id = $1 AND design_request_id = $2`,
    [entryId, params.id]
  )
  await query(
    `UPDATE design_requests
     SET hours_spent = COALESCE((
       SELECT SUM(hours) FROM designer_time_entries WHERE design_request_id = $1
     ), 0), updated_at = NOW()
     WHERE id = $1`,
    [params.id]
  )
  return NextResponse.json({ ok: true })
}
