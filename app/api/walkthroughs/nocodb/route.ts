export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/rbac'
import { query } from '@/lib/db'
import { NocoOps } from '@/lib/nocodb-ops'
import { Browserless } from '@/lib/browserless'
import { buildWalkthroughHtml } from '@/lib/walkthrough-pdf'
import {
  NY_BASE_ID,
  TABLES,
  WALK_COLS,
  VENUE_COLS,
  ISSUES_VIEWS,
  RESULT_OPTIONS,
  TYPE_OPTIONS,
  type WalkthroughResult,
  type WalkthroughType,
} from '@/lib/walkthrough-config'

// Resolve a venue id → its display name. Cached per-request via the
// caller; we look up by Id with the API's eq filter on a Number column.
async function resolveVenueName(venueId: number): Promise<string | null> {
  const { records } = await NocoOps.listRecords(TABLES.venues, {
    where: `(Id,eq,${venueId})`,
    fields: 'Id,Venue Name',
    limit: 1,
  })
  const name = String((records[0] as any)?.['Venue Name'] || '').trim()
  return name || null
}

// NocoDB filters Link fields by the linked record's display title, NOT
// by row id. This helper builds an `~or`-chained `(Field,eq,Title)` clause
// from a list of titles so we don't trip over commas inside titles when
// using the bare `in` operator.
function orChainEq(field: string, titles: string[]): string {
  return titles.map((t) => `(${field},eq,${t})`).join('~or')
}

