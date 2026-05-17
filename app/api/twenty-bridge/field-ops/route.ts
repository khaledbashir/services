export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { NocoOps } from '@/lib/nocodb-ops'
import {
  ISSUES_VIEWS,
  TABLES,
  VENUE_COLS,
} from '@/lib/walkthrough-config'

const BRIDGE_SECRET =
  process.env.FIELD_OPS_BRIDGE_SECRET ||
  process.env.TWENTY_BRIDGE_SECRET ||
  'twenty-bridge-2026'

function authorized(request: NextRequest): boolean {
  const value =
    request.headers.get('x-bridge-secret') ||
    request.headers.get('x-api-key') ||
    request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return !!BRIDGE_SECRET && value === BRIDGE_SECRET
}

function asLinkLabel(value: unknown, keys: string[]): string {
  if (!Array.isArray(value) || !value[0]) return ''
  const row = value[0] as Record<string, unknown>
  for (const key of keys) {
    const candidate = row[key]
    if (candidate) return String(candidate)
  }
  return row.Id ? `#${row.Id}` : ''
}

function mapWalkthrough(row: Record<string, any>) {
  const rawDate = row['Log Date Dt'] || row['Log Date'] || row.CreatedAt
  const issueLinks = Array.isArray(row['Problem Detected']) ? row['Problem Detected'] : []
  const comments = String(row['Comments (log issues above)'] || '')
  const result = String(row.Result || '')
  const ticketLinked = /Linked ticket: ?#\d+/i.test(comments)

  return {
    id: String(row.Id),
    logId: String(row['Log ID'] || '').trim() || `#${row.Id}`,
    venue: asLinkLabel(row.Venue, ['Venue Name', 'Name', 'name']) || '-',
    technician: String(row.Technician || row['Logged By'] || '').trim() || '-',
    date: rawDate ? String(rawDate).slice(0, 10) : null,
    time: row['Log Time'] ? String(row['Log Time']) : null,
    type: row.Type || null,
    result: result || null,
    locations: Array.isArray(row['Locations Visited'])
      ? row['Locations Visited'].map((l: any) => l.Name || l.name).filter(Boolean).join(', ')
      : '',
    issues: issueLinks.map((i: any) => i['Issue ID'] || i.name).filter(Boolean).join(', '),
    comments,
    ticketLinked,
  }
}

function mapIssue(row: Record<string, any>) {
  const displays = Array.isArray(row['Affected Displays']) ? row['Affected Displays'] : []
  return {
    id: String(row.Id),
    issueId: String(row['Issue ID'] || '').trim() || `Issue #${row.Id}`,
    status: String(row.Status || '').trim() || '-',
    venue: asLinkLabel(row.Venue, ['Venue Name', 'Name', 'name']) || String(row.Venue || ''),
    summary: String(row['Issue Summary'] || row.Name || '').trim(),
    assignedTo: String(row['Assign to'] || '').trim(),
    affectedDisplays: displays.map((d: any) => d['Display Name'] || d.Name || `#${d.Id}`).filter(Boolean).join(', '),
  }
}

function mapDisplay(row: Record<string, any>) {
  return {
    id: String(row.Id),
    name: String(row['Display Name'] || row['Nick Name'] || '').trim() || `Display #${row.Id}`,
    venue: asLinkLabel(row.Venue, ['Venue Name', 'Name', 'name']),
    location: asLinkLabel(row['Display Location'], ['Name', 'Display Location', 'name']),
    type: String(row.Type || '').trim(),
    manufacturer: String(row.Manufacturer || row.Make || '').trim(),
    ip: String(row.IP || row['IP Address'] || '').trim(),
    status: String(row.Status || row['Install Phase'] || '').trim(),
  }
}

function mapLocation(row: Record<string, any>) {
  return {
    id: String(row.Id),
    name: String(row.Name || '').trim() || `Location #${row.Id}`,
    venue: asLinkLabel(row.Venue, ['Venue Name', 'Name', 'name']),
    code: String(row['Three Letter Code'] || row['Location Abbreviation'] || '').trim(),
  }
}

