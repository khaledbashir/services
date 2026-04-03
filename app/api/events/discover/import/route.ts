import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'
import { notifyOps } from '@/lib/slack'

interface ImportEvent {
  summary: string
  event_date: string
  start_time: string | null
  end_time: string | null
  event_type: 'game' | 'concert' | 'other'
  league: string | null
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const { venue_id, events } = await request.json() as { venue_id: string; events: ImportEvent[] }
    if (!venue_id || !events || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json({ error: 'venue_id and events array are required' }, { status: 400 })
    }

    // Verify venue exists
    const venueRes = await query('SELECT id, name, slack_channel_id FROM venues WHERE id = $1', [venue_id])
    if (venueRes.rows.length === 0) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 })
    }
    const venue = venueRes.rows[0]

    // Deduplicate one more time before inserting
    const today = new Date().toISOString().split('T')[0]
    const existingRes = await query(
      `SELECT summary, TO_CHAR(event_date, 'YYYY-MM-DD') as event_date
       FROM events WHERE venue_id = $1 AND event_date >= $2`,
      [venue_id, today]
    )
    const existingSet = new Set(
      existingRes.rows.map((r: { summary: string; event_date: string }) =>
        `${r.event_date}|${r.summary.toLowerCase().replace(/[^a-z0-9]/g, '')}`
      )
    )

    let imported = 0
    let skipped = 0
    const importedIds: string[] = []

    for (const e of events) {
      if (!e.summary || !e.event_date) { skipped++; continue }

      const key = `${e.event_date}|${e.summary.toLowerCase().replace(/[^a-z0-9]/g, '')}`
      if (existingSet.has(key)) { skipped++; continue }

      // Build timestamps
      const startTs = e.start_time ? `${e.event_date}T${e.start_time}:00` : `${e.event_date}T00:00:00`
      let endTs: string
      if (e.end_time) {
        endTs = `${e.event_date}T${e.end_time}:00`
      } else if (e.start_time) {
        const [h, m] = e.start_time.split(':').map(Number)
        endTs = `${e.event_date}T${String((h + 3) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
      } else {
        endTs = `${e.event_date}T03:00:00`
      }

      const result = await query(
        `INSERT INTO events (summary, event_date, start_time, end_time, venue_id, league, workflow_status, event_type)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
         RETURNING id`,
        [e.summary, e.event_date, startTs, endTs, venue_id, e.league || null, 'event']
      )
      importedIds.push(result.rows[0].id)
      existingSet.add(key)
      imported++
    }

    if (imported > 0) {
      notifyOps(
        ':mag:',
        `*AI Event Discovery:* ${imported} events auto-imported for *${venue.name}*`,
        { label: 'View Events', url: `https://abc-anc-services.izcgmb.easypanel.host/venues/${venue_id}` },
        venue.slack_channel_id
      )
    }

    return NextResponse.json({ imported, skipped, event_ids: importedIds })
  } catch (err) {
    console.error('Event import error:', err)
    return NextResponse.json({ error: 'Import failed' }, { status: 500 })
  }
}