// GET /api/walkthroughs/nocodb?action=venues
//     /api/walkthroughs/nocodb?action=locations&venue_id=3
//     /api/walkthroughs/nocodb?action=displays&location_ids=1,2,3
//
// Reads from the NocoDB ops workspace so the form can populate dropdowns
// without exposing the PAT to the browser.
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!NocoOps.configured()) return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'venues'

  try {
    if (action === 'venues') {
      const { records } = await NocoOps.listRecords(TABLES.venues, { limit: 200 })
      const venues = records
        .map((r) => ({
          id: Number((r as any).Id),
          name: String((r as any)['Venue Name'] || '').trim(),
          abbreviation: String((r as any)['Abbreviation'] || '').trim() || null,
        }))
        .filter((v) => v.name)
        .sort((a, b) => a.name.localeCompare(b.name))
      return NextResponse.json({ venues })
    }

    if (action === 'locations') {
      const venueId = Number(searchParams.get('venue_id'))
      if (!venueId) return NextResponse.json({ error: 'venue_id required' }, { status: 400 })
      // Walk the Venue → Display Locations link directly. Previous impl
      // filtered Display Locations by Venue NAME string match, which leaked
      // locations across venues when the linked Venue title wasn't an exact
      // match (Nick saw Pier 17 / World Trade Center locations under
      // Moynihan). Two-step: pull linked Display Location IDs from the
      // venue row, then fetch the full rows with the fields we need.
      const linkedRows = await NocoOps.listLinks(
        TABLES.venues,
        VENUE_COLS.displayLocationsLink,
        venueId,
        { limit: 500 }
      )
      const linkedIds = linkedRows
        .map((r) => Number((r as any).Id))
        .filter((n) => Number.isFinite(n) && n > 0)
      if (!linkedIds.length) return NextResponse.json({ locations: [] })
      const { records } = await NocoOps.listRecords(TABLES.displayLocations, {
        where: `(Id,in,${linkedIds.join(',')})`,
        limit: 500,
      })
      const locations = records
        .map((r) => ({
          id: Number((r as any).Id),
          name: String((r as any)['Name'] || '').trim() || `Location #${(r as any).Id}`,
          three_letter_code: String((r as any)['Three Letter Code'] || '').trim() || null,
          location_abbreviation: String((r as any)['Location Abbreviation'] || '').trim() || null,
        }))
        .filter((l) => Number.isFinite(l.id))
        // Hide archived rows from the picker — Nick parity 5/13 (he asked
        // to clean up extras). [ARCHIVED] prefix is the soft-delete marker.
        .filter((l) => !l.name.startsWith('[ARCHIVED]'))
        .sort((a, b) => a.name.localeCompare(b.name))
      return NextResponse.json({ locations })
    }

    if (action === 'displays') {
      // Accept location_names (preferred — name-based filter) and fall back
      // to looking the names up if the caller passed location_ids.
      const namesParam = searchParams.get('location_names') || ''
      const idsParam = searchParams.get('location_ids') || ''
      let names = namesParam.split('|').map((s) => s.trim()).filter(Boolean)
      if (!names.length && idsParam) {
        const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean)
        if (!ids.length) return NextResponse.json({ displays: [] })
        const { records } = await NocoOps.listRecords(TABLES.displayLocations, {
          where: `(Id,in,${ids.join(',')})`,
          fields: 'Id,Name',
          limit: 200,
        })
        names = records.map((r) => String((r as any).Name || '').trim()).filter(Boolean)
      }
      if (!names.length) return NextResponse.json({ displays: [] })
      const where = orChainEq('Display Location', names)
      const { records } = await NocoOps.listRecords(TABLES.displays, { where, limit: 500 })
      const displays = records.map((r) => ({
        id: Number((r as any).Id),
        name: String((r as any)['Display Name'] || (r as any)['Nick Name'] || `Display #${(r as any).Id}`).trim(),
        nickName: String((r as any)['Nick Name'] || '').trim() || null,
        type: String((r as any)['Type'] || '').trim() || null,
        location_id: Array.isArray((r as any)['Display Location']) && (r as any)['Display Location'][0]?.Id
          ? Number((r as any)['Display Location'][0].Id)
          : null,
      }))
      return NextResponse.json({ displays })
    }

    if (action === 'open-issues') {
      // Surface currently-open Issues for the selected venue so the tech
      // can flag which one they observed (mirrors the Airtable Result =
      // "Open issue Observed" workflow).
      const venueId = Number(searchParams.get('venue_id'))
      if (!venueId) return NextResponse.json({ error: 'venue_id required' }, { status: 400 })
      const venueName = await resolveVenueName(venueId)
      if (!venueName) return NextResponse.json({ issues: [] })
      const { records } = await NocoOps.listRecords(TABLES.issues, {
        viewId: ISSUES_VIEWS.openIssues,
        where: `(Venue,eq,${venueName})`,
        limit: 200,
      })
      const issues = records.map((r) => {
        const affected = Array.isArray((r as any)['Affected Displays']) ? (r as any)['Affected Displays'] : []
        return {
          id: Number((r as any).Id),
          label: String((r as any)['Issue ID'] || '').trim() || `Issue #${(r as any).Id}`,
          status: String((r as any)['Status'] || '').trim(),
          summary: String((r as any)['Issue Summary'] || '').trim(),
          assigned_to: String((r as any)['Assign to'] || '').trim() || null,
          affected_displays: affected.map((d: any) => ({
            id: Number(d.Id),
            name: String(d['Display Name'] || `Display #${d.Id}`).trim(),
          })),
        }
      })
      return NextResponse.json({ issues })
    }

    if (action === 'row') {
      // Single walkthrough by Id — used by the /walkthroughs/[id]/checklist
      // page (Nick parity 5/13: "Maintain Checklist" per-row button).
      const rowId = searchParams.get('id')
      if (!rowId) return NextResponse.json({ error: 'id required' }, { status: 400 })
      const { records } = await NocoOps.listRecords(TABLES.walkthroughLog, {
        where: `(Id,eq,${Number(rowId)})`,
        limit: 1,
      })
      const r: any = records[0]
      if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const venueLink = Array.isArray(r['Venue']) ? r['Venue'] : []
      const venueRow = venueLink[0] || null
      const venueName = venueRow?.['Venue Name'] || venueRow?.['name'] || ''
      const venueId = venueRow?.Id ? Number(venueRow.Id) : null
      const locsLink = Array.isArray(r['Locations Visited']) ? r['Locations Visited'] : []
      const locationsLabel = locsLink.map((l: any) => l['Name'] || l['name']).filter(Boolean).join(', ')
      const probLink = Array.isArray(r['Problem Detected']) ? r['Problem Detected'] : []
      const issuesLabel = probLink.map((i: any) => i['Issue ID'] || i['name']).filter(Boolean).join(', ')
      const rawDate = r['Log Date Dt'] || r['Log Date'] || r['CreatedAt']
      const log_date = rawDate ? String(rawDate).slice(0, 10) : null
      return NextResponse.json({
        walkthrough: {
          id: String(r['Id']),
          log_id: String(r['Log ID'] || '').trim() || `#${r['Id']}`,
          venue_name: String(venueName).trim() || '—',
          technician_name: String(r['Technician'] || r['Logged By'] || '').trim() || null,
          log_date,
          type: r['Type'] || null,
          result: r['Result'] || null,
          locations_visited: locationsLabel || null,
          issues_found: issuesLabel || null,
          comments: r['Comments (log issues above)'] || null,
        },
        venue_id: venueId,
      })
    }

    if (action === 'projected-log-id') {
      // Show the tech the date prefix of the Log ID at form open — Nick
      // parity (5/13 video): Airtable auto-populates `YY-MM-DD []` and
      // fills in the TAG once a venue is picked. Returns just the date
      // prefix; the form composes the final ID client-side as the venue
      // is selected.
      const now = new Date()
      const dateStr = now.toISOString().slice(2, 10)
      return NextResponse.json({
        projected: `${dateStr} [ ]`,
        date_prefix: dateStr,
      })
    }

    if (action === 'history') {
      // Historical walkthroughs at a given venue or location — Nick's
      // 5/13 ask: "if I go into something, I can see all the historic
      // issues, and I can pop into this ticket". Filter by venue_id /
      // venue_name / location_id / location_name; returns the same row
      // shape as ?action=list so the existing grid card can render it
      // directly. Name params let the drawer link without round-tripping
      // for the row Id.
      const venueIdRaw = searchParams.get('venue_id')
      const locationIdRaw = searchParams.get('location_id')
      const venueNameRaw = searchParams.get('venue_name')
      const locationNameRaw = searchParams.get('location_name')
      const limit = Math.min(Number(searchParams.get('limit') || 100), 500)
      let where = ''
      if (venueIdRaw) {
        const venueName = await resolveVenueName(Number(venueIdRaw))
        if (!venueName) return NextResponse.json({ walkthroughs: [], total: 0 })
        where = `(Venue,eq,${venueName})`
      } else if (venueNameRaw) {
        const trimmed = venueNameRaw.trim()
        if (!trimmed) return NextResponse.json({ walkthroughs: [], total: 0 })
        where = `(Venue,eq,${trimmed})`
      } else if (locationIdRaw) {
        // Filter by linked Display Location title. Look up the name first
        // because NocoDB filters Link fields by display title, not Id.
        const { records: locRow } = await NocoOps.listRecords(TABLES.displayLocations, {
          where: `(Id,eq,${Number(locationIdRaw)})`,
          fields: 'Id,Name',
          limit: 1,
        })
        const locName = String((locRow[0] as any)?.['Name'] || '').trim()
        if (!locName) return NextResponse.json({ walkthroughs: [], total: 0 })
        where = `(Locations Visited,eq,${locName})`
      } else if (locationNameRaw) {
        const trimmed = locationNameRaw.trim()
        if (!trimmed) return NextResponse.json({ walkthroughs: [], total: 0 })
        where = `(Locations Visited,eq,${trimmed})`
      } else {
        return NextResponse.json({ error: 'venue_id, venue_name, location_id, or location_name required' }, { status: 400 })
      }
      const { records, pageInfo } = await NocoOps.listRecords(TABLES.walkthroughLog, {
        where,
        sort: '-CreatedAt',
        limit,
      })
      const walkthroughs = records.map((r: any) => {
        const venueLink = Array.isArray(r['Venue']) ? r['Venue'] : []
        const venueName = venueLink[0]?.['Venue Name'] || venueLink[0]?.['name'] || ''
        const locsLink = Array.isArray(r['Locations Visited']) ? r['Locations Visited'] : []
        const locationsLabel = locsLink.map((l: any) => l['Name'] || l['name']).filter(Boolean).join(', ')
        const probLink = Array.isArray(r['Problem Detected']) ? r['Problem Detected'] : []
        const issuesLabel = probLink.map((i: any) => i['Issue ID'] || i['name']).filter(Boolean).join(', ')
        const rawDate = r['Log Date Dt'] || r['Log Date'] || r['CreatedAt']
        const log_date = rawDate ? String(rawDate).slice(0, 10) : null
        return {
          id: String(r['Id']),
          log_id: String(r['Log ID'] || '').trim() || `#${r['Id']}`,
          venue_name: String(venueName).trim() || '—',
          technician_name: String(r['Technician'] || r['Logged By'] || '').trim() || null,
          log_date,
          type: r['Type'] || null,
          result: r['Result'] || null,
          locations_visited: locationsLabel || null,
          issues_found: issuesLabel || null,
          comments: r['Comments (log issues above)'] || null,
        }
      })
      return NextResponse.json({ walkthroughs, total: pageInfo?.totalRows || walkthroughs.length })
    }

    if (action === 'logged-by-options') {
      // Pull the singleSelect options from the NocoDB Walkthrough Log meta
      // for the "Logged By" column. Cached at NocoDB's edge — fast.
      const meta = await NocoOps.getTable(TABLES.walkthroughLog) as { columns: any[] }
      const col = meta.columns.find(c => c.id === WALK_COLS.loggedBy)
      const options = (col?.colOptions?.options || []).map((o: any) => o.title).filter(Boolean)
      return NextResponse.json({ options })
    }

    if (action === 'list') {
      // List walkthrough records — what /walkthroughs page reads. Joe/Nick's
      // canonical Walkthrough Log lives in NocoDB (5/4 lock); this is the
      // authoritative source. Default to 500 / page; infinite scroll on the
      // grid pages further via offset.
      const limit = Math.min(Number(searchParams.get('limit') || 500), 1000)
      const offset = Math.max(Number(searchParams.get('offset') || 0), 0)
      let where = ''
      let sort = '-CreatedAt'
      const rawFilter = searchParams.get('filter')
      const rawSort = searchParams.get('sort')
      if (rawFilter) {
        try {
          const { filterRulesToNocoWhere } = await import('@/lib/nocodb-schema')
          where = filterRulesToNocoWhere(JSON.parse(rawFilter))
        } catch {}
      }
      if (rawSort) {
        try {
          const { sortingToNocoSort } = await import('@/lib/nocodb-schema')
          const s = sortingToNocoSort(JSON.parse(rawSort))
          if (s) sort = s
        } catch {}
      }
      const { records, pageInfo } = await NocoOps.listRecords(TABLES.walkthroughLog, {
        sort,
        limit,
        offset,
        where: where || undefined,
      })
      const walkthroughs = records.map((r: any) => {
        const venueLink = Array.isArray(r['Venue']) ? r['Venue'] : []
        const venueName = venueLink[0]?.['Venue Name'] || venueLink[0]?.['name'] || ''
        const locsLink = Array.isArray(r['Locations Visited']) ? r['Locations Visited'] : []
        const locationsLabel = locsLink.map((l: any) => l['Name'] || l['name']).filter(Boolean).join(', ')
        const probLink = Array.isArray(r['Problem Detected']) ? r['Problem Detected'] : []
        const issuesLabel = probLink.map((i: any) => i['Issue ID'] || i['name']).filter(Boolean).join(', ')
        // Prefer the typed datetime; fall back to text-typed Log Date; final
        // fallback to CreatedAt so the Calendar view always has a date.
        const rawDate = r['Log Date Dt'] || r['Log Date'] || r['CreatedAt']
        const log_date = rawDate ? String(rawDate).slice(0, 10) : null
        const log_time = r['Log Time'] ? String(r['Log Time']) : null
        // Empty Log ID → fall back to "#<row id>" so the primary column never
        // renders a blank cell. Source data has many partially-filled records
        // (interrupted form submissions) and blanks make the grid look broken.
        const rawLogId = String(r['Log ID'] || '').trim()
        const comments = r['Comments (log issues above)'] || null
        const result = r['Result'] || null
        // Walkthrough Guide — ports Nick's Airtable formula
        // (`fld5Y69VxnEMaZxX5` Walkthrough Guide column). Computes a
        // workflow status pill per row that tells the tech the next step.
        const hasVenue = !!String(venueName).trim()
        const hasLocations = locsLink.length > 0
        const hasIssues = probLink.length > 0
        const ticketLinked = typeof comments === 'string' && /Linked ticket: ?#/i.test(comments)
        let walkthrough_guide: string
        if (!hasVenue) walkthrough_guide = '🛑 Choose Venue'
        else if (!hasLocations) walkthrough_guide = '🔄 Autofilling Location'
        else if (!result && !hasIssues) walkthrough_guide = '🔄 Autofilling Open Issues'
        else if (!result && !hasIssues) walkthrough_guide = '✔ No Open Issues · Select Result'
        else if (!result && hasIssues) walkthrough_guide = '✔ Issues Found · Select Result'
        else if (result === 'New Issue Detected' && !ticketLinked) walkthrough_guide = '🛑 Create Issue'
        else walkthrough_guide = '✅ Good Walkthrough'
        return {
          id: String(r['Id']),
          log_id: rawLogId || `#${r['Id']}`,
          venue_id: null,
          venue_name: String(venueName).trim() || '—',
          technician_name: String(r['Technician'] || r['Logged By'] || '').trim() || null,
          log_date,
          log_time,
          type: r['Type'] || null,
          result,
          locations_visited: locationsLabel || null,
          issues_found: issuesLabel || null,
          comments,
          walkthrough_guide,
          three_letter_code: r['Three Letter Code'] || null,
          created_at: r['CreatedAt'] || null,
        }
      })
      return NextResponse.json({ walkthroughs, total: pageInfo?.totalRows || walkthroughs.length })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[walkthroughs/nocodb GET]', err)
    return NextResponse.json({ error: 'NocoDB lookup failed' }, { status: 502 })
  }
}

