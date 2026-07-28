export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'
import { getHubConfig } from '@/lib/request-hub/config'
import { resolveHubPermissions, canSeeAll } from '@/lib/request-hub/roles'
import { addComment, setRequestStatus } from '@/lib/request-hub/core'
import { notifyRequester, requestUrl } from '@/lib/request-hub/slack'

// POST /api/request-hub/[id]/comments
// body: { body: string, kind?: 'comment' | 'clarification_answer' }
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const text = String(body.body || '').trim()
  if (!text) return NextResponse.json({ error: 'Comment body required' }, { status: 400 })

  const existing = await query(`SELECT * FROM request_hub_items WHERE id = $1`, [params.id])
  const row = existing.rows[0]
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const config = await getHubConfig()
  const perms = resolveHubPermissions(
    { userId: auth.userId, fullName: auth.fullName, role: auth.role },
    config
  )
  const isRequester = row.requester_id === auth.userId
  if (!canSeeAll(perms) && !isRequester) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const kind = body.kind === 'clarification_answer' ? 'clarification_answer' : 'comment'
  const comment = await addComment(params.id, text, { userId: auth.userId, fullName: auth.fullName }, kind)

  // A requester answering clarification questions moves the request back into
  // the review flow automatically.
  let updated = row
  if (kind === 'clarification_answer' && row.status === 'needs_clarification') {
    updated =
      (await setRequestStatus(
        params.id,
        'feasibility',
        { userId: auth.userId, fullName: auth.fullName },
        { detail: { via: 'clarification_answer' }, config }
      )) || row
    await query(`UPDATE request_hub_items SET pending_questions = '[]'::jsonb WHERE id = $1`, [params.id])
  }

  // Quiet notify: a reviewer commenting pings the requester once; requester
  // comments surface to the owner in the app, not via broadcast.
  if (!isRequester && row.requester_slack_id) {
    notifyRequester(
      row,
      `${auth.fullName} commented on ${row.request_number}: ${text.slice(0, 200)}\n${requestUrl(row.id)}`
    ).catch(() => {})
  }

  return NextResponse.json({ comment, request: updated }, { status: 201 })
}
