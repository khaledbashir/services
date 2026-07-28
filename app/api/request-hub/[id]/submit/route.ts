export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireAuth, isAuthError } from '@/lib/rbac'
import { getHubConfig } from '@/lib/request-hub/config'
import { submitRequest, getRequestDetail } from '@/lib/request-hub/core'
import { assistIntake, findDuplicateCandidates } from '@/lib/request-hub/ai'
import { dmRequesterConfirmation, postIntakeCard } from '@/lib/request-hub/slack'

// POST /api/request-hub/[id]/submit — finalize a draft.
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireAuth(request)
  if (isAuthError(auth)) return auth

  const existing = await query(`SELECT * FROM request_hub_items WHERE id = $1`, [params.id])
  const row = existing.rows[0]
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (row.requester_id !== auth.userId && auth.role !== 'admin') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const config = await getHubConfig()
  const submitted = await submitRequest(params.id, { userId: auth.userId, fullName: auth.fullName }, config)
  if (!submitted) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Post-submission pipeline (AI polish, Slack card + DM) — off the critical
  // path so submission is instant for the requester.
  void (async () => {
    try {
      let current = submitted
      if (!current.title || !current.summary) {
        const assist = await assistIntake(current, config)
        if (assist) {
          const upd = await query(
            `UPDATE request_hub_items
             SET title = COALESCE(NULLIF(title, ''), $2), summary = COALESCE(NULLIF(summary, ''), $3),
                 ai_suggestions = $4::jsonb, updated_at = NOW()
             WHERE id = $1 RETURNING *`,
            [current.id, assist.title?.slice(0, 120) || null, assist.summary || null, JSON.stringify(assist)]
          )
          if (upd.rows[0]) current = upd.rows[0]
        }
      }
      const detail = await getRequestDetail(current.id)
      await dmRequesterConfirmation(detail || current, config)
      await postIntakeCard(detail || current, config)
    } catch (err) {
      console.warn('[request-hub] submit pipeline failed:', err)
    }
  })()

  const duplicates = await findDuplicateCandidates(
    `${submitted.title || ''} ${submitted.summary || ''} ${JSON.stringify(submitted.answers || {})}`,
    submitted.id
  ).catch(() => [])

  return NextResponse.json({
    request: submitted,
    duplicates,
    responseTimeText: config.responseTimeText,
  })
}