// PATCH /api/walkthroughs/nocodb
//
// Body: { id: string|number, fields: Record<string, any> }
// Updates one Walkthrough Log row in NocoDB. Field names are NocoDB column
// titles (e.g. "Result", "Type", "Comments (log issues above)").
export async function PATCH(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!NocoOps.configured()) return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })

  const body = await request.json()
  const { id, fields } = body || {}
  if (id == null) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!fields || typeof fields !== 'object') return NextResponse.json({ error: 'fields object required' }, { status: 400 })

  try {
    const result = await NocoOps.updateRecords(TABLES.walkthroughLog, [{ Id: Number(id), ...fields }])
    return NextResponse.json({ ok: true, result })
  } catch (err) {
    console.error('[walkthroughs/nocodb PATCH]', err)
    return NextResponse.json({ error: 'NocoDB update failed' }, { status: 502 })
  }
}

// POST /api/walkthroughs/nocodb
//
// Creates a Walkthrough Log row in NocoDB. Auto-populates date/time and
// technician from the auth session. If result === "New Issue Detected", also
// creates a ticket in the local anc-services tickets table and writes the
// ticket number into the walkthrough comments so it's traceable from both
// systems.
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!NocoOps.configured()) return NextResponse.json({ error: 'NocoDB not configured' }, { status: 500 })

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const venueId = Number(body.venue_id)
  const type = String(body.type || '') as WalkthroughType
  const result = String(body.result || '') as WalkthroughResult
  const comments = String(body.comments || '').trim()
  // Submitter dropdown (Nick Slack 5/4) — explicit "who is logging this"
  // tag, separate from the auth-detected Technician. Validated against
  // NocoDB's Logged By option list before write so we don't poison the
  // singleSelect with garbage.
  const loggedBy = String(body.logged_by || '').trim() || null
  const locationIds: number[] = Array.isArray(body.location_ids)
    ? body.location_ids.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n))
    : []
  const assetFindings: Array<{
    display_id: number
    display_name: string
    image_quality: boolean
    av_rotation: boolean
    physical_damage: boolean
    pixel_outages: boolean
    cleanliness: boolean
  }> = Array.isArray(body.asset_findings) ? body.asset_findings : []
  const observedIssueIds: number[] = Array.isArray(body.observed_issue_ids)
    ? body.observed_issue_ids.map((x: any) => Number(x)).filter((n: number) => Number.isFinite(n) && n > 0)
    : []

  if (!venueId) return NextResponse.json({ error: 'venue_id required' }, { status: 400 })
  if (!TYPE_OPTIONS.includes(type)) return NextResponse.json({ error: 'invalid type' }, { status: 400 })
  if (!RESULT_OPTIONS.includes(result)) return NextResponse.json({ error: 'invalid result' }, { status: 400 })

  const now = new Date()
  const isoDate = now.toISOString()                              // for legacy Log Date (LongText)
  const dtForNoco = isoDate.replace('T', ' ').replace(/\.\d+Z$/, '+00:00')  // proper DateTime literal
  const dateStr = isoDate.slice(2, 10)                           // "26-05-04"

  try {
    // Pull the venue's three-letter abbreviation for the Log ID label.
    const { records: vrows } = await NocoOps.listRecords(TABLES.venues, {
      where: `(Id,eq,${venueId})`,
      limit: 1,
    })
    const venueRow = vrows[0] as any
    const venueName = String(venueRow?.['Venue Name'] || '').trim() || `Venue #${venueId}`
    const venueAbbr = String(venueRow?.['Abbreviation'] || '').trim() || ''

    // Log ID format `YY-MM-DD [LOC1, LOC2]` — matches Nick's Airtable
    // formula exactly (`fldIkCUVUiDV41VOO` AutoFill Component (Code)
    // wrapped in brackets). The TAG is the joined three_letter_code of
    // every Display Location the tech checked off, comma-separated.
    // Falls back to venue abbr if no locations were selected (interrupted
    // submission), matching the existing legacy rows that lack codes.
    let locationCodes: string[] = []
    if (locationIds.length) {
      try {
        const { records: locRows } = await NocoOps.listRecords(TABLES.displayLocations, {
          where: `(Id,in,${locationIds.join(',')})`,
          limit: 500,
        })
        locationCodes = locRows
          .map((r) => {
            const code = String((r as any)['Three Letter Code'] || (r as any)['Location Abbreviation'] || '').trim()
            return code
          })
          .filter(Boolean)
      } catch (e) {
        console.warn('[walkthroughs/nocodb] location-code lookup failed (Log ID falls back to venue abbr):', e)
      }
    }
    const tagAbbr = locationCodes.length
      ? locationCodes.join(', ')
      : (venueAbbr || venueName.slice(0, 4).toUpperCase())
    const logId = `${dateStr} [${tagAbbr}]`
    const failureSummary = summarizeAssetFindings(assetFindings)

    // Compose the Comments body. Includes asset-level fail summary so
    // NocoDB record view shows what specifically failed, even before we
    // ship per-issue rows in the linked Issues table.
    const composedComments = [
      comments,
      failureSummary ? `\n--- Per-asset findings ---\n${failureSummary}` : '',
    ].filter(Boolean).join('\n').trim()

    // Step 1 — create the Walkthrough Log row.
    const newRow: Record<string, any> = {
      'Log ID': logId,
      'Technician': user.fullName || user.email,
      'Log Date': isoDate,
      'Log Date Dt': dtForNoco,
      'Log Time': now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }).toLowerCase().replace(' ', ''),
      'Type': type,
      'Result': result,
      'Comments (log issues above)': composedComments,
      'Three Letter Code': venueAbbr,
    }
    if (loggedBy) newRow['Logged By'] = loggedBy
    const created = await NocoOps.createRecords(TABLES.walkthroughLog, [newRow])
    const newRowId = Number((created[0] as any)?.Id)
    if (!newRowId) throw new Error('NocoDB did not return an Id for the new walkthrough')

    // Step 2 — link the venue.
    await NocoOps.addLinks(TABLES.walkthroughLog, WALK_COLS.venueLink, newRowId, [venueId]).catch((e) => {
      console.warn('[walkthroughs/nocodb] venue link failed:', e)
    })

    // Step 3 — link the visited locations.
    if (locationIds.length) {
      await NocoOps.addLinks(TABLES.walkthroughLog, WALK_COLS.locationsVisitedLink, newRowId, locationIds).catch((e) => {
        console.warn('[walkthroughs/nocodb] locations link failed:', e)
      })
    }

    // Step 3b — link any open Issues the tech flagged as observed.
    // These come from the "Result = Open Issue Observed" picker that the
    // form shows when an open-issue is selected for the venue.
    if (observedIssueIds.length) {
      await NocoOps.addLinks(TABLES.walkthroughLog, WALK_COLS.problemDetectedLink, newRowId, observedIssueIds).catch((e) => {
        console.warn('[walkthroughs/nocodb] problem-detected link failed:', e)
      })
    }

    // Step 4 — if "New Issue Detected", spin up a ticket in the local
    // tickets table so it routes through the existing notification + SLA
    // pipeline. Tag the walkthrough row id in the description for trace.
    let ticketNumber: number | null = null
    if (result === 'New Issue Detected') {
      try {
        // Resolve the corresponding anc-services venue (local pg) by name match,
        // best-effort — Nick's NocoDB venues mirror the dashboard venues by name.
        const venueLookup = await query(
          `SELECT id FROM venues WHERE LOWER(name) = LOWER($1) LIMIT 1`,
          [venueName]
        )
        const dashboardVenueId = venueLookup.rows[0]?.id || null

        if (dashboardVenueId) {
          const titleSeed = comments.split('\n')[0] || `Walkthrough finding — ${venueName}`
          const title = titleSeed.length > 120 ? titleSeed.slice(0, 117) + '…' : titleSeed
          const description = [
            `Auto-generated from walkthrough log entry "${logId}".`,
            comments ? `\nTech notes:\n${comments}` : '',
            failureSummary ? `\nAsset findings:\n${failureSummary}` : '',
            `\nWalkthrough record id: ${newRowId} (NocoDB Walkthrough Log).`,
          ].filter(Boolean).join('\n')

          const ticketResult = await query(
            `INSERT INTO tickets (venue_id, created_by, title, description, priority, status, category, source, ticket_type)
             VALUES ($1, $2, $3, $4, 'high', 'new', 'general', 'walkthrough', 'support')
             RETURNING ticket_number`,
            [dashboardVenueId, user.userId, title, description]
          )
          ticketNumber = ticketResult.rows[0]?.ticket_number || null

          // Patch the walkthrough comments with the ticket number for cross-reference.
          if (ticketNumber) {
            await NocoOps.updateRecords(TABLES.walkthroughLog, [{
              Id: newRowId,
              'Comments (log issues above)': `${composedComments}\n\nLinked ticket: #${String(ticketNumber).padStart(5, '0')}`.trim(),
            }]).catch(() => {})
          }
        }
      } catch (e) {
        console.warn('[walkthroughs/nocodb] auto-ticket failed:', e)
      }
    }

    // Step 5 — generate the PDF report and attach it to the row. Fire and
    // forget so the user gets a fast response; the PDF lands within ~10s
    // and shows up on the NocoDB record's Attachments column.
    const locationsForPdf = locationIds.length
      ? await buildPdfLocationGroups(locationIds, assetFindings)
      : []
    generatePdfAndAttach({
      newRowId,
      log_id: logId,
      technician: user.fullName || user.email,
      venue_name: venueName,
      date_label: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
      time_label: now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
      type,
      result,
      comments: composedComments,
      ticket_number: ticketNumber,
      locations: locationsForPdf,
    }).catch((e) => console.warn('[walkthroughs/nocodb] PDF gen failed:', e))

    // Step 6 — relay any uploaded user attachments into the same column
    // on the walkthrough row, alongside the PDF.
    const userUploads: Array<Record<string, unknown>> = Array.isArray(body.attachments) ? body.attachments : []
    if (userUploads.length) {
      // Patch in user uploads non-destructively after PDF settles. Use a
      // setTimeout so the PDF write isn't clobbered by a concurrent patch.
      setTimeout(() => {
        appendAttachments(newRowId, userUploads).catch((e) => console.warn('[walkthroughs/nocodb] attachment merge failed:', e))
      }, 12_000)
    }

    return NextResponse.json({
      ok: true,
      walkthrough: {
        id: newRowId,
        log_id: logId,
        technician: user.fullName,
        venue_id: venueId,
        venue_name: venueName,
        type,
        result,
        ticket_number: ticketNumber,
        pdf_status: 'generating',
      },
    })
  } catch (err: any) {
    console.error('[walkthroughs/nocodb POST]', err)
    return NextResponse.json({ error: err?.message || 'walkthrough write failed' }, { status: 502 })
  }
}

