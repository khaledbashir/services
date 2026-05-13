import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { NocoOps } from '@/lib/nocodb-ops'
import { Browserless } from '@/lib/browserless'
import { buildWalkthroughHtml } from '@/lib/walkthrough-pdf'
import { TABLES, WALK_COLS, ISSUES_VIEWS } from '@/lib/walkthrough-config'

// POST /api/walkthroughs/nocodb/hook?secret=...
//
// Called by a NocoDB webhook on the Walkthrough Log table after-insert.
// Nick's tech submits via NocoDB's native "Add Visit" form; NocoDB POSTs
// the new row here, and we apply the smart bits that NocoDB can't do
// natively:
//   - Generate a print-ready PDF of the walkthrough and attach it back to
//     the same row.
//   - Open a high-priority ticket in the dashboard's tickets table when
//     the result is "New Issue Detected", and write the ticket number
//     into the walkthrough comments so it's traceable both ways.
//
// The webhook URL has a shared secret in the query string; reject anything
// else.

const HOOK_SECRET = process.env.WALKTHROUGH_HOOK_SECRET || 'walkthrough-hook-anc-5ae19'

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  if (searchParams.get('secret') !== HOOK_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  // NocoDB after-insert hook payload shape:
  //   { type, data: { table_name, table_id, view_id, rows: [<the new row>] } }
  // We accept the row-array form, plus a permissive fallback.
  const rows: any[] = Array.isArray(body?.data?.rows) ? body.data.rows
    : Array.isArray(body?.rows) ? body.rows
    : Array.isArray(body) ? body
    : body?.data ? [body.data] : [body]

  const results: any[] = []
  for (const row of rows) {
    const id = Number(row?.Id)
    if (!id) { results.push({ ok: false, error: 'no Id on row' }); continue }
    try {
      results.push(await processRow(id, row))
    } catch (e: any) {
      console.error('[walkthroughs/nocodb/hook] row processing error:', e)
      results.push({ ok: false, id, error: e?.message || 'process failed' })
    }
  }

  return NextResponse.json({ ok: true, processed: results })
}

