import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

// Side-table for CG Design final location + proof link (Alexis 5/6).
// Mirrors the design_request_priorities + design_request_internal_categories
// pattern: keyed by TEXT cg request id so it works for both local Postgres
// and Twenty-backed records, no schema change to cg_design_requests itself.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS cg_design_finals (
    cg_design_id TEXT PRIMARY KEY,
    final_location TEXT,
    proof_url TEXT,
    set_by UUID,
    set_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
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
      `SELECT cg_design_id, final_location, proof_url, set_at
       FROM cg_design_finals WHERE cg_design_id = $1`,
      [params.id],
    )
    return NextResponse.json({ finals: res.rows[0] || null })
  } catch (err) {
    console.error('Error reading CG finals:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth
    await ensureSchema()

    const body = await request.json()
    const final_location = typeof body?.final_location === 'string' ? body.final_location.trim() || null : null
    const proof_url = typeof body?.proof_url === 'string' ? body.proof_url.trim() || null : null

    if (!final_location && !proof_url) {
      // Both empty → delete the row.
      await query('DELETE FROM cg_design_finals WHERE cg_design_id = $1', [params.id])
      return NextResponse.json({ finals: null })
    }

    await query(
      `INSERT INTO cg_design_finals (cg_design_id, final_location, proof_url, set_by, set_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (cg_design_id)
       DO UPDATE SET final_location = EXCLUDED.final_location, proof_url = EXCLUDED.proof_url, set_by = EXCLUDED.set_by, set_at = NOW()`,
      [params.id, final_location, proof_url, auth.userId || null],
    )
    return NextResponse.json({ finals: { cg_design_id: params.id, final_location, proof_url } })
  } catch (err) {
    console.error('Error setting CG finals:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
