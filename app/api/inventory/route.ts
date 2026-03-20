import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const venueId = searchParams.get('venue_id')

    let whereClause = ''
    const params: any[] = []

    if (venueId) {
      whereClause = 'WHERE i.venue_id = $1'
      params.push(venueId)
    }

    const result = await query(
      `SELECT i.id, i.item_name, i.sku, i.quantity, i.threshold_low,
              i.last_updated, v.name as venue_name, v.id as venue_id,
              s.full_name as updated_by_name
       FROM inventory i
       JOIN venues v ON i.venue_id = v.id
       LEFT JOIN staff s ON i.updated_by = s.id
       ${whereClause}
       ORDER BY v.name, i.item_name`,
      params
    )

    // Low stock alerts
    const lowStockResult = await query(
      `SELECT COUNT(*) as count FROM inventory WHERE quantity <= threshold_low`
    )

    return NextResponse.json({
      items: result.rows,
      lowStockCount: parseInt(lowStockResult.rows[0]?.count || '0'),
    })
  } catch (err) {
    console.error('Error fetching inventory:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const { venue_id, item_name, sku, quantity, threshold_low } = await request.json()

    if (!venue_id || !item_name) {
      return NextResponse.json({ error: 'Venue and item name required' }, { status: 400 })
    }

    const result = await query(
      `INSERT INTO inventory (venue_id, item_name, sku, quantity, threshold_low, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [venue_id, item_name, sku || null, quantity || 0, threshold_low || 5, auth.userId]
    )

    return NextResponse.json({ id: result.rows[0].id })
  } catch (err) {
    console.error('Error creating inventory item:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const { id, quantity } = await request.json()

    await query(
      `UPDATE inventory SET quantity = $1, last_updated = NOW(), updated_by = $2 WHERE id = $3`,
      [quantity, auth.userId, id]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error updating inventory:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const { id } = await request.json()
    await query(`DELETE FROM inventory WHERE id = $1`, [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting inventory:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
