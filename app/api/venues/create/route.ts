import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { notifyOps } from '@/lib/slack'
import { dashboardUrl } from '@/lib/app-url'
import { geocodeAddress } from '@/lib/geocode'

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'admin')
    if (isAuthError(auth)) return auth

    const { name, market_id, address, primary_contact_name, primary_contact_email, requires_assignment, venue_type } = await request.json()

    if (!name) {
      return NextResponse.json({ error: 'Venue name is required' }, { status: 400 })
    }

    const validTypes = ['sports', 'ooh', 'facility']
    const vType = validTypes.includes(venue_type) ? venue_type : 'sports'

    const result = await query(
      `INSERT INTO venues (name, market_id, address, primary_contact_name, primary_contact_email, requires_assignment, venue_type, portal_token)
       VALUES ($1, $2, $3, $4, $5, $6, $7, encode(gen_random_bytes(16), 'hex'))
       RETURNING id, name`,
      [name, market_id || null, address || null, primary_contact_name || null, primary_contact_email || null, requires_assignment !== false, vType]
    )

    const v = result.rows[0]

    // Geocode the address asynchronously (don't block the response)
    if (address) {
      geocodeAddress(address).then(geo => {
        if (geo.lat && geo.lng) {
          query('UPDATE venues SET latitude = $1, longitude = $2 WHERE id = $3', [geo.lat, geo.lng, v.id])
        }
      }).catch(err => console.warn('Geocoding failed for new venue:', err))
    }

    notifyOps(':stadium:', `*New venue created:* ${v.name}`, { label: 'View Venue', url: dashboardUrl(`/venues/${v.id}`) })
    return NextResponse.json({ venue: v })
  } catch (err) {
    console.error('Error creating venue:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
