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
      // Filter the Display Locations by Venue NAME — NocoDB matches Link
      // fields against the linked record's display title, not its row id.
      const venueName = await resolveVenueName(venueId)
      if (!venueName) return NextResponse.json({ locations: [] })
      const { records } = await NocoOps.listRecords(TABLES.displayLocations, {
        where: `(Venue,eq,${venueName})`,
        limit: 200,
      })
      const locations = records
        .map((r) => ({
          id: Number((r as any).Id),
          name: String((r as any)['Name'] || '').trim() || `Location #${(r as any).Id}`,
          three_letter_code: String((r as any)['Three Letter Code'] || '').trim() || null,
          location_abbreviation: String((r as any)['Location Abbreviation'] || '').trim() || null,
        }))
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

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('[walkthroughs/nocodb GET]', err)
    return NextResponse.json({ error: 'NocoDB lookup failed' }, { status: 502 })
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

    const logId = `${dateStr} [${venueAbbr || venueName.slice(0, 4).toUpperCase()}]`
    const failureSummary = summarizeAssetFindings(assetFindings)

    // Compose the Comments body. Includes asset-level fail summary so
    // NocoDB record view shows what specifically failed, even before we
    // ship per-issue rows in the linked Issues table.
    const composedComments = [
      comments,
      failureSummary ? `\n--- Per-asset findings ---\n${failureSummary}` : '',
    ].filter(Boolean).join('\n').trim()

    // Step 1 — create the Walkthrough Log row.
    const created = await NocoOps.createRecords(TABLES.walkthroughLog, [{
      'Log ID': logId,
      'Technician': user.fullName || user.email,
      'Log Date': isoDate,
      'Log Date Dt': dtForNoco,
      'Log Time': now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }).toLowerCase().replace(' ', ''),
      'Type': type,
      'Result': result,
      'Comments (log issues above)': composedComments,
      'Three Letter Code': venueAbbr,
    }])
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
  for (const r of records) {
    const id = Number((r as any).Id)
    const name = String((r as any).Name || `Location #${id}`).trim()
    idToName.set(id, name)
  }
  // Map display id → location id (best effort) by re-fetching displays.
  const displayWhere = `(Display Location,in,${locationIds.join(',')})`
  const { records: dRows } = await NocoOps.listRecords(TABLES.displays, { where: displayWhere, limit: 500 })
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
  for (const f of findings) {
    const loc = displayToLoc.get(Number(f.display_id)) || 0
    if (!byLoc.has(loc)) byLoc.set(loc, [])
    byLoc.get(loc)!.push(f)
  }
  // Materialize in the order of the original locationIds.
  const out: Array<{ name: string; findings: any[] }> = []
  for (const lid of locationIds) {
    out.push({
      name: idToName.get(lid) || `Location #${lid}`,
      findings: byLoc.get(lid) || [],
    })
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
  const lines: string[] = []
  for (const f of findings) {
    const fails = dimensions.filter(([_, k]) => f[k] === false).map(([label]) => label)
    if (fails.length) {
      lines.push(`• ${f.display_name}: failed — ${fails.join(', ')}`)
    }
  }
  return lines.join('\n')
}
