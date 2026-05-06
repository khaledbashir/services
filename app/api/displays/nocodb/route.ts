import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/rbac'
import { NocoOps } from '@/lib/nocodb-ops'

// NocoDB NY base — Displays table.
const DISPLAYS_TABLE_ID = 'mh1566n5k578cbf'

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!NocoOps.configured()) return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'list'

  try {
    if (action === 'list') {
      const limit = Math.min(Number(searchParams.get('limit') || 500), 1000)
      const { records, pageInfo } = await NocoOps.listRecords(DISPLAYS_TABLE_ID, {
        sort: '-CreatedAt',
        limit,
      })
      const items = records.map((r: any) => {
        const dispLoc = Array.isArray(r['Display Location']) ? r['Display Location'] : []
        const connDev = Array.isArray(r['Connected Devices']) ? r['Connected Devices'] : []
        const venueLink = Array.isArray(r['Venue']) ? r['Venue'] : []
        const issuesLink = Array.isArray(r['Issues']) ? r['Issues'] : []
        const images = Array.isArray(r['Image']) ? r['Image'] : null
        return {
          id: String(r['Id']),
          display_name: String(r['Display Name'] || '').trim(),
          nick_name: String(r['Nick Name'] || '').trim() || null,
          type: r['Type'] || null,
          make: r['Make'] || null,
          model: String(r['Model'] || '').trim() || null,
          orientation: r['Orientation'] || null,
          resolution: String(r['Resolution'] || '').trim() || null,
          ownership: r['Ownership'] || null,
          moynihan_phase: r['Moynihan Phase#'] || null,
          screen_number: String(r['Screen Number'] || '').trim() || null,
          serial_number: String(r['Serial #'] || '').trim() || null,
          three_letter_code: String(r['Three Letter Code'] || '').trim() || null,
          location_label: dispLoc.map((l: any) => l['Name']).filter(Boolean).join(', ') || null,
          venue_label: venueLink.map((v: any) => v['Venue Name']).filter(Boolean).join(', ') || null,
          connected_devices: connDev.map((d: any) => d['Device Name']).filter(Boolean).join(', ') || null,
          active_issues: issuesLink.length || 0,
          lcd_ip_address: String(r['LCD IP Address'] || '').trim() || null,
          planned: !!r['Planned'],
          notes: r['Notes'] || null,
          images: images && images.length ? images.map((a: any) => ({
            url: a.signedUrl || a.url,
            name: a.title || a.path,
            thumbnail: a.signedUrl || a.url,
            contentType: a.mimetype,
          })) : null,
          updated_at: r['UpdatedAt'] || null,
        }
      })
      return NextResponse.json({ items, total: pageInfo?.totalRows || items.length })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[displays/nocodb GET]', err)
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
    const result = await NocoOps.updateRecords(DISPLAYS_TABLE_ID, [{ Id: Number(id), ...fields }])
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.error('[displays/nocodb PATCH]', err)
    return NextResponse.json({ error: 'NocoDB update failed' }, { status: 502 })
  }
}
