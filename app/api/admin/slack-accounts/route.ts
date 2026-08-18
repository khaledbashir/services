export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Linking staff records to Slack accounts — admin only.
 *
 * GET  reports the current state, including who has no Slack account to link.
 * POST fills in the missing ids from the workspace roster, matching on email;
 *      `?dryRun=1` reports what it would do without writing.
 *
 * This lives as a route rather than a script because the database is only
 * reachable from inside the app, and because the pass has to be re-run
 * whenever people join — a direct message to a lead who was never linked goes
 * nowhere, which is how the venue-channel @mentions came to be empty.
 */
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { linkStaffToSlack } from '@/lib/slack-directory'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const staff = await query(
    `SELECT COUNT(*)::int AS active,
            COUNT(*) FILTER (WHERE COALESCE(array_length(slack_user_ids, 1), 0) > 0)::int AS linked
     FROM staff
     WHERE COALESCE(is_active, true) = true`,
  )
  const leads = await query(
    `SELECT COUNT(DISTINCT s.id)::int AS leads,
            COUNT(DISTINCT s.id) FILTER (WHERE COALESCE(array_length(s.slack_user_ids, 1), 0) > 0)::int AS linked
     FROM venues v
     JOIN staff s ON s.id IN (v.venue_manager_id, v.lead_field_rep_id)
     WHERE COALESCE(s.is_active, true) = true`,
  )

  return NextResponse.json({ staff: staff.rows[0], venue_leads: leads.rows[0] })
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1'
  try {
    return NextResponse.json({ dry_run: dryRun, ...(await linkStaffToSlack({ dryRun })) })
  } catch (err: any) {
    console.error('[slack-accounts] link failed', err)
    return NextResponse.json({ error: err?.message || 'Failed to link Slack accounts' }, { status: 500 })
  }
}
