export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

// Side-table for design-request priority (Alexis 5/6 — high vs normal).
// Modelled after design_request_internal_categories: keyed by TEXT request id
// so it works for both local Postgres and Twenty-backed requests, no schema
// change to design_requests itself.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS design_request_priorities (
    design_request_id TEXT PRIMARY KEY,
    priority TEXT NOT NULL CHECK (priority IN ('high')),
    set_by UUID,
    set_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_design_request_priorities_priority
    ON design_request_priorities (priority);
`

let schemaEnsured = false
async function ensureSchema() {
  if (schemaEnsured) return
  await query(SCHEMA, [])
  schemaEnsured = true
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await ensureSchema()
    const res = await query(
      `SELECT design_request_id, priority, set_at, set_by
       FROM design_request_priorities WHERE design_request_id = $1`,
      [params.id],
    )
    return NextResponse.json({ priority: res.rows[0]?.priority || null })
  } catch (err) {
    console.error('Error reading priority:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth
    await ensureSchema()

    const body = await request.json()
    const priority = body?.priority as string | null

    if (!priority) {
      // Clearing → delete row → reverts to normal priority.
      await query('DELETE FROM design_request_priorities WHERE design_request_id = $1', [params.id])
      return NextResponse.json({ priority: null })
    }

    if (priority !== 'high') {
      return NextResponse.json({ error: 'Invalid priority (only "high" is supported; clear to revert to normal)' }, { status: 400 })
    }

    await query(
      `INSERT INTO design_request_priorities (design_request_id, priority, set_by, set_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (design_request_id)
       DO UPDATE SET priority = EXCLUDED.priority, set_by = EXCLUDED.set_by, set_at = NOW()`,
      [params.id, priority, auth.userId || null],
    )
    return NextResponse.json({ priority })
  } catch (err) {
    console.error('Error setting priority:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
