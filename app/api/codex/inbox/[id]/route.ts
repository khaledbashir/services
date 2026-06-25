import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorized(request: NextRequest): boolean {
  const expected = process.env.CODEX_INBOX_API_KEY || process.env.JWT_SECRET || ''
  if (!expected) return false
  const url = new URL(request.url)
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  const key = request.headers.get('x-codex-inbox-key') || url.searchParams.get('key') || bearer
  return key === expected
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const allowedStatuses = new Set(['new', 'in_progress', 'needs_info', 'needs_verification', 'done', 'ignored'])
  const updates: string[] = ['updated_at = NOW()']
  const values: any[] = [params.id]

  if (typeof body.status === 'string' && allowedStatuses.has(body.status)) {
    values.push(body.status)
    updates.push(`status = $${values.length}`)
    if (body.status === 'done' || body.status === 'ignored') updates.push(`processed_at = NOW()`)
  }
  if (typeof body.codex_notes === 'string') {
    values.push(body.codex_notes)
    updates.push(`codex_notes = $${values.length}`)
  }
  if (typeof body.owner === 'string') {
    values.push(body.owner)
    updates.push(`owner = $${values.length}`)
  }

  const r = await query(
    `UPDATE codex_request_inbox
        SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING id::text, status, title, codex_notes, owner, updated_at`,
    values,
  )

  if (!r.rows[0]) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 })
  return NextResponse.json({ ok: true, row: r.rows[0] })
}
