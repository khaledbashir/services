import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { geocodeAddress } from '@/lib/geocode'

/**
 * Cron job: auto-geocode active venues that have an address but no coordinates.
 * Processes up to 20 per run (rate limited at ~1.1s each by Nominatim).
 * Safe to run frequently — idempotent and skips already-geocoded venues.
 */
export async function GET() {
  try {
    const venuesRes = await query(`
      SELECT id, name, address
      FROM venues
      WHERE address IS NOT NULL
        AND address != ''
        AND (latitude IS NULL OR longitude IS NULL)
        AND COALESCE(is_active, true) = true
      ORDER BY name
      LIMIT 20
    `)

    if (venuesRes.rows.length === 0) {
      return NextResponse.json({ message: 'All venues geocoded', processed: 0 })
    }

    let successful = 0
    let failed = 0

    for (const venue of venuesRes.rows) {
      const geo = await geocodeAddress(venue.address)
      if (geo.lat && geo.lng) {
        await query(
          'UPDATE venues SET latitude = $1, longitude = $2 WHERE id = $3',
          [geo.lat, geo.lng, venue.id]
        )
        successful++
      } else {
        failed++
      }
    }

    return NextResponse.json({
      processed: venuesRes.rows.length,
      successful,
      failed,
      remaining: await query(`
        SELECT COUNT(*) as count FROM venues
        WHERE address IS NOT NULL AND address != ''
          AND (latitude IS NULL OR longitude IS NULL)
          AND COALESCE(is_active, true) = true
      `).then(r => Number(r.rows[0]?.count || 0)),
    })
  } catch (err) {
    console.error('Geocode cron error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
