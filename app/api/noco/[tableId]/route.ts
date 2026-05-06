import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/rbac'
import { NocoOps } from '@/lib/nocodb-ops'
import { buildColumnConfig, reshapeRecord, filterRulesToNocoWhere, sortingToNocoSort, type NocoColumn } from '@/lib/nocodb-schema'

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
      const offset = Math.max(Number(searchParams.get('offset') || 0), 0)
      // Filter + sort coming from the grid. `filter` is JSON-encoded array of
      // FilterRule, `sort` is the SortingState array. Both optional.
      let where = ''
      let sort = '-CreatedAt'
      const rawFilter = searchParams.get('filter')
      const rawSort = searchParams.get('sort')
      if (rawFilter) {
        try { where = filterRulesToNocoWhere(JSON.parse(rawFilter)) } catch {}
      }
      if (rawSort) {
        try {
          const userSort = sortingToNocoSort(JSON.parse(rawSort))
          if (userSort) sort = userSort
        } catch {}
      }
      const meta = await NocoOps.getTable(params.tableId) as { id: string; title: string; columns: NocoColumn[] }
      const { records, pageInfo } = await NocoOps.listRecords(params.tableId, {
        sort,
        limit,
        offset,
        where: where || undefined,
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

export async function POST(request: NextRequest, { params }: { params: { tableId: string } }) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!NocoOps.configured()) return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })

  // Body is the field map for the new row. Empty body OK — creates a blank
  // row that the caller (the DataGrid Add-row button) immediately opens in
  // the drawer for editing.
  let fields: Record<string, unknown> = {}
  try {
    const text = await request.text()
    if (text) fields = JSON.parse(text) || {}
  } catch {}

  try {
    const created = await NocoOps.createRecords(params.tableId, [fields])
    const newId = created[0]?.Id
    if (newId == null) return NextResponse.json({ error: 'create returned no id' }, { status: 502 })
    // Re-fetch the row so the caller gets the reshaped record back (with
    // CreatedAt, default values, etc).
    const meta = await NocoOps.getTable(params.tableId) as { columns: any[] }
    const { records } = await NocoOps.listRecords(params.tableId, {
      where: `(Id,eq,${newId})`,
      limit: 1,
    })
    const { reshapeRecord } = await import('@/lib/nocodb-schema')
    const row = records[0] ? reshapeRecord(records[0] as any, meta.columns) : { id: String(newId) }
    return NextResponse.json({ ok: true, row })
  } catch (err) {
    console.error('[noco/[tableId] POST]', err)
    return NextResponse.json({ error: 'NocoDB create failed' }, { status: 502 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { tableId: string } }) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!NocoOps.configured()) return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const id = body?.id
  if (id == null) return NextResponse.json({ error: 'id required' }, { status: 400 })

  try {
    await NocoOps.deleteRecords(params.tableId, [Number(id)])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[noco/[tableId] DELETE]', err)
    return NextResponse.json({ error: 'NocoDB delete failed' }, { status: 502 })
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
