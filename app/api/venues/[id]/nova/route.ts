export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { logVenueChange } from '@/lib/venue-audit'

/**
 * Sender/receiver card mapping.
 *
 * A sender is a unit already in the venue's equipment list; a receiver hangs
 * off one of its ports and usually drives a known screen. Grouping by sender
 * and port is how a tech actually reads it — "port 2 feeds the east ribbon,
 * cabinets 1 through 14" — so the response arrives grouped rather than as a
 * flat list the UI has to reassemble.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const result = await query(
      `SELECT nm.*,
              ve.label AS sender_label, ve.ip_address AS sender_ip,
              e.manufacturer AS sender_manufacturer, e.model AS sender_model,
              vs.display_name AS screen_name
         FROM nova_mappings nm
         LEFT JOIN venue_equipment ve ON ve.id = nm.sender_equipment_id
         LEFT JOIN equipment e ON e.id = ve.equipment_id
         LEFT JOIN venue_screens vs ON vs.id = nm.venue_screen_id
        WHERE nm.venue_id = $1
        ORDER BY COALESCE(ve.label, 'zzz'), nm.port NULLS LAST,
                 nm.cabinet_row NULLS LAST, nm.cabinet_col NULLS LAST, nm.receiver_label`,
      [params.id],
    )

    const groups = new Map<string, any>()
    for (const row of result.rows) {
      const key = `${row.sender_equipment_id || 'unassigned'}::${row.port || ''}`
      if (!groups.has(key)) {
        groups.set(key, {
          sender_equipment_id: row.sender_equipment_id,
          sender_label: row.sender_label || 'Unassigned sender',
          sender_ip: row.sender_ip,
          sender_manufacturer: row.sender_manufacturer,
          sender_model: row.sender_model,
          port: row.port,
          receivers: [],
        })
      }
      groups.get(key).receivers.push(row)
    }

    return NextResponse.json({
      mappings: result.rows,
      groups: [...groups.values()],
      count: result.rows.length,
    })
  } catch (err) {
    console.error('Error fetching nova mappings:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json().catch(() => ({}))
    const receiverLabel = String(body.receiver_label || '').trim()
    if (!receiverLabel) {
      return NextResponse.json({ error: 'receiver_label is required' }, { status: 400 })
    }

    const num = (v: unknown) => {
      const n = Number(v)
      return Number.isFinite(n) ? Math.trunc(n) : null
    }

    const result = await query(
      `INSERT INTO nova_mappings
         (venue_id, sender_equipment_id, venue_screen_id, port, receiver_label,
          receiver_model, cabinet_row, cabinet_col, notes, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        params.id,
        body.sender_equipment_id || null,
        body.venue_screen_id || null,
        body.port || null,
        receiverLabel,
        body.receiver_model || null,
        num(body.cabinet_row),
        num(body.cabinet_col),
        body.notes || null,
        auth.userId,
      ],
    )
    await logVenueChange('venue', params.id, 'nova_mapping_added', auth.userId, {
      receiver_label: receiverLabel, port: body.port || null,
    })
    return NextResponse.json({ mapping: result.rows[0] })
  } catch (err) {
    console.error('Error creating nova mapping:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json().catch(() => ({}))
    const mappingId = String(body.mapping_id || '')
    if (!mappingId) return NextResponse.json({ error: 'mapping_id required' }, { status: 400 })

    const fields = [
      'sender_equipment_id', 'venue_screen_id', 'port', 'receiver_label',
      'receiver_model', 'cabinet_row', 'cabinet_col', 'notes',
    ]
    const sets: string[] = []
    const values: any[] = []
    for (const f of fields) {
      if (!(f in body)) continue
      values.push(body[f] === '' ? null : body[f])
      sets.push(`${f} = $${values.length}`)
    }
    if (!sets.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

    values.push(auth.userId)
    sets.push(`updated_by = $${values.length}`)
    sets.push(`updated_at = NOW()`)
    values.push(mappingId, params.id)

    const result = await query(
      `UPDATE nova_mappings SET ${sets.join(', ')}
        WHERE id = $${values.length - 1} AND venue_id = $${values.length}
        RETURNING *`,
      values,
    )
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 })
    }
    return NextResponse.json({ mapping: result.rows[0] })
  } catch (err) {
    console.error('Error updating nova mapping:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const { mapping_id } = await request.json().catch(() => ({ mapping_id: null }))
    if (!mapping_id) return NextResponse.json({ error: 'mapping_id required' }, { status: 400 })

    await query(`DELETE FROM nova_mappings WHERE id = $1 AND venue_id = $2`, [mapping_id, params.id])
    await logVenueChange('venue', params.id, 'nova_mapping_removed', auth.userId, { mapping_id })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error deleting nova mapping:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
