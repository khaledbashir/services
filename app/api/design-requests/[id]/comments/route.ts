import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

// Comment thread for design requests (Alexis 5/6 — distinct from notes,
// reverse-chrono, @-mentions). Same side-table pattern as priority +
// internal-categories: keyed by TEXT request id so it works for both local
// Postgres + Twenty-backed records.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS design_request_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_request_id TEXT NOT NULL,
    author_id UUID,
    author_name TEXT,
    body TEXT NOT NULL,
    mentions TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_design_request_comments_request_id
    ON design_request_comments (design_request_id, created_at DESC);
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
      `SELECT id, design_request_id, author_id, author_name, body, mentions, created_at, updated_at
       FROM design_request_comments
       WHERE design_request_id = $1
       ORDER BY created_at DESC`,
      [params.id],
    )
    return NextResponse.json({ comments: res.rows })
  } catch (err) {
    console.error('Error reading comments:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth
    await ensureSchema()

    const body = await request.json()
    const text = typeof body?.body === 'string' ? body.body.trim() : ''
    const mentions = Array.isArray(body?.mentions)
      ? body.mentions.filter((m: any) => typeof m === 'string').map((m: string) => m.trim()).filter(Boolean)
      : []
    if (!text) return NextResponse.json({ error: 'body required' }, { status: 400 })

    const res = await query(
      `INSERT INTO design_request_comments (design_request_id, author_id, author_name, body, mentions)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, design_request_id, author_id, author_name, body, mentions, created_at, updated_at`,
      [params.id, auth.userId || null, auth.fullName || null, text, mentions],
    )
    return NextResponse.json({ comment: res.rows[0] })
  } catch (err) {
    console.error('Error creating comment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
