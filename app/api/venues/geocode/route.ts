import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { geocodeAddress } from '@/lib/geocode'

// GET - Get geocoding status
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const result = await query(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE address IS NOT NULL AND address != '') as with_address,
        COUNT(*) FILTER (WHERE latitude IS NOT NULL) as geocoded,
        COUNT(*) FILTER (WHERE address IS NOT NULL AND address != '' AND latitude IS NULL) as needs_geocoding
      FROM venues
      WHERE is_active = true
    `)

    return NextResponse.json(result.rows[0])
  } catch (err) {
    console.error('Error fetching geocoding status:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Run geocoding for venues without coordinates
export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const { venue_id, limit } = await request.json().catch(() => ({}))

    // If venue_id provided, geocode just that one
    if (venue_id) {
      const venueRes = await query('SELECT id, name, address FROM venues WHERE id = $1', [venue_id])
      if (venueRes.rows.length === 0) {
        return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
      }

      const venue = venueRes.rows[0]
      if (!venue.address) {
        return NextResponse.json({ error: 'Venue has no address' }, { status: 400 })
      }

      const geo = await geocodeAddress(venue.address)
      
      if (geo.lat && geo.lng) {
        await query(
          'UPDATE venues SET latitude = $1, longitude = $2 WHERE id = $3',
          [geo.lat, geo.lng, venue_id]
        )
      }

      return NextResponse.json({
        venue_id,
        venue_name: venue.name,
        address: venue.address,
        ...geo,
        success: !!(geo.lat && geo.lng)
      })
    }

    // Otherwise, geocode venues that need it (with limit)
    const venuesRes = await query(`
      SELECT id, name, address
      FROM venues
      WHERE address IS NOT NULL 
        AND address != ''
        AND (latitude IS NULL OR longitude IS NULL)
        AND is_active = true
      ORDER BY name
      LIMIT $1
    `, [limit || 10])

    const results = []
    for (const venue of venuesRes.rows) {
      const geo = await geocodeAddress(venue.address)
      
      if (geo.lat && geo.lng) {
        await query(
          'UPDATE venues SET latitude = $1, longitude = $2 WHERE id = $3',
          [geo.lat, geo.lng, venue.id]
        )
      }

      results.push({
        venue_id: venue.id,
        venue_name: venue.name,
        address: venue.address,
        ...geo,
        success: !!(geo.lat && geo.lng)
      })
    }

    return NextResponse.json({
      processed: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results
    })
  } catch (err) {
    console.error('Error geocoding venues:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}