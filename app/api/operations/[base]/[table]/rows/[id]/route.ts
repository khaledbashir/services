import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { NocoOps } from '@/lib/nocodb-ops'

function normalizeRecord(record: Record<string, unknown>) {
  const id = record.id ?? record.Id
  return { id, ...record }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { base: string; table: string; id: string } },
) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  if (!NocoOps.configured()) {
    return NextResponse.json({ error: 'Operations workspace not configured' }, { status: 500 })
  }
  try {
    const body = await request.json()
    const fields = body?.fields && typeof body.fields === 'object' ? body.fields : body
    const updated = await NocoOps.updateRecords(params.table, [{ Id: params.id, ...fields }])
    return NextResponse.json({ record: normalizeRecord(updated[0] || { Id: params.id, ...fields }) })
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
  if (!NocoOps.configured()) {
    return NextResponse.json({ error: 'Operations workspace not configured' }, { status: 500 })
  }
  try {
    await NocoOps.deleteRecords(params.table, [params.id])
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to delete row' }, { status: 500 })
  }
}
