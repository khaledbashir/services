export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getPortalSession, getPortalUserVenueIds } from '@/lib/portal-auth'

// Files staff have uploaded against the customer's venues (venue_documents).
// Stored under public/uploads/venues/documents/<filename>, so the download
// URL is the public path — no streaming endpoint needed.
export async function GET() {
  try {
    const session = await getPortalSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const venueIds = await getPortalUserVenueIds(session)
    if (venueIds.length === 0) return NextResponse.json({ documents: [] })

    const result = await query(
      `SELECT vd.id, vd.original_name, vd.file_type, vd.file_size, vd.description,
              vd.created_at, vd.filename, v.name AS venue_name
       FROM venue_documents vd
       JOIN venues v ON v.id = vd.venue_id
       WHERE vd.venue_id = ANY($1::uuid[])
       ORDER BY vd.created_at DESC
       LIMIT 300`,
      [venueIds]
    )

    return NextResponse.json({
      documents: result.rows.map((d: any) => ({
        id: d.id,
        name: d.original_name,
        type: d.file_type,
        size: Number(d.file_size || 0),
        description: d.description,
        venue_name: d.venue_name,
        created_at: d.created_at,
        url: `/uploads/venues/documents/${d.filename}`,
      })),
    })
  } catch (err) {
    console.error('Customer documents error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
