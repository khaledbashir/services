import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/rbac'
import { NocoOps } from '@/lib/nocodb-ops'

// GET /api/noco/bases
//
// Returns the workspace tree: bases → tables. Used by /noco landing page
// to render every NocoDB surface as a clickable directory.
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!NocoOps.configured()) return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })

  try {
    const bases = await NocoOps.listBases()
    const out = await Promise.all(bases.map(async (b) => {
      try {
        const tables = await NocoOps.listTables(b.id)
        return {
          id: b.id,
          title: b.title,
          tables: tables.map(t => ({ id: t.id, title: t.title })),
        }
      } catch {
        return { id: b.id, title: b.title, tables: [] as { id: string; title: string }[] }
      }
    }))
    // Filter out empty / sample bases that pollute the directory.
    const filtered = out.filter(b => !/^Getting Started|^test$|Sandbox/i.test(b.title))
    return NextResponse.json({ bases: filtered })
  } catch (err) {
    console.error('[noco/bases GET]', err)
    return NextResponse.json({ error: 'NocoDB lookup failed' }, { status: 502 })
  }
}
