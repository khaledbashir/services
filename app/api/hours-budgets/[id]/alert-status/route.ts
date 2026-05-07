export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  try {
    const { id } = params
    const result = await query(
      `SELECT threshold, alerted_at, slack_sent, email_sent, percent_at_alert 
       FROM budget_alert_log 
       WHERE budget_id = $1 
       ORDER BY threshold DESC`,
      [id]
    )

    return NextResponse.json({ alerts: result.rows })
  } catch (err) {
    console.error('[alert-status] GET error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
