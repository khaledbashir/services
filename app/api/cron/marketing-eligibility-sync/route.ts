export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { recordMarketingSyncRun, syncTwentyPeopleToMarketing } from '@/lib/marketing-sync'

function parseBoolean(value: string | null): boolean {
  return ['1', 'true', 'yes', 'y'].includes(String(value || '').toLowerCase())
}

function defaultSince(): Date {
  const date = new Date()
  date.setDate(date.getDate() - 2)
  return date
}

async function getLastSuccessfulSync(): Promise<Date | null> {
  const result = await query(
    `SELECT created_at
     FROM marketing_sync_runs
     WHERE sync_type = 'twenty_crm_marketing_eligibility'
       AND status = 'success'
     ORDER BY created_at DESC
     LIMIT 1`,
  )
  const value = result.rows[0]?.created_at
  return value ? new Date(value) : null
}

export async function GET(request: NextRequest) {
  const startedAt = new Date()
  try {
    const sp = request.nextUrl.searchParams
    const dryRun = parseBoolean(sp.get('dryRun'))
    const limit = Number(sp.get('limit') || 300)
    const sinceParam = sp.get('since')
    const since = sinceParam ? new Date(sinceParam) : ((await getLastSuccessfulSync()) || defaultSince())
    const validSince = Number.isNaN(since.getTime()) ? defaultSince() : since

    const result = await syncTwentyPeopleToMarketing({
      limit,
      since: validSince,
      dryRun,
    })

    const payload = {
      ...result,
      since: validSince.toISOString(),
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
    }

    if (!dryRun) await recordMarketingSyncRun('twenty_crm_marketing_eligibility', payload)
    return NextResponse.json(payload)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown marketing eligibility sync error'
    const payload = {
      error: message,
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
    }
    try {
      await recordMarketingSyncRun('twenty_crm_marketing_eligibility', payload, 'failed')
    } catch {
      // best-effort audit only
    }
    console.error('Error syncing CRM marketing eligibility:', err)
    return NextResponse.json(payload, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
