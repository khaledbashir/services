import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/rbac'
import { NocoOps } from '@/lib/nocodb-ops'
import { buildColumnConfig, reshapeRecord, type NocoColumn } from '@/lib/nocodb-schema'

// GET  /api/noco/<tableId>?action=schema
//      /api/noco/<tableId>?action=list&limit=500
// PATCH /api/noco/<tableId>     body: { id, fields }
//
// One generic endpoint for any NocoDB table. Schema → DataGrid column config
// derived from NocoDB's UIDT metadata, records reshaped to match.
export async function GET(request: NextRequest, { params }: { params: { tableId: string } }) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!NocoOps.configured()) return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'list'

  try {
    if (action === 'schema') {
      const meta = await NocoOps.getTable(params.tableId) as { id: string; title: string; columns: NocoColumn[] }
      const columns = buildColumnConfig({ id: meta.id, title: meta.title, columns: meta.columns })
      return NextResponse.json({
        table: { id: meta.id, title: meta.title },
        columns,
      })
    }

    if (action === 'list') {
      const limit = Math.min(Number(searchParams.get('limit') || 500), 1000)
      const meta = await NocoOps.getTable(params.tableId) as { id: string; title: string; columns: NocoColumn[] }
      const { records, pageInfo } = await NocoOps.listRecords(params.tableId, {
        sort: '-CreatedAt',
        limit,
      })
      const items = records.map(r => reshapeRecord(r as any, meta.columns))
      return NextResponse.json({
        items,
        total: pageInfo?.totalRows || items.length,
        table: { id: meta.id, title: meta.title },
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[noco/[tableId] GET]', err)
    return NextResponse.json({ error: 'NocoDB lookup failed' }, { status: 502 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { tableId: string } }) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!NocoOps.configured()) return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })

  const body = await request.json()
  const { id, fields } = body || {}
  if (id == null) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!fields || typeof fields !== 'object') return NextResponse.json({ error: 'fields object required' }, { status: 400 })

  try {
    const result = await NocoOps.updateRecords(params.tableId, [{ Id: Number(id), ...fields }])
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.error('[noco/[tableId] PATCH]', err)
    return NextResponse.json({ error: 'NocoDB update failed' }, { status: 502 })
  }
}
