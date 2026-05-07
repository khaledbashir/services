export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/rbac'
import { NocoOps } from '@/lib/nocodb-ops'

// NocoDB NY base — Issues table.
const ISSUES_TABLE_ID = 'moy7mzg7jism13q'

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!NocoOps.configured()) return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'list'

  try {
    if (action === 'list') {
      const limit = Math.min(Number(searchParams.get('limit') || 500), 1000)
      const { records, pageInfo } = await NocoOps.listRecords(ISSUES_TABLE_ID, {
        sort: '-CreatedAt',
        limit,
      })
      const items = records.map((r: any) => {
        const affected = Array.isArray(r['Affected Displays']) ? r['Affected Displays'] : []
        const dateRaw = r['Date Reported Dt'] || r['Date Reported'] || r['CreatedAt']
        return {
          id: String(r['Id']),
          issue_id: String(r['Issue ID'] || '').trim(),
          status: r['Status'] || null,
          priority: r['Priority'] || null,
          summary: String(r['Issue Summary'] || '').trim() || null,
          player_name: String(r['Player Name'] || '').trim() || null,
          venue: String(r['Venue'] || '').trim() || null,
          assign_to: String(r['Assign to'] || '').trim() || null,
          observed_state: r['Observed State'] || null,
          anc_action: r['ANC Action'] || null,
          three_letter_code: String(r['Three Letter Code'] || '').trim() || null,
          ownership: r['Ownership'] || null,
          created_by: String(r['Created By'] || '').trim() || null,
          date_reported: dateRaw ? String(dateRaw).slice(0, 10) : null,
          closed_date: r['Closed Date'] ? String(r['Closed Date']).slice(0, 10) : null,
          time_to_close: r['Time to Close'] || null,
          affected_displays: affected.map((a: any) => a['Display Name']).filter(Boolean).join(', ') || null,
          details: r['Details'] || null,
          notes: r['Notes'] || null,
          created_at: r['CreatedAt'] || null,
          updated_at: r['UpdatedAt'] || null,
        }
      })
      return NextResponse.json({ items, total: pageInfo?.totalRows || items.length })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[issues/nocodb GET]', err)
    return NextResponse.json({ error: 'NocoDB lookup failed' }, { status: 502 })
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!NocoOps.configured()) return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })

  const body = await request.json()
  const { id, fields } = body || {}
  if (id == null) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!fields || typeof fields !== 'object') return NextResponse.json({ error: 'fields object required' }, { status: 400 })

  try {
    const result = await NocoOps.updateRecords(ISSUES_TABLE_ID, [{ Id: Number(id), ...fields }])
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.error('[issues/nocodb PATCH]', err)
    return NextResponse.json({ error: 'NocoDB update failed' }, { status: 502 })
  }
}
