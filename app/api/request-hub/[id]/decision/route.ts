export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'
import { getHubConfig } from '@/lib/request-hub/config'
import { resolveHubPermissions } from '@/lib/request-hub/roles'
import { applyDecision, type HubDecision } from '@/lib/request-hub/core'
import {
  refreshDecisionCard,
  sendClarificationQuestions,
  notifyStatusChange,
} from '@/lib/request-hub/slack'

const DECISIONS: HubDecision[] = ['approve', 'decline', 'hold', 'need_info']

// POST /api/request-hub/[id]/decision
// body: { decision: 'approve'|'decline'|'hold'|'need_info', reason?: string, questions?: string[] }
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const decision = body.decision as HubDecision
  if (!DECISIONS.includes(decision)) {
    return NextResponse.json({ error: 'Unknown decision' }, { status: 400 })
  }

  const config = await getHubConfig()
  const perms = resolveHubPermissions(
    { userId: auth.userId, fullName: auth.fullName, role: auth.role },
    config
  )
  if (!perms.isApprover) {
    return NextResponse.json({ error: 'Decisions are limited to leadership approvers' }, { status: 403 })
  }

  const existing = await query(`SELECT id FROM request_hub_items WHERE id = $1`, [params.id])
  if (!existing.rows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const reason = body.reason ? String(body.reason).trim() : null
  const questions = Array.isArray(body.questions)
    ? body.questions.map((q: unknown) => String(q).trim()).filter(Boolean)
    : []

  if (decision === 'need_info' && questions.length === 0 && !reason) {
    return NextResponse.json(
      { error: 'Say what information you need — it goes straight to the requester.' },
      { status: 400 }
    )
  }

  const updated = await applyDecision(
    params.id,
    decision,
    reason,
    { userId: auth.userId, fullName: auth.fullName },
    { questions }
  )
  if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Slack follow-ups off the critical path.
  void (async () => {
    const labels: Record<HubDecision, string> = {
      approve: 'Approved',
      decline: 'Declined',
      hold: 'On hold',
      need_info: 'Needs information',
    }
    await refreshDecisionCard(
      updated,
      `*${labels[decision]}* by ${auth.fullName}${reason ? ` — ${reason.slice(0, 300)}` : ''}`
    )
    if (decision === 'need_info') {
      await sendClarificationQuestions(updated, questions.length ? questions : [reason || ''])
    } else {
      await notifyStatusChange(updated, updated.status)
    }
  })().catch((err) => console.warn('[request-hub] decision notify failed:', err))

  return NextResponse.json({ request: updated })
}
