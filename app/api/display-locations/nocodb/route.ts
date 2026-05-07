export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/rbac'
import { NocoOps } from '@/lib/nocodb-ops'

// NocoDB NY base — Display Locations table.
const TABLE_ID = 'mlc6f71gnnrqtyf'

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!NocoOps.configured()) return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'list'

  try {
    if (action === 'list') {
      const limit = Math.min(Number(searchParams.get('limit') || 500), 1000)
      const { records, pageInfo } = await NocoOps.listRecords(TABLE_ID, { sort: 'Name', limit })
      const items = records.map((r: any) => {
        const venueLink = Array.isArray(r['Venue']) ? r['Venue'] : []
        const displaysLink = Array.isArray(r['Displays']) ? r['Displays'] : []
        const photo = Array.isArray(r['Photo']) ? r['Photo'] : null
        const map = Array.isArray(r['Map']) ? r['Map'] : null
        const installType: string[] | null = Array.isArray(r['Install Type'])
          ? r['Install Type']
          : (typeof r['Install Type'] === 'string' && r['Install Type'] ? r['Install Type'].split(',').map((s: string) => s.trim()).filter(Boolean) : null)
        return {
          id: String(r['Id']),
          name: String(r['Name'] || '').trim() || `Location #${r['Id']}`,
          install_type: installType,
          three_letter_code: String(r['Three Letter Code'] || '').trim() || null,
          location_abbreviation: String(r['Location Abbreviation'] || '').trim() || null,
          venue_label: venueLink.map((v: any) => v['Venue Name']).filter(Boolean).join(', ') || null,
          displays_count: displaysLink.length || 0,
          interface_access: r['Interface Access (from Venue)'] || null,
          server_location: r['Server Location (from Venue)'] || null,
          notes: r['Notes'] || null,
          photo: photo && photo.length ? photo.map((a: any) => ({
            url: a.signedUrl || a.url, name: a.title || a.path,
            thumbnail: a.signedUrl || a.url, contentType: a.mimetype,
          })) : null,
          map_attachment: map && map.length ? map.map((a: any) => ({
            url: a.signedUrl || a.url, name: a.title || a.path,
            thumbnail: a.signedUrl || a.url, contentType: a.mimetype,
          })) : null,
          updated_at: r['UpdatedAt'] || null,
        }
      })
      return NextResponse.json({ items, total: pageInfo?.totalRows || items.length })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[display-locations/nocodb GET]', err)
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
    const result = await NocoOps.updateRecords(TABLE_ID, [{ Id: Number(id), ...fields }])
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.error('[display-locations/nocodb PATCH]', err)
    return NextResponse.json({ error: 'NocoDB update failed' }, { status: 502 })
  }
}
