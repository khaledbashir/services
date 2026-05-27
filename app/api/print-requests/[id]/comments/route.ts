export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { normalizeAttachment } from '@/lib/ticket-attachments'

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS print_request_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    print_request_id UUID NOT NULL REFERENCES print_requests(id) ON DELETE CASCADE,
    author_id UUID,
    author_name TEXT,
    body TEXT NOT NULL DEFAULT '',
    attachment_url TEXT,
    attachment_filename TEXT,
    attachment_mime TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_print_request_comments_request_id
    ON print_request_comments (print_request_id, created_at ASC);
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
      `SELECT id, print_request_id, author_id, author_name, body,
              attachment_url, attachment_filename, attachment_mime,
              created_at, updated_at
       FROM print_request_comments
       WHERE print_request_id = $1
       ORDER BY created_at ASC`,
      [params.id],
    )
    return NextResponse.json({ comments: res.rows })
  } catch (err) {
    console.error('Error reading print-request comments:', err)
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
    const attachment = body?.attachment ? normalizeAttachment(body.attachment) : null
    if (!text && !attachment) {
      return NextResponse.json({ error: 'body or attachment required' }, { status: 400 })
    }

    const res = await query(
      `INSERT INTO print_request_comments
         (print_request_id, author_id, author_name, body,
          attachment_url, attachment_filename, attachment_mime)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, print_request_id, author_id, author_name, body,
                 attachment_url, attachment_filename, attachment_mime,
                 created_at, updated_at`,
      [
        params.id,
        auth.userId || null,
        auth.fullName || null,
        text,
        attachment?.imageUrl || null,
        attachment?.filename || null,
        attachment?.mimeType || null,
      ],
    )
    await query('UPDATE print_requests SET updated_at = NOW() WHERE id = $1', [params.id])
    return NextResponse.json({ comment: res.rows[0] })
  } catch (err) {
    console.error('Error creating print-request comment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
