import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Baserow } from '@/lib/baserow'

export async function GET(
  request: NextRequest,
  { params }: { params: { base: string; table: string } },
) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  if (!Baserow.configured()) {
    return NextResponse.json({ error: 'Baserow not configured' }, { status: 500 })
  }
  const { searchParams } = new URL(request.url)
  try {
    const result = await Baserow.listRows(params.table, {
      page: Number(searchParams.get('page')) || 1,
      size: Math.min(Number(searchParams.get('size')) || 50, 200),
      search: searchParams.get('search') || undefined,
      orderBy: searchParams.get('order_by') || undefined,
      filter: searchParams.get('filters') || undefined,
    })
    return NextResponse.json({
      records: result.results,
      next: result.next,
      previous: result.previous,
      count: result.count,
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
  if (!Baserow.configured()) {
    return NextResponse.json({ error: 'Baserow not configured' }, { status: 500 })
  }
  try {
    const body = await request.json()
    const fields = body?.fields && typeof body.fields === 'object' ? body.fields : body
    const created = await Baserow.createRow(params.table, fields)
    return NextResponse.json({ record: created })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create row' }, { status: 500 })
  }
}
