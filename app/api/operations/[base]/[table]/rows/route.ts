export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { NocoOps } from '@/lib/nocodb-ops'

function normalizeRecord(record: Record<string, unknown>) {
  const id = record.id ?? record.Id
  return { id, ...record }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { base: string; table: string } },
) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  if (!NocoOps.configured()) {
    return NextResponse.json({ error: 'Operations workspace not configured' }, { status: 500 })
  }
  const { searchParams } = new URL(request.url)
  const size = Math.min(Number(searchParams.get('size')) || 50, 1000)
  const page = Math.max(Number(searchParams.get('page')) || 1, 1)
  try {
    const result = await NocoOps.listRecords(params.table, {
      limit: size,
      offset: (page - 1) * size,
      sort: searchParams.get('order_by') || undefined,
      where: searchParams.get('filters') || undefined,
    })
    return NextResponse.json({
      records: result.records.map(normalizeRecord),
      next: result.pageInfo?.isLastPage ? null : page + 1,
      previous: result.pageInfo?.isFirstPage ? null : page - 1,
      count: result.pageInfo?.totalRows ?? result.records.length,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to list rows' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { base: string; table: string } },
) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  if (!NocoOps.configured()) {
    return NextResponse.json({ error: 'Operations workspace not configured' }, { status: 500 })
  }
  try {
    const body = await request.json()
    const fields = body?.fields && typeof body.fields === 'object' ? body.fields : body
    const created = await NocoOps.createRecords(params.table, [fields])
    return NextResponse.json({ record: normalizeRecord(created[0] || {}) })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create row' }, { status: 500 })
  }
}
