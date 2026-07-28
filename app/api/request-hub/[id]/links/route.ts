export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'
import { logHubActivity } from '@/lib/request-hub/core'

const LINK_KINDS = new Set([
  'account', 'venue', 'opportunity', 'project', 'app', 'document', 'slack_thread', 'kb', 'url',
])

// POST /api/request-hub/[id]/links — { kind, label, ref_id?, url? }
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth

  const parent = await query(`SELECT id FROM request_hub_items WHERE id = $1`, [params.id])
  if (!parent.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const kind = String(body?.kind || 'url')
  if (!LINK_KINDS.has(kind)) return NextResponse.json({ error: 'Unknown link kind' }, { status: 400 })
  const label = String(body?.label || '').trim()
  const refId = body?.ref_id ? String(body.ref_id) : null
  const url = body?.url ? String(body.url) : null
  if (!label && !url && !refId) {
    return NextResponse.json({ error: 'Provide a label, record, or URL' }, { status: 400 })
  }

  const res = await query(
    `INSERT INTO request_hub_links (request_id, kind, label, ref_id, url, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [params.id, kind, label || url || refId, refId, url, auth.userId]
  )
  await logHubActivity({
    requestId: params.id,
    eventType: 'link',
    actor: { userId: auth.userId, fullName: auth.fullName },
    toValue: `${kind}:${label || url || refId}`,
  })
  return NextResponse.json({ link: res.rows[0] }, { status: 201 })
}

// DELETE /api/request-hub/[id]/links?linkId=...
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth
  const linkId = request.nextUrl.searchParams.get('linkId')
  if (!linkId) return NextResponse.json({ error: 'linkId required' }, { status: 400 })
  await query(`DELETE FROM request_hub_links WHERE id = $1 AND request_id = $2`, [linkId, params.id])
  return NextResponse.json({ ok: true })
}
