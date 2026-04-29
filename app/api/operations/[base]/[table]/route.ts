import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Noco } from '@/lib/nocodb'

// Lightweight wrapper: GET returns the table metadata (columns) so the UI
// can render headers/inputs based on real NocoDB types.
export async function GET(
  request: NextRequest,
  { params }: { params: { base: string; table: string } },
) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  if (!Noco.configured()) {
    return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })
  }
  try {
    const meta = await Noco.getTableMeta(params.base, params.table)
    return NextResponse.json({ table: meta })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load table' }, { status: 500 })
  }
}
