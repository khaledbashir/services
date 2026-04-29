import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Baserow } from '@/lib/baserow'

// All operations API routes proxy Baserow through anc-services so the
// BASEROW_API_TOKEN never touches the browser. Same gate as the rest of
// the dashboard — technician role minimum.
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  if (!Baserow.configured()) {
    return NextResponse.json({ error: 'Baserow is not configured. Set BASEROW_API_TOKEN on the server.' }, { status: 500 })
  }

  try {
    const apps = await Baserow.listApplications()
    // Group by workspace for a tidy left-rail. Only "database" applications
    // hold tables — Baserow also has builders/dashboards which we skip.
    const databases = apps.filter((a) => a.type === 'database')
    const out: Array<{
      workspace_id: number
      workspace_name: string
      bases: Array<{ id: number; name: string; tables: Array<{ id: number; name: string }> }>
    }> = []
    const wsMap = new Map<number, { workspace_id: number; workspace_name: string; bases: any[] }>()
    for (const db of databases) {
      const tables = await Baserow.listTables(db.id)
      const ws = wsMap.get(db.workspace.id) || {
        workspace_id: db.workspace.id,
        workspace_name: db.workspace.name,
        bases: [],
      }
      ws.bases.push({
        id: db.id,
        name: db.name,
        tables: tables.map((t) => ({ id: t.id, name: t.name })),
      })
      wsMap.set(db.workspace.id, ws)
    }
    for (const ws of wsMap.values()) out.push(ws)
    return NextResponse.json({ workspaces: out })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to list tables' }, { status: 500 })
  }
}
