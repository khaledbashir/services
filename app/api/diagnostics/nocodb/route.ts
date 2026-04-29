import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Baserow } from '@/lib/baserow'

// Smoke test for the Operations backend (Baserow). Admin only — surfaces
// the API token's first chars to confirm it loaded, never the full secret.
//
// Hit GET /api/diagnostics/nocodb (legacy URL kept for muscle memory) to
// verify the wiring before testing through the LLM.
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const baseUrl = process.env.BASEROW_BASE_URL || '(default)'
  const tokenPresent = !!process.env.BASEROW_API_TOKEN
  const tokenPreview = process.env.BASEROW_API_TOKEN
    ? `${process.env.BASEROW_API_TOKEN.slice(0, 6)}…(${process.env.BASEROW_API_TOKEN.length} chars)`
    : null

  if (!tokenPresent) {
    return NextResponse.json({
      ok: false,
      backend: 'baserow',
      base_url: baseUrl,
      token_present: false,
      message: 'BASEROW_API_TOKEN is not set on the server. Add it to the EasyPanel env vars and redeploy.',
    }, { status: 500 })
  }

  try {
    const apps = await Baserow.listApplications()
    const databases = apps.filter((a) => a.type === 'database')
    const counts: Array<{ database: string; tables: number }> = []
    for (const db of databases) {
      const t = await Baserow.listTables(db.id)
      counts.push({ database: db.name, tables: t.length })
    }
    return NextResponse.json({
      ok: true,
      backend: 'baserow',
      base_url: baseUrl,
      token_preview: tokenPreview,
      databases_found: databases.length,
      table_counts: counts,
    })
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      backend: 'baserow',
      base_url: baseUrl,
      token_present: true,
      token_preview: tokenPreview,
      error: err?.message || 'Unknown error reaching Baserow',
    }, { status: 500 })
  }
}
