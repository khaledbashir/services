export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { logVenueChange } from '@/lib/venue-audit'

/**
 * The shared equipment library.
 *
 * One record per make and model, with the manual and training video attached
 * once. Venues link to the record rather than each keeping their own copy —
 * Steve's "update the manual once, every venue referencing it updates
 * automatically" is this table plus the join in venue_equipment.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const search = (sp.get('q') || '').trim()
    const category = (sp.get('category') || '').trim()

    const conditions: string[] = ['e.is_active = true']
    const params: any[] = []
    if (search) {
      params.push(`%${search}%`)
      conditions.push(`(e.manufacturer ILIKE $${params.length} OR e.model ILIKE $${params.length} OR e.description ILIKE $${params.length})`)
    }
    if (category) {
      params.push(category)
      conditions.push(`e.category = $${params.length}`)
    }

    const result = await query(
      `SELECT e.*,
              COUNT(DISTINCT ve.id)::int      AS install_count,
              COUNT(DISTINCT ve.venue_id)::int AS venue_count,
              COUNT(DISTINCT ei.id)::int      AS issue_count,
              COUNT(DISTINCT vd.id)::int      AS document_count
         FROM equipment e
         LEFT JOIN venue_equipment ve ON ve.equipment_id = e.id
         LEFT JOIN equipment_issues ei ON ei.equipment_id = e.id
         LEFT JOIN venue_documents vd ON vd.equipment_id = e.id AND vd.is_archived = false
        WHERE ${conditions.join(' AND ')}
        GROUP BY e.id
        ORDER BY e.manufacturer, e.model`,
      params,
    )
    return NextResponse.json({ equipment: result.rows })
  } catch (err) {
    console.error('Error listing equipment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json().catch(() => ({}))
    const manufacturer = String(body.manufacturer || '').trim()
    const model = String(body.model || '').trim()
    if (!manufacturer || !model) {
      return NextResponse.json({ error: 'manufacturer and model are required' }, { status: 400 })
    }

    // The same box added twice from two venues must not become two catalog
    // entries with two different manuals, so a duplicate returns the record
    // that already exists rather than failing the tech's save.
    const existing = await query(
      `SELECT * FROM equipment WHERE lower(manufacturer) = lower($1) AND lower(model) = lower($2)`,
      [manufacturer, model],
    )
    if (existing.rows.length > 0) {
      return NextResponse.json({ equipment: existing.rows[0], existed: true })
    }

    const result = await query(
      `INSERT INTO equipment (category, manufacturer, model, description, manual_url,
                              training_video_url, latest_version, latest_version_note,
                              latest_version_updated_at, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,
               CASE WHEN $7::text IS NULL OR $7::text = '' THEN NULL ELSE NOW() END,
               $9,$10)
       RETURNING *`,
      [
        String(body.category || 'other'),
        manufacturer,
        model,
        body.description || null,
        body.manual_url || null,
        body.training_video_url || null,
        body.latest_version || null,
        body.latest_version_note || null,
        body.notes || null,
        auth.userId,
      ],
    )
    const row = result.rows[0]
    await logVenueChange('equipment', row.id, 'equipment_created', auth.userId, {
      manufacturer, model,
    })
    return NextResponse.json({ equipment: row })
  } catch (err) {
    console.error('Error creating equipment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
