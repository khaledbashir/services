import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { buildToolTree } from '@/lib/voice/tool-tree'

export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth

  // Show the full tree using admin role so editors see every available tool —
  // role-gating happens at runtime when the agent's caller hits the tool, not
  // at the catalog level. (Picking a tool that requires admin then having a
  // technician call the agent will get a clean permission_denied at execution.)
  const tree = await buildToolTree('admin')
  return NextResponse.json({ ok: true, groups: tree })
}
