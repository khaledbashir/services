export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { NocoOps, type NocoColumn } from '@/lib/nocodb-ops'

const READ_ONLY_UIDTS = new Set([
  'ID',
  'Formula',
  'Lookup',
  'Rollup',
  'Count',
  'CreatedTime',
  'LastModifiedTime',
  'CreatedBy',
  'LastModifiedBy',
  'AutoNumber',
  'LinkToAnotherRecord',
])

function mapColumnType(uidt: string) {
  switch (uidt) {
    case 'Number':
    case 'Decimal':
    case 'Currency':
    case 'Percent':
    case 'Rating':
      return 'number'
    case 'Email':
      return 'email'
    case 'PhoneNumber':
      return 'phone_number'
    case 'URL':
      return 'url'
    case 'Date':
      return 'date'
    case 'DateTime':
      return 'datetime'
    case 'Checkbox':
      return 'boolean'
    case 'SingleSelect':
      return 'single_select'
    case 'MultiSelect':
      return 'multiple_select'
    case 'LongText':
      return 'long_text'
    case 'Formula':
      return 'formula'
    case 'Lookup':
      return 'lookup'
    case 'Rollup':
      return 'rollup'
    case 'Count':
      return 'count'
    case 'CreatedTime':
      return 'created_on'
    case 'LastModifiedTime':
      return 'last_modified'
    case 'CreatedBy':
      return 'created_by'
    case 'LastModifiedBy':
      return 'last_modified_by'
    case 'AutoNumber':
      return 'autonumber'
    case 'LinkToAnotherRecord':
      return 'link_row'
    default:
      return 'text'
  }
}

function mapColumn(column: NocoColumn) {
  return {
    id: column.id,
    title: column.title,
    type: mapColumnType(column.uidt),
    read_only: READ_ONLY_UIDTS.has(column.uidt),
    primary: !!column.pv,
    options: column.colOptions?.options
      ? { choices: column.colOptions.options.map((option) => ({ title: option.title, color: option.color })) }
      : null,
  }
}

// Returns table metadata (fields) so the UI can render type-aware
// inputs and column headers. `params.base` is the NocoDB base id;
// `params.table` is the table id.
export async function GET(
  request: NextRequest,
  { params }: { params: { base: string; table: string } },
) {
  const auth = await requireRole(request, 'technician')
  if (isAuthError(auth)) return auth
  if (!NocoOps.configured()) {
    return NextResponse.json({ error: 'Operations workspace not configured' }, { status: 500 })
  }
  try {
    const table = await NocoOps.getTable(params.table)
    return NextResponse.json({
      table: {
        id: params.table,
        title: table.title || `Table ${params.table}`,
        fields: (table.columns || []).map(mapColumn),
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed to load table' }, { status: 500 })
  }
}
