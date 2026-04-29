import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Noco } from '@/lib/nocodb'

export async function GET(
  request: NextRequest,
  { params }: { params: { base: string; table: string } },
) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  if (!Noco.configured()) {
    return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })
  }
  const { searchParams } = new URL(request.url)
  try {
    const result = await Noco.listRows(params.base, params.table, {
      page: Number(searchParams.get('page')) || 1,
      pageSize: Math.min(Number(searchParams.get('pageSize')) || 25, 100),
      where: searchParams.get('where') || undefined,
      sort: searchParams.get('sort') || undefined,
      fields: searchParams.get('fields') || undefined,
    })
    return NextResponse.json(result)
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
  if (!Noco.configured()) {
    return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })
  }
  try {
    const body = await request.json()
    const fields = body?.fields && typeof body.fields === 'object' ? body.fields : body
    const created = await Noco.createRow(params.base, params.table, fields)
    return NextResponse.json({ record: created })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to create row' }, { status: 500 })
  }
}