async function processRow(id: number, row: any) {
  // 1. Pull the canonical row + linked venue + linked locations + linked
  //    displays so the PDF + ticket have full context.
  const { records: full } = await NocoOps.listRecords(TABLES.walkthroughLog, {
    where: `(Id,eq,${id})`,
    limit: 1,
  })
  const r = (full[0] as any) || row
  const venueLink = Array.isArray(r.Venue) ? r.Venue[0] : null
  const venueName = venueLink?.['Venue Name'] || r['Venue Name'] || 'Unknown venue'
  const venueAbbr = venueLink?.Abbreviation || r['Three Letter Code'] || ''
  let result = String(r.Result || '').trim()
  const type = String(r.Type || '').trim() || 'In-Person'
  const comments = String(r['Comments (log issues above)'] || '').trim()

  // 0. Asset checklist — Nick 5/4 spec. Five Checkbox columns on the
  //    NocoDB form (default true = passed). If ANY is unchecked, the
  //    walkthrough surfaced a problem; auto-promote Result so the rest of
  //    the pipeline (auto-ticket, PDF "FAILED" badge) treats it correctly.
  //    Only promotes when Result was left at default ("No Action Required")
  //    — so the tech can still explicitly pick "Open Issue Observed" without
  //    being overridden.
  const CHECKLIST_COLS = ['Image Quality', 'Ad Rotation', 'Physical Damage', 'Pixel Outages', 'Cleanliness']
  const failedChecklist: string[] = []
  for (const k of CHECKLIST_COLS) if (r[k] === false) failedChecklist.push(k)
  if (failedChecklist.length && (!result || result === 'No Action Required')) {
    try {
      await NocoOps.updateRecords(TABLES.walkthroughLog, [{ Id: id, Result: 'New Issue Detected' }])
      result = 'New Issue Detected'
    } catch (e) {
      console.warn('[walkthroughs/nocodb/hook] auto-promote Result failed:', e)
    }
  }
  // The form-facing field is "Logged By" (one-tap dropdown) — the legacy
  // "Technician" LongText column stays in place for the existing 20K rows
  // and any downstream queries. Webhook bridges the two: whatever the tech
  // picked from Logged By, copy into Technician if Technician is empty.
  const loggedBy = String(r['Logged By'] || '').trim()
  let technician = String(r.Technician || '').trim()
  if (!technician && loggedBy) technician = loggedBy
  if (!technician) technician = 'Field tech'

  let locationsLinked: any[] = Array.isArray(r['Locations Visited']) ? r['Locations Visited'] : []
  let locationIds = locationsLinked.map((l: any) => Number(l?.Id)).filter(Boolean)

  // 1a. Auto-link the venue's Display Locations to "Locations Visited" if
  //     the tech didn't pick any (mirrors the Airtable behaviour Nick asked
  //     for: pick venue → all locations at that facility appear). Filters
  //     by venue NAME because NocoDB matches Link fields against the
  //     linked record's display title, not its row id.
  if (!locationIds.length && venueName && venueName !== 'Unknown venue') {
    try {
      const { records: locRows } = await NocoOps.listRecords(TABLES.displayLocations, {
        where: `(Venue,eq,${venueName})`,
        fields: 'Id,Name',
        limit: 200,
      })
      const autoLocIds = locRows.map((l: any) => Number(l.Id)).filter(Boolean)
      if (autoLocIds.length) {
        await NocoOps.addLinks(TABLES.walkthroughLog, WALK_COLS.locationsVisitedLink, id, autoLocIds)
        locationIds = autoLocIds
        locationsLinked = locRows.map((l: any) => ({ Id: Number(l.Id), Name: String(l.Name || '') }))
      }
    } catch (e) {
      console.warn('[walkthroughs/nocodb/hook] auto-link locations failed:', e)
    }
  }

  // 1b. If Result = "Open Issue Observed" and the tech hasn't linked any
  //     Problem Detected entries, auto-link every currently-open issue at
  //     this venue. Mirrors the Airtable workflow where the issues list
  //     populates inline. Tech can deselect any in NocoDB after the fact.
  const problemDetectedLinked: any[] = Array.isArray(r['Problem Detected']) ? r['Problem Detected'] : []
  if (
    result === 'Open Issue Observed'
    && problemDetectedLinked.length === 0
    && venueName
    && venueName !== 'Unknown venue'
  ) {
    try {
      const { records: openIssues } = await NocoOps.listRecords(TABLES.issues, {
        viewId: ISSUES_VIEWS.openIssues,
        where: `(Venue,eq,${venueName})`,
        fields: 'Id,Issue ID',
        limit: 200,
      })
      const issueIds = openIssues.map((i: any) => Number(i.Id)).filter(Boolean)
      if (issueIds.length) {
        await NocoOps.addLinks(TABLES.walkthroughLog, WALK_COLS.problemDetectedLink, id, issueIds)
      }
    } catch (e) {
      console.warn('[walkthroughs/nocodb/hook] auto-link open issues failed:', e)
    }
  }

  const dt = r['Log Date Dt'] || r['Log Date'] || new Date().toISOString()
  const when = new Date(dt)

  const log_id = r['Log ID']
    || `${when.toISOString().slice(2, 10)} [${venueAbbr || 'venue'}]`

  // 2. Open ticket if New Issue Detected (idempotent — skip if comments
  //    already reference a ticket number).
  let ticket_number: number | null = null
  if (result === 'New Issue Detected' && !/Linked ticket: #\d+/.test(comments)) {
    try {
      // Match dashboard venues by exact name first, then by either side
      // containing the other (handles "Moynihan" ↔ "Moynihan Station"
      // mismatches between NocoDB and the dashboard's local venues table).
      // Skip the substring path if the name is too short — protects against
      // matches like "PST" hitting too many rows.
      const venueLookup = await query(
        `SELECT id, name FROM venues
         WHERE LOWER(name) = LOWER($1)
            OR ($2::int >= 4 AND LOWER(name) LIKE '%' || LOWER($1) || '%')
            OR ($2::int >= 4 AND LOWER($1) LIKE '%' || LOWER(name) || '%')
         ORDER BY CASE WHEN LOWER(name) = LOWER($1) THEN 0 ELSE 1 END,
                  LENGTH(name) ASC
         LIMIT 1`,
        [venueName, venueName.length]
      )
      const dashboardVenueId = venueLookup.rows[0]?.id
      if (dashboardVenueId) {
        const techLookup = await query(
          `SELECT id FROM staff WHERE LOWER(full_name) = LOWER($1) OR LOWER(email) = LOWER($1) LIMIT 1`,
          [technician]
        )
        const createdBy = techLookup.rows[0]?.id || '7fb556c3-5d2d-430a-b3dc-42f58d79be33' // ANC Bot fallback
        const titleSeed = failedChecklist.length
          ? `${venueName} — ${failedChecklist.join(' / ')}`
          : (comments.split('\n')[0] || `Walkthrough finding — ${venueName}`)
        const title = titleSeed.length > 120 ? titleSeed.slice(0, 117) + '…' : titleSeed
        const description = [
          `Auto-generated from walkthrough log entry "${log_id}".`,
          failedChecklist.length ? `\nFailed checks: ${failedChecklist.join(', ')}` : '',
          comments ? `\nTech notes:\n${comments}` : '',
          `\nReported by: ${technician}`,
          `\nWalkthrough record id: ${id} (NocoDB Walkthrough Log).`,
        ].filter(Boolean).join('\n')

        const inserted = await query(
          `INSERT INTO tickets (venue_id, created_by, title, description, priority, status, category, source, ticket_type)
           VALUES ($1, $2, $3, $4, 'high', 'new', 'general', 'walkthrough', 'support')
           RETURNING ticket_number`,
          [dashboardVenueId, createdBy, title, description]
        )
        ticket_number = inserted.rows[0]?.ticket_number || null
      }
    } catch (e) {
      console.warn('[walkthroughs/nocodb/hook] ticket creation failed:', e)
    }
  }

  // 3. Generate the PDF and attach it (alongside any existing attachments).
  let pdfAttached = false
  if (Browserless.configured()) {
    try {
      // Best-effort: pull the displays for the linked locations so the PDF
      // can show the asset list (no per-asset findings on the native form
      // path — that's the dashboard form's domain).
      const locationGroups: Array<{ name: string; findings: any[] }> = []
      if (locationIds.length) {
        const { records: locs } = await NocoOps.listRecords(TABLES.displayLocations, {
          where: `(Id,in,${locationIds.join(',')})`,
          limit: 200,
        })
        const idToName = new Map<number, string>()
        for (const l of locs) idToName.set(Number((l as any).Id), String((l as any).Name || `Location #${(l as any).Id}`))

        // NocoDB Link filters match by linked-record title, not id — chain
        // an `~or` of `(Display Location,eq,<Name>)` over each location.
        const locNames = Array.from(idToName.values()).filter(Boolean)
        const dispWhere = locNames.map((n) => `(Display Location,eq,${n})`).join('~or')
        const { records: dRows } = dispWhere
          ? await NocoOps.listRecords(TABLES.displays, { where: dispWhere, limit: 500 })
          : { records: [] as any[] }
        const byLoc = new Map<number, any[]>()
        for (const d of dRows) {
          const did = Number((d as any).Id)
          const dname = String((d as any)['Display Name'] || (d as any)['Nick Name'] || `Display #${did}`)
          const dlArr = (d as any)['Display Location']
          const loc = Array.isArray(dlArr) && dlArr[0]?.Id ? Number(dlArr[0].Id) : 0
          if (!byLoc.has(loc)) byLoc.set(loc, [])
          // Native-form path has no per-dimension data — render with no
          // problems flagged (post-5/14 flip: `false` = no problem on
          // that dimension, `true` = problem flagged).
          byLoc.get(loc)!.push({
            display_id: did, display_name: dname,
            image_quality: false, av_rotation: false,
            physical_damage: false, pixel_outages: false, cleanliness: false,
          })
        }
        for (const lid of locationIds) {
          locationGroups.push({ name: idToName.get(lid) || `Location #${lid}`, findings: byLoc.get(lid) || [] })
        }
      }

      const html = buildWalkthroughHtml({
        log_id,
        technician,
        venue_name: venueName,
        date_label: when.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }),
        time_label: when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
        type,
        result: result || 'No Action Required',
        comments,
        ticket_number,
        locations: locationGroups,
      })
      const pdf = await Browserless.renderPdf({ html, options: { format: 'Letter', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } } })
      const safeVenue = (venueName || 'venue').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40)
      const filename = `Walkthrough_${safeVenue}_${log_id.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`
      const uploaded = await NocoOps.uploadFile({
        filename,
        contentType: 'application/pdf',
        body: pdf,
        pathHint: 'walkthroughs',
      })
      if (uploaded.length) {
        const prior = Array.isArray(r.Attachments) ? r.Attachments : []
        await NocoOps.updateRecords(TABLES.walkthroughLog, [{ Id: id, Attachments: [...prior, ...uploaded] }])
        pdfAttached = true
      }
    } catch (e) {
      console.warn('[walkthroughs/nocodb/hook] PDF gen / attach failed:', e)
    }
  }

  // 4. Patch the comments with the ticket number for two-way trace, plus
  //    backfill any missing date fields.
  const patch: Record<string, unknown> = { Id: id }
  let needsPatch = false
  if (ticket_number) {
    patch['Comments (log issues above)'] = `${comments}\n\nLinked ticket: #${String(ticket_number).padStart(5, '0')}`.trim()
    needsPatch = true
  }
  if (!r['Log Date'] || !r['Log Date Dt']) {
    const iso = (r['Log Date Dt'] ? new Date(r['Log Date Dt']) : new Date()).toISOString()
    patch['Log Date'] = iso
    patch['Log Date Dt'] = iso.replace('T', ' ').replace(/\.\d+Z$/, '+00:00')
    needsPatch = true
  }
  // Mirror "Logged By" → legacy "Technician" so existing reports/queries
  // that read Technician keep working without rewrites.
  if (loggedBy && !String(r.Technician || '').trim()) {
    patch['Technician'] = loggedBy
    needsPatch = true
  }
  if (needsPatch) {
    await NocoOps.updateRecords(TABLES.walkthroughLog, [patch as any]).catch((e) =>
      console.warn('[walkthroughs/nocodb/hook] post-process patch failed:', e)
    )
  }

  return { ok: true, id, ticket_number, pdf_attached: pdfAttached }
}