// Group findings under their Display Locations so the PDF mirrors the
// matrix layout of the live form / paper checklist.
async function buildPdfLocationGroups(locationIds: number[], findings: Array<any>): Promise<Array<{ name: string; findings: any[] }>> {
  if (!locationIds.length) return []
  const where = `(Id,in,${locationIds.join(',')})`
  const { records } = await NocoOps.listRecords(TABLES.displayLocations, { where, limit: 200 })
  // Map DL id → name.
  const idToName = new Map<number, string>()
  const locationNames: string[] = []
  for (const r of records) {
    const id = Number((r as any).Id)
    const name = String((r as any).Name || `Location #${id}`).trim()
    idToName.set(id, name)
    if (name) locationNames.push(name)
  }
  // Map display id → location id by re-fetching displays. NocoDB filters
  // Link fields by the linked record's display title (Name), not its row
  // Id, so we build an or-chained eq on the location names — same approach
  // the GET-displays action uses. The earlier `(Display Location,in,IDs)`
  // form silently returned zero rows, which caused the PDF to render
  // "No assets recorded" under every location header.
  const dRows = locationNames.length
    ? (await NocoOps.listRecords(TABLES.displays, { where: orChainEq('Display Location', locationNames), limit: 500 })).records
    : []
  const displayToLoc = new Map<number, number>()
  for (const r of dRows) {
    const did = Number((r as any).Id)
    const loc = Array.isArray((r as any)['Display Location']) && (r as any)['Display Location'][0]?.Id
      ? Number((r as any)['Display Location'][0].Id)
      : null
    if (loc) displayToLoc.set(did, loc)
  }
  // Group findings by their Display Location.
  const byLoc = new Map<number, any[]>()
  const orphans: any[] = []
  for (const f of findings) {
    const loc = displayToLoc.get(Number(f.display_id))
    if (loc) {
      if (!byLoc.has(loc)) byLoc.set(loc, [])
      byLoc.get(loc)!.push(f)
    } else {
      orphans.push(f)
    }
  }
  // Materialize in the order of the original locationIds.
  const out: Array<{ name: string; findings: any[] }> = []
  for (const lid of locationIds) {
    out.push({
      name: idToName.get(lid) || `Location #${lid}`,
      findings: byLoc.get(lid) || [],
    })
  }
  // Orphan safety net: if a finding's display didn't map (display archived
  // between form load and submit, name mismatch, etc.), surface it under
  // the first selected location rather than silently dropping it.
  if (orphans.length && out.length) {
    out[0].findings = [...out[0].findings, ...orphans]
  }
  return out
}

