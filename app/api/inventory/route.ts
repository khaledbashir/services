import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError, getAuthUser } from '@/lib/rbac'
import { getStaffVenueIds } from '@/lib/venue-filter'
import { notifyOps } from '@/lib/slack'
import {
  Inventory,
  buildTwentyVenueFilter,
  dashboardVenueIdToTwentyId,
  twentyVenueToDashboard,
  isTwentyBackedEnabled,
  type TwentyInventoryAsset,
} from '@/lib/twenty-ops'

// Shape the UI expects (kept stable across legacy + Twenty-backed modes):
//   { items: [ { id, item_name, sku, quantity, threshold_low, venue_id, venue_name,
//                asset_number, location_code, manufacturer, display_type, orientation,
//                three_letter_code, connected_devices, render_name, part_number,
//                project_code, part_name, screen_location, last_updated,
//                updated_by_name } ],
//     lowStockCount: number }

async function reshapeTwentyToDashboard(asset: TwentyInventoryAsset) {
  const venue = asset.assetVenue
    ? { venue_id: asset.assetVenue.servicesId || null, venue_name: asset.assetVenue.name }
    : asset.assetVenueId
    ? await twentyVenueToDashboard(asset.assetVenueId)
    : null
  return {
    id: asset.id,
    item_name: asset.name || asset.partName || '(unnamed)',
    sku: asset.partNumber,
    quantity: asset.amount || 0,
    threshold_low: 5,                         // not in Twenty schema — keep UI default
    venue_id: venue?.venue_id || null,
    venue_name: venue?.venue_name || '',
    last_updated: asset.updatedAt,
    updated_by_name: null,                    // Twenty tracks createdBy separately; skip for now
    // Extended fields from Twenty's richer schema
    asset_number: asset.assetNumber,
    location_code: asset.locationCode,
    location_room: asset.locationRoom,
    manufacturer: asset.manufacturer,
    display_type: asset.displayType,
    orientation: asset.orientation,
    three_letter_code: asset.threeLetterCode,
    connected_devices: asset.connectedDevices,
    render_name: asset.renderName,
    part_number: asset.partNumber,
    part_name: asset.partName,
    project_code: asset.projectCode,
    screen_location: asset.screenLocation,
  }
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const venueId = searchParams.get('venue_id')
  const user = await getAuthUser(request)
  const staffVenueIds = user ? await getStaffVenueIds(user.userId, user.role) : null

  if (isTwentyBackedEnabled('INVENTORY')) {
    try {
      const filters: string[] = []
      if (venueId) {
        const twentyVenueId = await dashboardVenueIdToTwentyId(venueId)
        if (twentyVenueId) filters.push(`assetVenueId[eq]:"${twentyVenueId}"`)
        else return NextResponse.json({ items: [], lowStockCount: 0 })
      } else {
        const venueFilter = await buildTwentyVenueFilter(staffVenueIds, 'assetVenueId')
        if (venueFilter) filters.push(venueFilter)
      }

      // Paginate through all matching records (Twenty's cursor loop)
      const items: any[] = []
      let cursor: string | null = null
      for (let p = 0; p < 50; p++) {
        const page = await Inventory.list({
          limit: 60,
          startingAfter: cursor || undefined,
          filter: filters.length > 0 ? filters.join(',') : undefined,
          orderBy: 'updatedAt[DescNullsLast]',
        })
        for (const asset of page.items) items.push(await reshapeTwentyToDashboard(asset))
        if (!page.hasNextPage || !page.nextCursor) break
        cursor = page.nextCursor
      }

      const lowStockCount = items.filter(i => typeof i.quantity === 'number' && i.quantity <= (i.threshold_low || 5)).length
      return NextResponse.json({ items, lowStockCount })
    } catch (err) {
      console.error('[inventory GET twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to list inventory from Twenty' }, { status: 500 })
    }
  }

  // Legacy local-DB path
  let whereClause = ''
  const params: any[] = []
  if (venueId) {
    whereClause = 'WHERE i.venue_id = $1'
    params.push(venueId)
  } else if (staffVenueIds !== null) {
    if (staffVenueIds.length === 0) {
      whereClause = 'WHERE FALSE'
    } else {
      const placeholders = staffVenueIds.map((_, i) => `$${i + 1}`).join(', ')
      whereClause = `WHERE i.venue_id IN (${placeholders})`
      params.push(...staffVenueIds)
    }
  }
  try {
    const result = await query(
      `SELECT i.id, i.item_name, i.sku, i.quantity, i.threshold_low,
              i.last_updated, v.name as venue_name, v.id as venue_id,
              s.full_name as updated_by_name,
              i.manufacturer, i.model_name, i.model_number, i.part_number, i.part_name,
              i.asset_number, i.ip_address, i.location_code, i.location_room,
              i.screen_number, i.screen_location, i.physical_dimensions, i.display_type,
              i.orientation, i.install_phase, i.ownership_group, i.render_name,
              i.timeline_url, i.three_letter_code, i.resolution, i.connected_devices,
              i.project_code, i.notes
       FROM inventory i
       JOIN venues v ON i.venue_id = v.id
       LEFT JOIN staff s ON i.updated_by = s.id
       ${whereClause}
       ORDER BY v.name, i.item_name`,
      params
    )
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

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const body = await request.json()
  const { venue_id, item_name, sku, quantity, threshold_low, asset_number, location_code,
    manufacturer, display_type, orientation, three_letter_code, connected_devices,
    render_name, part_number, project_code } = body

  if (!venue_id || !item_name) {
    return NextResponse.json({ error: 'Venue and item name required' }, { status: 400 })
  }

  // Technician-level venue enforcement — even with manager role, you can't
  // write to a venue outside your assigned scope on the legacy path; keep
  // the same rule on the Twenty-backed path.
  const staffVenueIds = await getStaffVenueIds(auth.userId, auth.role)
  if (staffVenueIds !== null && !staffVenueIds.includes(venue_id)) {
    return NextResponse.json({ error: 'Forbidden: venue not in your scope' }, { status: 403 })
  }

  if (isTwentyBackedEnabled('INVENTORY')) {
    try {
      const twentyVenueId = await dashboardVenueIdToTwentyId(venue_id)
      if (!twentyVenueId) {
        return NextResponse.json({ error: 'Venue not mirrored in Twenty yet' }, { status: 409 })
      }
      const created = await Inventory.create({
        name: item_name,
        amount: Number(quantity) || 0,
        partNumber: sku || part_number || null,
        partName: item_name,
        assetNumber: asset_number || null,
        locationCode: location_code || null,
        manufacturer: manufacturer || null,
        displayType: display_type || null,
        orientation: orientation || null,
        threeLetterCode: three_letter_code || null,
        connectedDevices: connected_devices || null,
        renderName: render_name || null,
        projectCode: project_code || null,
        assetVenueId: twentyVenueId,
      })
      const venueRes = await query('SELECT name, slack_channel_id FROM venues WHERE id = $1', [venue_id])
      notifyOps(':package:', `*Inventory added:* ${item_name} (qty: ${quantity || 0}) at ${venueRes.rows[0]?.name || 'Unknown'}`, undefined, venueRes.rows[0]?.slack_channel_id)
      return NextResponse.json({ id: created.id })
    } catch (err) {
      console.error('[inventory POST twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to create inventory in Twenty' }, { status: 500 })
    }
  }

  // Legacy local-DB path
  try {
    const result = await query(
      `INSERT INTO inventory (venue_id, item_name, sku, quantity, threshold_low, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [venue_id, item_name, sku || null, quantity || 0, threshold_low || 5, auth.userId]
    )
    const venueRes = await query('SELECT name, slack_channel_id FROM venues WHERE id = $1', [venue_id])
    notifyOps(':package:', `*Inventory added:* ${item_name} (qty: ${quantity || 0}) at ${venueRes.rows[0]?.name || 'Unknown'}`, undefined, venueRes.rows[0]?.slack_channel_id)
    return NextResponse.json({ id: result.rows[0].id })
  } catch (err) {
    console.error('Error creating inventory item:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── PATCH ────────────────────────────────────────────────────────────────────

export async function PATCH(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const body = await request.json()
  const { id, quantity, ...rest } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  if (isTwentyBackedEnabled('INVENTORY')) {
    try {
      const patch: Record<string, unknown> = {}
      if (quantity !== undefined) patch.amount = Number(quantity)
      if (rest.asset_number !== undefined) patch.assetNumber = rest.asset_number
      if (rest.location_code !== undefined) patch.locationCode = rest.location_code
      if (rest.manufacturer !== undefined) patch.manufacturer = rest.manufacturer
      if (rest.display_type !== undefined) patch.displayType = rest.display_type
      if (rest.orientation !== undefined) patch.orientation = rest.orientation
      if (rest.three_letter_code !== undefined) patch.threeLetterCode = rest.three_letter_code
      if (rest.connected_devices !== undefined) patch.connectedDevices = rest.connected_devices
      if (rest.render_name !== undefined) patch.renderName = rest.render_name
      if (rest.part_number !== undefined) patch.partNumber = rest.part_number
      if (rest.project_code !== undefined) patch.projectCode = rest.project_code
      if (rest.item_name !== undefined) { patch.name = rest.item_name; patch.partName = rest.item_name }

      const updated = await Inventory.update(id, patch)
      return NextResponse.json({ ok: true, id: updated.id })
    } catch (err) {
      console.error('[inventory PATCH twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to update inventory in Twenty' }, { status: 500 })
    }
  }

  // Legacy local-DB path (only supports quantity updates)
  try {
    const itemRes = await query('SELECT i.item_name, v.name as venue_name, v.slack_channel_id, i.quantity as old_qty FROM inventory i JOIN venues v ON i.venue_id = v.id WHERE i.id = $1', [id])
    await query(
      `UPDATE inventory SET quantity = $1, last_updated = NOW(), updated_by = $2 WHERE id = $3`,
      [quantity, auth.userId, id]
    )
    if (itemRes.rows[0]) {
      const item = itemRes.rows[0]
      notifyOps(':pencil2:', `*Inventory updated:* ${item.item_name} at ${item.venue_name} — qty: ${item.old_qty} → ${quantity}`, undefined, item.slack_channel_id)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error updating inventory:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, 'tech_support')
  if (isAuthError(auth)) return auth

  const { id } = await request.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  if (isTwentyBackedEnabled('INVENTORY')) {
    try {
      await Inventory.delete(id)
      return NextResponse.json({ ok: true })
    } catch (err) {
      console.error('[inventory DELETE twenty-backed] error:', err)
      return NextResponse.json({ error: 'Failed to delete inventory in Twenty' }, { status: 500 })
    }
  }

  try {
    await query(`DELETE FROM inventory WHERE id = $1`, [id])
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting inventory:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
