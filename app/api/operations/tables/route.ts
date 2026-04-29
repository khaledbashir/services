import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Noco } from '@/lib/nocodb'

// All operations API routes proxy NocoDB through anc-services so the
// NOCODB_API_TOKEN never touches the browser. Same gate as the rest of
// the dashboard — technician role minimum.
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  if (!Noco.configured()) {
    return NextResponse.json({ error: 'NocoDB is not configured. Set NOCODB_API_TOKEN on the server.' }, { status: 500 })
  }

  try {
    const workspaces = await Noco.listWorkspaces()
    const out: Array<{
      workspace_id: string
      workspace_title: string
      bases: Array<{ id: string; title: string; tables: Array<{ id: string; title: string }> }>
    }> = []
    for (const ws of workspaces) {
      const bases = await Noco.listBases(ws.id)
      const baseInfos: Array<{ id: string; title: string; tables: Array<{ id: string; title: string }> }> = []
      for (const base of bases) {
        const tables = await Noco.listTables(base.id)
        baseInfos.push({
          id: base.id,
          title: base.title,
          tables: tables.map((t) => ({ id: t.id, title: t.title })),
        })
      }
      out.push({ workspace_id: ws.id, workspace_title: ws.title, bases: baseInfos })
    }
    return NextResponse.json({ workspaces: out })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to list tables' }, { status: 500 })
  }
}