async function generatePdfAndAttach(w: {
  newRowId: number
  log_id: string
  technician: string
  venue_name: string
  date_label: string
  time_label: string
  type: string
  result: string
  comments: string
  ticket_number?: number | null
  locations: Array<{ name: string; findings: any[] }>
}) {
  if (!Browserless.configured()) {
    console.warn('[walkthroughs/nocodb] BROWSERLESS_TOKEN missing; skipping PDF gen')
    return
  }
  const html = buildWalkthroughHtml(w)
  const pdf = await Browserless.renderPdf({
    html,
    options: {
      format: 'Letter',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    },
  })
  const safeVenue = (w.venue_name || 'venue').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)
  const filename = `Walkthrough_${safeVenue}_${w.log_id.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`
  const uploaded = await NocoOps.uploadFile({
    filename,
    contentType: 'application/pdf',
    body: pdf,
    pathHint: 'walkthroughs',
  })
  if (!uploaded.length) return
  // Patch the row's Attachments field with the new PDF (additive — preserves
  // anything already there, e.g. user uploads queued via the form).
  const existing = await NocoOps.listRecords(TABLES.walkthroughLog, {
    where: `(Id,eq,${w.newRowId})`,
    fields: 'Id,Attachments',
    limit: 1,
  })
  const prior = (existing.records[0] as any)?.['Attachments']
  const merged = Array.isArray(prior) ? [...prior, ...uploaded] : uploaded
  await NocoOps.updateRecords(TABLES.walkthroughLog, [{ Id: w.newRowId, Attachments: merged }])
}

