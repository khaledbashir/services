export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'
import { getHubConfig } from '@/lib/request-hub/config'
import { resolveHubPermissions, canSeeAll } from '@/lib/request-hub/roles'
import { getRequestDetail, logHubActivity } from '@/lib/request-hub/core'
import {
  assistIntake,
  draftFeasibilityBrief,
  findDuplicateCandidates,
  summarizeThread,
} from '@/lib/request-hub/ai'
import { slackApi } from '@/lib/slack'

// POST /api/request-hub/[id]/ai — { action: 'intake_assist' | 'feasibility' | 'duplicates' | 'summarize_thread' }
// Every response is a SUGGESTION for the caller to review and apply; nothing
// is written to the request except caching the suggestion payload.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || '')

  const detail = await getRequestDetail(params.id)
  if (!detail) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const config = await getHubConfig()
  const perms = resolveHubPermissions(
    { userId: auth.userId, fullName: auth.fullName, role: auth.role },
    config
  )
  if (!canSeeAll(perms) && detail.requester_id !== auth.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (action === 'intake_assist') {
    const assist = await assistIntake(detail, config)
    if (!assist) return NextResponse.json({ error: 'AI is unavailable right now' }, { status: 503 })
    await query(`UPDATE request_hub_items SET ai_suggestions = $2::jsonb WHERE id = $1`, [
      params.id,
      JSON.stringify(assist),
    ])
    return NextResponse.json({ suggestion: assist })
  }

  if (action === 'feasibility') {
    if (!perms.isAssessor && !perms.isApprover) {
      return NextResponse.json({ error: 'Assessors only' }, { status: 403 })
    }
    // Give the model the request's comments as extra context — real material,
    // not invented.
    const commentContext = (detail.comments || [])
      .map((c: any) => `${c.author_name || c.author_staff_name || 'someone'}: ${c.body}`)
      .join('\n')
      .slice(0, 8000)
    const brief = await draftFeasibilityBrief(detail, config, commentContext || undefined)
    if (!brief) return NextResponse.json({ error: 'AI is unavailable right now' }, { status: 503 })
    await logHubActivity({
      requestId: params.id,
      eventType: 'assessment',
      actor: { userId: auth.userId, fullName: auth.fullName },
      detail: { ai_draft: true },
    })
    return NextResponse.json({ suggestion: brief, aiDraft: true })
  }

  if (action === 'duplicates') {
    const dupes = await findDuplicateCandidates(
      `${detail.title || ''} ${detail.summary || ''} ${JSON.stringify(detail.answers || {})}`,
      params.id
    )
    return NextResponse.json({ duplicates: dupes })
  }

  if (action === 'summarize_thread') {
    if (!detail.source_channel_id || !detail.source_message_ts) {
      return NextResponse.json({ error: 'This request has no linked Slack thread' }, { status: 400 })
    }
    try {
      const replies = await slackApi('conversations.replies', {
        channel: detail.source_channel_id,
        ts: detail.source_message_ts,
        limit: 60,
      })
      if (!replies?.ok) {
        return NextResponse.json({ error: 'Could not read the Slack thread' }, { status: 502 })
      }
      const messages = (replies.messages || [])
        .filter((m: any) => m.text)
        .map((m: any) => ({ author: m.user || m.username || 'user', text: String(m.text) }))
      const summary = await summarizeThread(messages)
      if (!summary) return NextResponse.json({ error: 'AI is unavailable right now' }, { status: 503 })
      return NextResponse.json({ suggestion: summary })
    } catch (err) {
      console.warn('[request-hub] thread summary failed:', err)
      return NextResponse.json({ error: 'Could not read the Slack thread' }, { status: 502 })
    }
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