async function resolveVenueName(venueId: number): Promise<string | null> {
  const { records } = await NocoOps.listRecords(TABLES.venues, {
    where: `(Id,eq,${venueId})`,
    fields: 'Id,Venue Name',
    limit: 1,
  })
  return String((records[0] as any)?.['Venue Name'] || '').trim() || null
}

function orChainEq(field: string, titles: string[]): string {
  return titles.map((t) => `(${field},eq,${String(t).replace(/[(),]/g, ' ')})`).join('~or')
}

async function getLocationsForVenue(venueId: number) {
  const linkedRows = await NocoOps.listLinks(TABLES.venues, VENUE_COLS.displayLocationsLink, venueId, {
    limit: 500,
  })
  const ids = linkedRows.map((r: any) => Number(r.Id)).filter((n) => Number.isFinite(n) && n > 0)
  if (!ids.length) return []
  const { records } = await NocoOps.listRecords(TABLES.displayLocations, {
    where: `(Id,in,${ids.join(',')})`,
    limit: 500,
  })
  return records
    .map(mapLocation)
    .filter((l) => l.name && !l.name.startsWith('[ARCHIVED]'))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!NocoOps.configured()) return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || 'overview')

  try {
    if (action === 'overview') {
      const [walkthroughs, openIssues, displays, locations, venues] = await Promise.all([
        NocoOps.listRecords(TABLES.walkthroughLog, { sort: '-CreatedAt', limit: 120 }),
        NocoOps.listRecords(TABLES.issues, { viewId: ISSUES_VIEWS.openIssues, limit: 120 }),
        NocoOps.listRecords(TABLES.displays, { limit: 120 }),
        NocoOps.listRecords(TABLES.displayLocations, { limit: 120 }),
        NocoOps.listRecords(TABLES.venues, { limit: 250 }),
      ])

      return NextResponse.json({
        ok: true,
        source: 'nocodb',
        servicesUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://services.ancsports.net',
        counts: {
          walkthroughs: walkthroughs.pageInfo?.totalRows || walkthroughs.records.length,
          openIssues: openIssues.pageInfo?.totalRows || openIssues.records.length,
          displays: displays.pageInfo?.totalRows || displays.records.length,
          locations: locations.pageInfo?.totalRows || locations.records.length,
          venues: venues.pageInfo?.totalRows || venues.records.length,
        },
        walkthroughs: walkthroughs.records.map(mapWalkthrough),
        issues: openIssues.records.map(mapIssue),
        displays: displays.records.map(mapDisplay),
        locations: locations.records.map(mapLocation),
        venues: venues.records
          .map((v: any) => ({
            id: String(v.Id),
            name: String(v['Venue Name'] || '').trim(),
            abbreviation: String(v.Abbreviation || '').trim(),
          }))
          .filter((v) => v.name)
          .sort((a, b) => a.name.localeCompare(b.name)),
      })
    }

    if (action === 'locations') {
      const venueId = Number(body.venueId)
      if (!venueId) return NextResponse.json({ error: 'venueId required' }, { status: 400 })
      return NextResponse.json({ ok: true, locations: await getLocationsForVenue(venueId) })
    }

    if (action === 'openIssues') {
      const venueId = Number(body.venueId)
      if (!venueId) return NextResponse.json({ error: 'venueId required' }, { status: 400 })
      const venueName = await resolveVenueName(venueId)
      if (!venueName) return NextResponse.json({ ok: true, issues: [] })
      const { records } = await NocoOps.listRecords(TABLES.issues, {
        viewId: ISSUES_VIEWS.openIssues,
        where: `(Venue,eq,${venueName})`,
        limit: 200,
      })
      return NextResponse.json({ ok: true, issues: records.map(mapIssue) })
    }

    if (action === 'displays') {
      const locationNames = Array.isArray(body.locationNames) ? body.locationNames.map(String).filter(Boolean) : []
      if (!locationNames.length) return NextResponse.json({ ok: true, displays: [] })
      const { records } = await NocoOps.listRecords(TABLES.displays, {
        where: orChainEq('Display Location', locationNames),
        limit: 500,
      })
      return NextResponse.json({ ok: true, displays: records.map(mapDisplay) })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[twenty-bridge/field-ops]', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'field ops bridge failed' }, { status: 502 })
  }
}
