import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Noco } from '@/lib/nocodb'

// Quick smoke test for the NocoDB env vars. Admin only — surfaces the API
// token's first few chars to confirm it loaded, but never the full secret.
// Hit GET /api/diagnostics/nocodb after setting NOCODB_BASE_URL +
// NOCODB_API_TOKEN to verify the wiring before testing through the LLM.
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, 'admin')
  if (isAuthError(auth)) return auth

  const baseUrl = process.env.NOCODB_BASE_URL || '(default)'
  const tokenPresent = !!process.env.NOCODB_API_TOKEN
  const tokenPreview = process.env.NOCODB_API_TOKEN
    ? `${process.env.NOCODB_API_TOKEN.slice(0, 8)}…(${process.env.NOCODB_API_TOKEN.length} chars)`
    : null

  if (!tokenPresent) {
    return NextResponse.json({
      ok: false,
      base_url: baseUrl,
      token_present: false,
      message: 'NOCODB_API_TOKEN is not set on the server. Add it to the EasyPanel env vars and redeploy.',
    }, { status: 500 })
  }

  try {
    const bases = await Noco.listBases()
    const tables: Array<{ base: string; tables: number }> = []
    for (const b of bases) {
      const t = await Noco.listTables(b.id)
      tables.push({ base: b.title, tables: t.length })
    }
    return NextResponse.json({
      ok: true,
      base_url: baseUrl,
      token_preview: tokenPreview,
      bases_found: bases.length,
      bases: bases.map((b) => b.title),
      table_counts: tables,
    })
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      base_url: baseUrl,
      token_present: true,
      token_preview: tokenPreview,
      error: err?.message || 'Unknown error reaching NocoDB',
    }, { status: 500 })
  }
}
