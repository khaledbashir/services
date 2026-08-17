export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getAuthUser } from '@/lib/rbac'
import { getWalkthrough, submitWalkthrough, type WalkthroughResultInput } from '@/lib/venue-walkthroughs'

/**
 * One assigned walk-thru: read it, then submit it (Joe 2026-08-17).
 *
 * Submitting fires the summary email and, when anything was flagged, opens the
 * ticket. Both happen inside the POST rather than on a cron so the person who
 * pressed the button sees the outcome — including the ticket number — in the
 * response.
 */
async function canAccess(userId: string, role: string, walkthroughId: string): Promise<boolean> {
  if (role !== 'technician') return true
  const result = await query(
    `SELECT 1 FROM venue_walkthroughs WHERE id = $1 AND assigned_staff_id = $2`,
    [walkthroughId, userId],
  )
  return result.rows.length > 0
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await canAccess(user.userId, user.role, params.id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const walkthrough = await getWalkthrough(params.id)
  if (!walkthrough) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(walkthrough)
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const user = await getAuthUser(request)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await canAccess(user.userId, user.role, params.id))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const existing = await getWalkthrough(params.id)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (existing.status === 'submitted') {
      return NextResponse.json({ error: 'This walk-thru has already been submitted' }, { status: 409 })
    }

    const body = await request.json().catch(() => ({}))
    const rawResults = Array.isArray(body?.results) ? body.results : []

    const results: WalkthroughResultInput[] = []
    for (const raw of rawResults) {
      if (raw?.result !== 'operating' && raw?.result !== 'issue') continue
      if (typeof raw?.template_item_id !== 'string') continue
      // "If Issue Found is selected, they should have to add detail in a text
      // field" — refused here with a readable message, and again by a database
      // constraint so no other code path can slip past it.
      if (raw.result === 'issue' && !String(raw.detail || '').trim()) {
        return NextResponse.json(
          { error: 'Every item marked "Issue found" needs detail before the walk-thru can be submitted' },
          { status: 400 },
        )
      }
      results.push({
        template_item_id: raw.template_item_id,
        result: raw.result,
        detail: raw.detail ?? null,
      })
    }

    const answeredIds = new Set(results.map((r) => r.template_item_id))
    const unanswered = existing.items.filter((item: any) => item.template_item_id && !answeredIds.has(item.template_item_id))
    if (unanswered.length > 0) {
      return NextResponse.json(
        {
          error: `${unanswered.length} item${unanswered.length === 1 ? '' : 's'} still need an answer`,
          unanswered: unanswered.map((item: any) => item.label),
        },
        { status: 400 },
      )
    }

    const staffResult = await query(`SELECT full_name FROM staff WHERE id = $1`, [user.userId])

    const outcome = await submitWalkthrough({
      walkthroughId: params.id,
      submittedBy: user.userId,
      submittedByName: staffResult.rows[0]?.full_name || 'Unknown',
      results,
      notes: typeof body?.notes === 'string' ? body.notes : null,
    })

    return NextResponse.json({ ok: true, ...outcome })
  } catch (err) {
    console.error('Error submitting walk-thru:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