async function appendAttachments(rowId: number, uploads: Array<Record<string, unknown>>) {
  if (!uploads.length) return
  const existing = await NocoOps.listRecords(TABLES.walkthroughLog, {
    where: `(Id,eq,${rowId})`,
    fields: 'Id,Attachments',
    limit: 1,
  })
  const prior = (existing.records[0] as any)?.['Attachments']
  const merged = Array.isArray(prior) ? [...prior, ...uploads] : uploads
  await NocoOps.updateRecords(TABLES.walkthroughLog, [{ Id: rowId, Attachments: merged }])
}

function summarizeAssetFindings(findings: Array<{
  display_id: number
  display_name: string
  image_quality: boolean
  av_rotation: boolean
  physical_damage: boolean
  pixel_outages: boolean
  cleanliness: boolean
}>): string {
  if (!findings.length) return ''
  const dimensions: Array<[string, keyof typeof findings[0]]> = [
    ['Image Quality', 'image_quality'],
    ['A/V Rotation', 'av_rotation'],
    ['Physical Damage', 'physical_damage'],
    ['Pixel Outages', 'pixel_outages'],
    ['Cleanliness', 'cleanliness'],
  ]
  // Field semantics flipped 5/14: `true` = problem flagged on that
  // dimension, `false` = no problem. Summarize the dimensions that were
  // explicitly flagged.
  const lines: string[] = []
  for (const f of findings) {
    const fails = dimensions.filter(([_, k]) => f[k] === true).map(([label]) => label)
    if (fails.length) {
      lines.push(`• ${f.display_name}: problem — ${fails.join(', ')}`)
    }
  }
  return lines.join('\n')
}
