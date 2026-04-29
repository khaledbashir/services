import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Baserow } from '@/lib/baserow'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { base: string; table: string; id: string } },
) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  if (!Baserow.configured()) {
    return NextResponse.json({ error: 'Baserow not configured' }, { status: 500 })
  }
  try {
    const body = await request.json()
    const fields = body?.fields && typeof body.fields === 'object' ? body.fields : body
    const updated = await Baserow.updateRow(params.table, params.id, fields)
    return NextResponse.json({ record: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to update row' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { base: string; table: string; id: string } },
) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth
  if (!Baserow.configured()) {
    return NextResponse.json({ error: 'Baserow not configured' }, { status: 500 })
  }
  try {
    await Baserow.deleteRow(params.table, params.id)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to delete row' }, { status: 500 })
  }
}
