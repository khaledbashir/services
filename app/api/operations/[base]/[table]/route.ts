import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { Baserow } from '@/lib/baserow'

// Returns table metadata (fields) so the UI can render type-aware
// inputs and column headers. `params.base` is the Baserow database id;
// `params.table` is the table id.
export async function GET(
  request: NextRequest,
  { params }: { params: { base: string; table: string } },
) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  if (!Baserow.configured()) {
    return NextResponse.json({ error: 'Baserow not configured' }, { status: 500 })
  }
  try {
    const fields = await Baserow.listFields(params.table)
    // Baserow doesn't have a single "get table meta" endpoint that returns
    // both name + fields cheaply, so we look up the table title from the
    // database's table list.
    const tables = await Baserow.listTables(params.base)
    const t = tables.find((x) => String(x.id) === String(params.table))
    return NextResponse.json({
      table: {
        id: Number(params.table),
        title: t?.name || `Table ${params.table}`,
        fields: fields.map((f) => ({
          id: f.id,
          title: f.name,
          type: f.type,
          read_only: !!f.read_only,
          primary: !!f.primary,
          options: f.select_options
            ? { choices: f.select_options.map((o) => ({ title: o.value, color: o.color })) }
            : null,
        })),
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load table' }, { status: 500 })
  }
}
