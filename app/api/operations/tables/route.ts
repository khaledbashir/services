export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { NocoOps } from '@/lib/nocodb-ops'

// All operations API routes proxy NocoDB through anc-services so the PAT
// never touches the browser. Same gate as the rest of the dashboard —
// technician role minimum.
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  if (!NocoOps.configured()) {
    return NextResponse.json({ error: 'Operations workspace is not configured. Set NOCODB_OPS_PAT on the server.' }, { status: 500 })
  }

  try {
    const bases = await NocoOps.listBases()
    const out: Array<{
      workspace_id: string
      workspace_name: string
      bases: Array<{ id: string; name: string; tables: Array<{ id: string; name: string }> }>
    }> = []
    const ws = {
      workspace_id: NocoOps.workspaceId(),
      workspace_name: 'ANC Operations',
      bases: [] as Array<{ id: string; name: string; tables: Array<{ id: string; name: string }> }>,
    }
    for (const base of bases) {
      const tables = await NocoOps.listTables(base.id)
      ws.bases.push({
        id: base.id,
        name: base.title,
        tables: tables.map((t) => ({ id: t.id, name: t.title })),
      })
    }
    out.push(ws)
    return NextResponse.json({ workspaces: out })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to list tables' }, { status: 500 })
  }
}
