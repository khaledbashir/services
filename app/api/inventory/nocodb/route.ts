export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/rbac'
import { NocoOps } from '@/lib/nocodb-ops'

// NocoDB Inventory Tracking base — Inventory table.
// Sourced from /docs/airtable-audit + live NocoDB probe 2026-05-06.
const INVENTORY_TABLE_ID = 'm0p2kzq2ay197u8'

// GET /api/inventory/nocodb?action=list&limit=500
//   Returns rows shaped for the DataGrid on /inventory.
//
// PATCH /api/inventory/nocodb
//   Body: { id, fields: { ...NocoDB column titles } }
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!NocoOps.configured()) return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'list'

  try {
    if (action === 'list') {
      const limit = Math.min(Number(searchParams.get('limit') || 500), 1000)
      const { records, pageInfo } = await NocoOps.listRecords(INVENTORY_TABLE_ID, {
        sort: '-CreatedAt',
        limit,
      })
      const items = records.map((r: any) => {
        const manuLink = Array.isArray(r['Manufacturer']) ? r['Manufacturer'] : []
        const locLink = Array.isArray(r['Storage Location']) ? r['Storage Location'] : []
        const restockLink = Array.isArray(r['Restock Orders']) ? r['Restock Orders'] : []
        // The "Inventory" field is text like "5 units" — pull the leading
        // integer for display + sorting.
        const invStr = String(r['Inventory'] || '').trim()
        const invNum = (() => { const m = invStr.match(/^(-?\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null })()
        return {
          id: String(r['Id']),
          part_name: String(r['Part Name'] || '').trim(),
          product_id: String(r['Product ID'] || '').trim() || null,
          model_number: String(r['Model Number'] || '').trim() || null,
          type: r['Type'] || null,
          inventory_label: invStr || null,
          inventory_count: invNum,
          units_ordered: r['Units Ordered'] != null ? Number(r['Units Ordered']) : null,
          units_consumed: r['Units Consumed'] != null ? Number(r['Units Consumed']) : null,
          manufacturer_label: manuLink.map((m: any) => m['Manufacturer Name'] || m['name']).filter(Boolean).join(', ') || null,
          storage_label: locLink.map((l: any) => l['Storage Location'] || l['name']).filter(Boolean).join(', ') || null,
          restock_label: restockLink.map((o: any) => o['Restock Order ID'] || o['name']).filter(Boolean).join(', ') || null,
          manufacturer_price: r['Manufacturer Price'] != null ? Number(r['Manufacturer Price']) : null,
          notes: r['Notes'] || null,
          created_at: r['CreatedAt'] || null,
          updated_at: r['UpdatedAt'] || null,
        }
      })
      return NextResponse.json({ items, total: pageInfo?.totalRows || items.length })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[inventory/nocodb GET]', err)
    return NextResponse.json({ error: 'NocoDB lookup failed' }, { status: 502 })
  }
}

export async function PATCH(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!NocoOps.configured()) return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })

  const body = await request.json()
  const { id, fields } = body || {}
  if (id == null) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!fields || typeof fields !== 'object') return NextResponse.json({ error: 'fields object required' }, { status: 400 })

  try {
    const result = await NocoOps.updateRecords(INVENTORY_TABLE_ID, [{ Id: Number(id), ...fields }])
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.error('[inventory/nocodb PATCH]', err)
    return NextResponse.json({ error: 'NocoDB update failed' }, { status: 502 })
  }
}
