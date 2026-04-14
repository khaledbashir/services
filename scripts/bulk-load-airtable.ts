/**
 * BULK DIRECT-DB LOADER for Airtable → Twenty migration.
 *
 * Bypasses Twenty's REST API (100/min rate limit) and writes directly to the
 * workspace Postgres schema using batched INSERTs. ~1000× faster.
 *
 * Trade-offs vs REST:
 *   - Skips Twenty's server-side validators, triggers, and workflow hooks.
 *     searchVector is a GENERATED column so it still fills in automatically.
 *   - No attachment upload, no event timeline — but these are not populated
 *     by the REST path either for bulk migrations.
 *   - Safe because the destination schema's constraints are minimal
 *     (nullable fields, defaults for all system columns).
 *
 * Uses the same staged/dedupe model as migrate-airtable-nyc.ts: existing
 * names are pulled once; only new rows are inserted.
 *
 * Usage:
 *   npx tsx scripts/bulk-load-airtable.ts [--stage=walkthrough|issues|displays|maintenance]
 *                                          [--base=<name pattern>]
 */
import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'

const EXPORT_DIR = process.env.EXPORT_DIR || '/work/airtable-export/records'
const WS = 'workspace_cjspnkm8glh7iooo1gep8c1qo'

// Connection to Twenty's Postgres. Using the docker-swarm host name + service port.
// The abc_twenty-db service listens on 5432 inside the abc stack network.
const DB_CONFIG = {
  host: 'abc_twenty-db',
  port: 5432,
  user: 'postgres',
  password: 'dad2b4d5746daa8baa11',
  database: 'abc',
}

const argv = process.argv.slice(2)
const stage = argv.find((a) => a.startsWith('--stage='))?.split('=')[1] || 'all'
const baseFilter = argv.find((a) => a.startsWith('--base='))?.split('=')[1] || ''

async function main() {
  const client = new Client(DB_CONFIG)
  await client.connect()
  console.log('Connected to Twenty Postgres')

  // ---------- Venue mapping ----------
  const vRes = await client.query(`SELECT id, name FROM ${WS}."_venue" WHERE "deletedAt" IS NULL`)
  const twByNorm = new Map<string, { id: string; name: string }>()
  const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  for (const v of vRes.rows) twByNorm.set(norm(v.name), { id: v.id, name: v.name })
  console.log(`Loaded ${twByNorm.size} Twenty venues`)

  // Build a per-base airtable-venueId → Twenty-venueId map.
  async function venueMapFor(baseFile: any): Promise<Map<string, string>> {
    const atVenues = baseFile.tables.Venues || baseFile.tables['Active Venues'] || []
    const m = new Map<string, string>()
    for (const v of atVenues) {
      const atName = String(v.fields?.['Venue Name'] || v.fields?.['Name'] || '').trim()
      if (!atName) continue
      let hit = twByNorm.get(norm(atName))
      if (!hit) {
        // Partial match
        for (const [k, tw] of twByNorm) {
          if (k.length > 3 && norm(atName).length > 3 && (k.includes(norm(atName)) || norm(atName).includes(k))) {
            hit = tw
            break
          }
        }
      }
      if (!hit) {
        // Create new Twenty venue
        const id = (await client.query(
          `INSERT INTO ${WS}."_venue" (name) VALUES ($1) RETURNING id`,
          [atName.slice(0, 255)]
        )).rows[0].id
        hit = { id, name: atName }
        twByNorm.set(norm(atName), hit)
        console.log(`  + venue created: ${atName}`)
      }
      m.set(v.id, hit.id)
    }
    return m
  }

  // ---------- WALKTHROUGH LOG bulk insert ----------
  async function loadWalkthrough(baseName: string, logs: any[]) {
    if (logs.length === 0) return
    const existing = new Set<string>(
      (await client.query(`SELECT name FROM ${WS}."_walkthroughLog" WHERE "deletedAt" IS NULL AND name IS NOT NULL`)).rows.map((r) => r.name.trim())
    )
    console.log(`[${baseName}] Walkthrough: ${logs.length} incoming, ${existing.size} already in Twenty`)

    const toInsert: any[][] = []
    for (const w of logs) {
      const f = w.fields || {}
      const name = String(f['Log ID'] || `Walk ${w.id}`).slice(0, 255).trim()
      if (existing.has(name)) continue
      existing.add(name)
      const resultStr = String(f['Result'] || '')
      const resultVal = /good/i.test(resultStr) ? 'RESULT_GOOD'
        : /problem|issue|observ/i.test(resultStr) ? 'RESULT_PROBLEM'
        : /partial/i.test(resultStr) ? 'RESULT_PARTIAL' : null
      const logDate = f['Log Date'] ? String(f['Log Date']).slice(0, 10) : null
      const issuesRaw = Array.isArray(f['Problem Detected']) ? f['Problem Detected'].join(', ') : String(f['Problem Detected'] || '')
      const notesRaw = String(f['Comments (log issues above)'] || f['Notes'] || '')
      const inPerson = String(f['Type'] || '').toLowerCase().includes('in-person')
      toInsert.push([
        name,
        logDate,
        f['Log Time'] || null,
        resultVal,
        issuesRaw ? issuesRaw.slice(0, 5000) : null,
        notesRaw ? notesRaw.slice(0, 5000) : null,
        inPerson,
      ])
    }
    if (toInsert.length === 0) { console.log(`  nothing new to insert`); return }

    // Batch inserts — 500 rows per INSERT
    const BATCH = 500
    const cols = [`name`, `"logDate"`, `"logTime"`, `result`, `"issuesFoundMarkdown"`, `"notesMarkdown"`, `"inPerson"`]
    let inserted = 0
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const slice = toInsert.slice(i, i + BATCH)
      const values: string[] = []
      const params: any[] = []
      slice.forEach((row, idx) => {
        const base = idx * 7
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`)
        params.push(...row)
      })
      await client.query(
        `INSERT INTO ${WS}."_walkthroughLog" (${cols.join(',')}) VALUES ${values.join(',')}`,
        params
      )
      inserted += slice.length
      if (inserted % 2000 === 0 || inserted === toInsert.length) {
        console.log(`  inserted ${inserted}/${toInsert.length}`)
      }
    }
    console.log(`[${baseName}] Walkthrough ✓ ${inserted} new rows`)
  }

  // ---------- DISPLAYS bulk insert ----------
  async function loadDisplays(baseName: string, displays: any[], vMap: Map<string, string>) {
    if (displays.length === 0) return
    const existing = new Set<string>(
      (await client.query(`SELECT name FROM ${WS}."_inventoryAsset" WHERE "deletedAt" IS NULL`)).rows.map((r) => r.name?.trim()).filter(Boolean)
    )
    console.log(`[${baseName}] Displays: ${displays.length} incoming, ${existing.size} already in Twenty`)

    const rows: any[][] = []
    for (const d of displays) {
      const f = d.fields || {}
      const name = String(f['Display Name'] || f['Nick Name'] || `Display ${d.id}`).slice(0, 255).trim()
      if (existing.has(name)) continue
      existing.add(name)
      const atVenue = Array.isArray(f.Venue) ? f.Venue[0] : null
      const twVenueId = atVenue ? vMap.get(atVenue) || null : null
      const typeMap: Record<string, string> = { LCD: 'LCD', LED: 'LED', Projection: 'PROJECTION' }
      const orient = f.Orientation === 'Portrait' ? 'PORTRAIT' : f.Orientation === 'Landscape' ? 'LANDSCAPE' : null
      const owner = (Array.isArray(f.Ownership) && f.Ownership[0]) === 'Cushman & Wakefield' ? 'CUSHMAN_WAKEFIELD' : 'OTHER'
      const phase = f['Moynihan Phase#'] === 'P1' ? 'PHASE_1' : f['Moynihan Phase#'] === 'P2' ? 'PHASE_2' : f['Moynihan Phase#'] === 'P3' ? 'PHASE_3' : null
      rows.push([
        name,
        f['Nick Name'] || name,
        f.Model || null,
        f.Make || null,
        f['Screen Number'] ? String(f['Screen Number']) : null,
        f['LCD IP Address'] || f['IP Address'] || null,
        f.Resolution || null,
        typeMap[String(f.Type || '')] || 'OTHER',
        orient,
        owner,
        phase,
        twVenueId,
      ])
    }
    if (rows.length === 0) { console.log(`  nothing new`); return }
    const cols = [
      'name', '"partName"', '"modelName"', 'manufacturer', '"screenNumber"',
      '"ipAddress"', 'resolution', '"displayType"', 'orientation', '"ownershipGroup"',
      '"installPhase"', '"assetVenueId"',
    ]
    const BATCH = 300
    let inserted = 0
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH)
      const values: string[] = []
      const params: any[] = []
      slice.forEach((row, idx) => {
        const base = idx * 12
        values.push(`(${Array.from({ length: 12 }, (_, j) => `$${base + j + 1}`).join(',')})`)
        params.push(...row)
      })
      await client.query(`INSERT INTO ${WS}."_inventoryAsset" (${cols.join(',')}) VALUES ${values.join(',')}`, params)
      inserted += slice.length
    }
    console.log(`[${baseName}] Displays ✓ ${inserted}`)
  }

  // ---------- ISSUES bulk insert ----------
  async function loadIssues(baseName: string, issues: any[]) {
    if (issues.length === 0) return
    const existing = new Set<string>(
      (await client.query(`SELECT "ticketNumber" FROM ${WS}."_serviceTicket" WHERE "deletedAt" IS NULL AND "ticketNumber" IS NOT NULL`)).rows.map((r) => r.ticketNumber)
    )
    console.log(`[${baseName}] Issues: ${issues.length} incoming, ${existing.size} already in Twenty`)
    const priMap: Record<string, string> = { High: 'PRIORITY_HIGH', Medium: 'PRIORITY_MEDIUM', Low: 'PRIORITY_LOW', Critical: 'PRIORITY_CRITICAL' }
    const rows: any[][] = []
    for (const isu of issues) {
      const f = isu.fields || {}
      const ticketNumber = String(f['Issue ID'] || f['Autonumber'] || isu.id)
      if (existing.has(ticketNumber)) continue
      existing.add(ticketNumber)
      rows.push([
        String(f['Issue Summary'] || f['Observed State'] || f['Short Issue Description'] || `Issue ${ticketNumber}`).slice(0, 255),
        ticketNumber,
        String(f['Details'] || f['Issue Summary'] || '').slice(0, 5000),
        priMap[String(f['Priority'] || '')] || 'PRIORITY_MEDIUM',
        f['Closed Date'] ? 'TICKET_CLOSED' : 'TICKET_OPEN',
        'CAT_HARDWARE',
        String(f['Created By'] || '').slice(0, 255) || null,
        String(f['Assign to'] || '').slice(0, 255) || null,
        String(f['ANC Action'] || f['Action'] || '').slice(0, 5000) || null,
      ])
    }
    if (rows.length === 0) { console.log(`  nothing new`); return }
    const cols = ['name','"ticketNumber"','description','priority','"ticketStatus"','category','"submitterName"','"assignedToName"','"resolutionNotes"']
    const BATCH = 400
    let inserted = 0
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH)
      const values: string[] = []
      const params: any[] = []
      slice.forEach((row, idx) => {
        const base = idx * 9
        values.push(`(${Array.from({ length: 9 }, (_, j) => `$${base + j + 1}`).join(',')})`)
        params.push(...row)
      })
      await client.query(`INSERT INTO ${WS}."_serviceTicket" (${cols.join(',')}) VALUES ${values.join(',')}`, params)
      inserted += slice.length
    }
    console.log(`[${baseName}] Issues ✓ ${inserted}`)
  }

  // ---------- MAINTENANCE bulk insert ----------
  async function loadMaintenance(baseName: string, events: any[], vMap: Map<string, string>) {
    if (events.length === 0) return
    const existing = new Set<string>(
      (await client.query(`SELECT name FROM ${WS}."_maintenanceLog" WHERE "deletedAt" IS NULL AND name IS NOT NULL`)).rows.map((r) => r.name.trim())
    )
    console.log(`[${baseName}] Maintenance: ${events.length} incoming, ${existing.size} already in Twenty`)
    const typeMap: Record<string, string> = {
      Cleaning: 'CLEANING', Replacement: 'REPLACEMENT', 'Hardware Removal': 'HARDWARE_REMOVAL',
      'Power Supply': 'POWER_SUPPLY', 'LED Project Build': 'LED_PROJECT_BUILD', Software: 'SOFTWARE',
    }
    const rows: any[][] = []
    for (const ev of events) {
      const f = ev.fields || {}
      let name = String(f['Name'] || `Maint ${ev.id}`).slice(0, 200).trim()
      if (existing.has(name)) name = `${name} [${ev.id.slice(-6)}]`
      if (existing.has(name)) continue
      existing.add(name)
      const atV = Array.isArray(f['Venue']) ? f['Venue'][0] : null
      const twV = atV ? vMap.get(atV) || null : null
      rows.push([
        name,
        typeMap[String(f['Maintenance Type'] || '')] || 'OTHER',
        f['Scheduled Date'] || null,
        String(f['Scope of Work'] || '').slice(0, 5000) || null,
        f['Status'] === 'Completed' ? 'STATUS_RESOLVED' : f['Status'] === 'In Progress' ? 'STATUS_IN_PROGRESS' : 'STATUS_OPEN',
        twV,
      ])
    }
    if (rows.length === 0) { console.log(`  nothing new`); return }
    const cols = ['name','"maintenanceType"','"scheduledDate"','"issueSummaryMarkdown"','status','"maintenanceVenueId"']
    const BATCH = 300
    let inserted = 0
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH)
      const values: string[] = []
      const params: any[] = []
      slice.forEach((row, idx) => {
        const base = idx * 6
        values.push(`(${Array.from({ length: 6 }, (_, j) => `$${base + j + 1}`).join(',')})`)
        params.push(...row)
      })
      await client.query(`INSERT INTO ${WS}."_maintenanceLog" (${cols.join(',')}) VALUES ${values.join(',')}`, params)
      inserted += slice.length
    }
    console.log(`[${baseName}] Maintenance ✓ ${inserted}`)
  }

  // ---------- DISPLAY LOCATIONS ----------
  async function loadDisplayLocations(baseName: string, rows: any[], vMap: Map<string, string>): Promise<Map<string, string>> {
    const recMap = new Map<string, string>() // airtable dl id → twenty id
    if (rows.length === 0) return recMap
    const existing = new Map<string, string>(
      (await client.query(`SELECT id, name FROM ${WS}."_displayLocation" WHERE "deletedAt" IS NULL AND name IS NOT NULL`)).rows.map((r) => [r.name.trim(), r.id])
    )
    console.log(`[${baseName}] DisplayLocations: ${rows.length} incoming, ${existing.size} already in Twenty`)
    const toInsert: any[][] = []
    const atIdsOrder: string[] = []
    for (const dl of rows) {
      const f = dl.fields || {}
      const name = String(f['Name'] || f['Location Abbreviation'] || `DisplayLoc ${dl.id}`).slice(0, 255).trim()
      if (existing.has(name)) { recMap.set(dl.id, existing.get(name)!); continue }
      const atV = Array.isArray(f['Venue']) ? f['Venue'][0] : null
      const twV = atV ? vMap.get(atV) || null : null
      const photo = Array.isArray(f['Photo']) && f['Photo'][0]?.url ? String(f['Photo'][0].url).slice(0, 2000) : (Array.isArray(f['Map']) && f['Map'][0]?.url ? String(f['Map'][0].url).slice(0, 2000) : null)
      toInsert.push([
        name,
        Array.isArray(f['Three Letter Code']) ? f['Three Letter Code'][0] : f['Three Letter Code'] || null,
        f['Location Abbreviation'] || null,
        f['Install Type'] || null,
        photo,
        f['Notes'] || null,
        twV,
      ])
      atIdsOrder.push(dl.id)
    }
    if (toInsert.length === 0) return recMap
    const cols = ['name', '"threeLetterCode"', '"locationAbbreviation"', '"installType"', '"photoUrl"', 'notes', '"locationVenueId"']
    const BATCH = 300
    let inserted = 0
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const slice = toInsert.slice(i, i + BATCH)
      const atSlice = atIdsOrder.slice(i, i + BATCH)
      const values: string[] = []
      const params: any[] = []
      slice.forEach((row, idx) => {
        const base = idx * 7
        values.push(`(${Array.from({ length: 7 }, (_, j) => `$${base + j + 1}`).join(',')})`)
        params.push(...row)
      })
      const r = await client.query(
        `INSERT INTO ${WS}."_displayLocation" (${cols.join(',')}) VALUES ${values.join(',')} RETURNING id, name`,
        params
      )
      for (let k = 0; k < r.rows.length; k++) recMap.set(atSlice[k], r.rows[k].id)
      inserted += slice.length
    }
    console.log(`[${baseName}] DisplayLocations ✓ ${inserted}`)
    return recMap
  }

  // ---------- RACKS ----------
  async function loadRacks(baseName: string, rows: any[], vMap: Map<string, string>, dlMap: Map<string, string>): Promise<Map<string, string>> {
    const recMap = new Map<string, string>()
    if (rows.length === 0) return recMap
    const existing = new Map<string, string>(
      (await client.query(`SELECT id, name FROM ${WS}."_rack" WHERE "deletedAt" IS NULL AND name IS NOT NULL`)).rows.map((r) => [r.name.trim(), r.id])
    )
    console.log(`[${baseName}] Racks: ${rows.length} incoming, ${existing.size} already in Twenty`)
    const toInsert: any[][] = []
    const atIdsOrder: string[] = []
    for (const rk of rows) {
      const f = rk.fields || {}
      const name = String(f['Name'] || f['Rack #'] || `Rack ${rk.id}`).slice(0, 255).trim()
      if (existing.has(name)) { recMap.set(rk.id, existing.get(name)!); continue }
      const atV = Array.isArray(f['Venue']) ? f['Venue'][0] : null
      const twV = atV ? vMap.get(atV) || null : null
      const atDL = Array.isArray(f['Display Location']) ? f['Display Location'][0] : null
      const twDL = atDL ? dlMap.get(atDL) || null : null
      toInsert.push([
        name,
        f['Rack #'] ? String(f['Rack #']) : null,
        f['Rack Location'] || null,
        Array.isArray(f['Abbreviation (from Venue)']) ? f['Abbreviation (from Venue)'][0] : f['Abbreviation (from Venue)'] || null,
        twV,
        twDL,
      ])
      atIdsOrder.push(rk.id)
    }
    if (toInsert.length === 0) return recMap
    const cols = ['name', '"rackNumber"', '"rackLocation"', 'abbreviation', '"rackVenueId"', '"rackDisplayLocationId"']
    const BATCH = 300
    let inserted = 0
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const slice = toInsert.slice(i, i + BATCH)
      const atSlice = atIdsOrder.slice(i, i + BATCH)
      const values: string[] = []
      const params: any[] = []
      slice.forEach((row, idx) => {
        const base = idx * 6
        values.push(`(${Array.from({ length: 6 }, (_, j) => `$${base + j + 1}`).join(',')})`)
        params.push(...row)
      })
      const r = await client.query(
        `INSERT INTO ${WS}."_rack" (${cols.join(',')}) VALUES ${values.join(',')} RETURNING id, name`,
        params
      )
      for (let k = 0; k < r.rows.length; k++) recMap.set(atSlice[k], r.rows[k].id)
      inserted += slice.length
    }
    console.log(`[${baseName}] Racks ✓ ${inserted}`)
    return recMap
  }

  // ---------- RACK DEVICES ----------
  async function loadRackDevices(baseName: string, rows: any[], vMap: Map<string, string>, rackMap: Map<string, string>) {
    if (rows.length === 0) return
    const existing = new Set<string>(
      (await client.query(`SELECT name FROM ${WS}."_rackDevice" WHERE "deletedAt" IS NULL AND name IS NOT NULL`)).rows.map((r) => r.name.trim())
    )
    console.log(`[${baseName}] RackDevices: ${rows.length} incoming, ${existing.size} already in Twenty`)
    const toInsert: any[][] = []
    for (const rd of rows) {
      const f = rd.fields || {}
      const name = String(f['Device Name'] || f['Nick Name'] || `Device ${rd.id}`).slice(0, 255).trim()
      if (existing.has(name)) continue
      existing.add(name)
      const atR = Array.isArray(f['Rack']) ? f['Rack'][0] : null
      const twR = atR ? rackMap.get(atR) || null : null
      // Venue-from-Rack rollup
      const atV = Array.isArray(f['Abbreviation (from Venue) (from Rack)']) ? null : (Array.isArray(f['Venue']) ? f['Venue'][0] : null)
      const twV = atV ? vMap.get(atV) || null : null
      toInsert.push([
        name,
        f['Device Number'] ? String(f['Device Number']) : null,
        f['Device Type'] || null,
        f['Make'] || null,
        f['Model'] || null,
        f['IP Address'] || null,
        f['MAC Address'] || null,
        f['Serial Number'] || null,
        f['Notes'] || null,
        f['Backup?'] === true || String(f['Backup?']).toLowerCase() === 'yes',
        twR,
        twV,
      ])
    }
    if (toInsert.length === 0) { console.log(`  nothing new`); return }
    const cols = ['name', '"deviceNumber"', '"deviceType"', 'make', 'model', '"ipAddress"', '"macAddress"', '"serialNumber"', 'notes', 'backup', '"deviceRackId"', '"deviceVenueId"']
    const BATCH = 250
    let inserted = 0
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const slice = toInsert.slice(i, i + BATCH)
      const values: string[] = []
      const params: any[] = []
      slice.forEach((row, idx) => {
        const base = idx * 12
        values.push(`(${Array.from({ length: 12 }, (_, j) => `$${base + j + 1}`).join(',')})`)
        params.push(...row)
      })
      await client.query(`INSERT INTO ${WS}."_rackDevice" (${cols.join(',')}) VALUES ${values.join(',')}`, params)
      inserted += slice.length
    }
    console.log(`[${baseName}] RackDevices ✓ ${inserted}`)
  }

  // ---------- RMA EVENTS ----------
  async function loadRmaEvents(baseName: string, rows: any[]): Promise<Map<string, string>> {
    const recMap = new Map<string, string>()
    if (rows.length === 0) return recMap
    const existing = new Map<string, string>(
      (await client.query(`SELECT id, "rmaNumber" FROM ${WS}."_rmaEvent" WHERE "deletedAt" IS NULL AND "rmaNumber" IS NOT NULL`)).rows.map((r) => [r.rmaNumber, r.id])
    )
    console.log(`[${baseName}] RMA Events: ${rows.length} incoming, ${existing.size} already in Twenty`)
    const toInsert: any[][] = []
    const atIds: string[] = []
    for (const ev of rows) {
      const f = ev.fields || {}
      const num = String(f['ID'] || f['Name'] || ev.id)
      if (existing.has(num)) { recMap.set(ev.id, existing.get(num)!); continue }
      toInsert.push([
        String(f['Name'] || `RMA ${num}`).slice(0, 255),
        num,
        f['Ship Date'] ? String(f['Ship Date']).slice(0, 10) : null,
        f['Status'] || null,
        Number(f['#Shipped (LUs)']) || null,
      ])
      atIds.push(ev.id)
    }
    if (toInsert.length === 0) return recMap
    const cols = ['name', '"rmaNumber"', '"shipDate"', 'status', '"shippedCount"']
    const values: string[] = []
    const params: any[] = []
    toInsert.forEach((row, idx) => {
      const base = idx * 5
      values.push(`(${Array.from({ length: 5 }, (_, j) => `$${base + j + 1}`).join(',')})`)
      params.push(...row)
    })
    const r = await client.query(`INSERT INTO ${WS}."_rmaEvent" (${cols.join(',')}) VALUES ${values.join(',')} RETURNING id`, params)
    for (let k = 0; k < r.rows.length; k++) recMap.set(atIds[k], r.rows[k].id)
    console.log(`[${baseName}] RMA Events ✓ ${r.rows.length}`)
    return recMap
  }

  // ---------- SHIPPING CASES ----------
  async function loadShippingCases(baseName: string, rows: any[]): Promise<Map<string, string>> {
    const recMap = new Map<string, string>()
    if (rows.length === 0) return recMap
    const existing = new Map<string, string>(
      (await client.query(`SELECT id, "crateNumber" FROM ${WS}."_shippingCase" WHERE "deletedAt" IS NULL AND "crateNumber" IS NOT NULL`)).rows.map((r) => [r.crateNumber, r.id])
    )
    console.log(`[${baseName}] Shipping Cases: ${rows.length} incoming, ${existing.size} already in Twenty`)
    const toInsert: any[][] = []
    const atIds: string[] = []
    for (const sc of rows) {
      const f = sc.fields || {}
      const crateNum = String(f['Crate #'] || sc.id)
      if (existing.has(crateNum)) { recMap.set(sc.id, existing.get(crateNum)!); continue }
      const name = `Case ${crateNum}`
      const labelPhoto = Array.isArray(f['Label Photo']) && f['Label Photo'][0]?.url ? String(f['Label Photo'][0].url).slice(0, 2000) : null
      toInsert.push([
        name,
        crateNum,
        Array.isArray(f['Contents Type']) ? f['Contents Type'][0] : f['Contents Type'] || null,
        f['Packaging'] || null,
        Array.isArray(f['Project Code']) ? f['Project Code'][0] : f['Project Code'] || null,
        labelPhoto,
        Array.isArray(f['Last Location']) ? f['Last Location'][0] : f['Last Location'] || null,
        f['Crate Inventoried?'] === true || String(f['Crate Inventoried?']).toLowerCase() === 'yes',
        Number(f['Count (Frames)']) || null,
        Number(f['Count (Parts)']) || null,
      ])
      atIds.push(sc.id)
    }
    if (toInsert.length === 0) return recMap
    const cols = ['name', '"crateNumber"', '"contentsType"', 'packaging', '"projectCode"', '"labelPhotoUrl"', '"lastLocation"', '"crateInventoried"', '"countFrames"', '"countParts"']
    const BATCH = 200
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const slice = toInsert.slice(i, i + BATCH)
      const atSlice = atIds.slice(i, i + BATCH)
      const values: string[] = []; const params: any[] = []
      slice.forEach((row, idx) => {
        const base = idx * 10
        values.push(`(${Array.from({ length: 10 }, (_, j) => `$${base + j + 1}`).join(',')})`)
        params.push(...row)
      })
      const r = await client.query(`INSERT INTO ${WS}."_shippingCase" (${cols.join(',')}) VALUES ${values.join(',')} RETURNING id`, params)
      for (let k = 0; k < r.rows.length; k++) recMap.set(atSlice[k], r.rows[k].id)
    }
    console.log(`[${baseName}] Shipping Cases ✓ ${recMap.size - existing.size}`)
    return recMap
  }

  // ---------- FRAMES ----------
  async function loadFrames(baseName: string, rows: any[], caseMap: Map<string, string>) {
    if (rows.length === 0) return
    const existing = new Set<string>(
      (await client.query(`SELECT "serialNumber" FROM ${WS}."_frame" WHERE "deletedAt" IS NULL AND "serialNumber" IS NOT NULL`)).rows.map((r) => r.serialNumber)
    )
    console.log(`[${baseName}] Frames: ${rows.length} incoming, ${existing.size} already`)
    const toInsert: any[][] = []
    for (const fr of rows) {
      const f = fr.fields || {}
      const sn = String(f['SN'] || fr.id)
      if (existing.has(sn)) continue
      existing.add(sn)
      const atCase = Array.isArray(f['Shipping Case']) ? f['Shipping Case'][0] : null
      toInsert.push([
        `Frame ${sn}`,
        sn,
        atCase ? caseMap.get(atCase) || null : null,
      ])
    }
    if (toInsert.length === 0) { console.log(`  nothing new`); return }
    const cols = ['name', '"serialNumber"', '"frameCaseId"']
    const BATCH = 400
    let inserted = 0
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const slice = toInsert.slice(i, i + BATCH)
      const values: string[] = []; const params: any[] = []
      slice.forEach((row, idx) => {
        const base = idx * 3
        values.push(`($${base + 1},$${base + 2},$${base + 3})`)
        params.push(...row)
      })
      await client.query(`INSERT INTO ${WS}."_frame" (${cols.join(',')}) VALUES ${values.join(',')}`, params)
      inserted += slice.length
    }
    console.log(`[${baseName}] Frames ✓ ${inserted}`)
  }

  // ---------- LOAD UNITS ----------
  async function loadLoadUnits(baseName: string, rows: any[], rmaMap: Map<string, string>) {
    if (rows.length === 0) return
    const existing = new Set<string>(
      (await client.query(`SELECT "serialNumber" FROM ${WS}."_loadUnit" WHERE "deletedAt" IS NULL AND "serialNumber" IS NOT NULL`)).rows.map((r) => r.serialNumber)
    )
    console.log(`[${baseName}] Load Units: ${rows.length} incoming, ${existing.size} already`)
    const toInsert: any[][] = []
    for (const lu of rows) {
      const f = lu.fields || {}
      const sn = String(f['Serial Number'] || lu.id)
      if (existing.has(sn)) continue
      existing.add(sn)
      const atRma = Array.isArray(f['RMA Event']) ? f['RMA Event'][0] : null
      toInsert.push([
        `LU ${sn}`,
        sn,
        f['Part Number'] || null,
        f['Brand'] || null,
        Array.isArray(f['Fault']) ? f['Fault'].join(', ').slice(0, 500) : f['Fault'] || null,
        f['Returned'] === true || String(f['Returned']).toLowerCase() === 'yes',
        atRma ? rmaMap.get(atRma) || null : null,
      ])
    }
    if (toInsert.length === 0) { console.log(`  nothing new`); return }
    const cols = ['name', '"serialNumber"', '"partNumber"', 'brand', 'fault', 'returned', '"luRmaId"']
    const BATCH = 300
    let inserted = 0
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const slice = toInsert.slice(i, i + BATCH)
      const values: string[] = []; const params: any[] = []
      slice.forEach((row, idx) => {
        const base = idx * 7
        values.push(`(${Array.from({ length: 7 }, (_, j) => `$${base + j + 1}`).join(',')})`)
        params.push(...row)
      })
      await client.query(`INSERT INTO ${WS}."_loadUnit" (${cols.join(',')}) VALUES ${values.join(',')}`, params)
      inserted += slice.length
    }
    console.log(`[${baseName}] Load Units ✓ ${inserted}`)
  }

  // ---------- LCD UNITS ----------
  async function loadLcdUnits(baseName: string, rows: any[]) {
    if (rows.length === 0) return
    const existing = new Set<string>(
      (await client.query(`SELECT "serialNumber" FROM ${WS}."_lcdUnit" WHERE "deletedAt" IS NULL AND "serialNumber" IS NOT NULL`)).rows.map((r) => r.serialNumber)
    )
    console.log(`[${baseName}] LCD Units: ${rows.length} incoming, ${existing.size} already`)
    const toInsert: any[][] = []
    for (const l of rows) {
      const f = l.fields || {}
      const sn = String(f['SN'] || l.id)
      if (existing.has(sn)) continue
      existing.add(sn)
      toInsert.push([`LCD ${sn}`, sn, Array.isArray(f['Current Use']) ? f['Current Use'][0] : f['Current Use'] || null])
    }
    if (toInsert.length === 0) { console.log(`  nothing new`); return }
    const BATCH = 300
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const slice = toInsert.slice(i, i + BATCH)
      const values: string[] = []; const params: any[] = []
      slice.forEach((row, idx) => {
        const base = idx * 3
        values.push(`($${base + 1},$${base + 2},$${base + 3})`)
        params.push(...row)
      })
      await client.query(`INSERT INTO ${WS}."_lcdUnit" (name, "serialNumber", "currentUse") VALUES ${values.join(',')}`, params)
    }
    console.log(`[${baseName}] LCD Units ✓ ${toInsert.length}`)
  }

  // ---------- STATIONS ----------
  async function loadStations(baseName: string, rows: any[], vMap: Map<string, string>) {
    if (rows.length === 0) return
    const existing = new Set<string>(
      (await client.query(`SELECT name FROM ${WS}."_station" WHERE "deletedAt" IS NULL AND name IS NOT NULL`)).rows.map((r) => r.name.trim())
    )
    console.log(`[${baseName}] Stations: ${rows.length} incoming, ${existing.size} already`)
    const toInsert: any[][] = []
    for (const s of rows) {
      const f = s.fields || {}
      const name = String(f['Name'] || f['Station Name'] || `Station ${s.id}`).slice(0, 255).trim()
      if (existing.has(name)) continue
      existing.add(name)
      const atV = Array.isArray(f['Venue']) ? f['Venue'][0] : null
      toInsert.push([
        name,
        f['Primary Station Code'] || f['Station Code'] || null,
        Array.isArray(f['Line']) ? f['Line'].join(', ') : f['Line'] || null,
        atV ? vMap.get(atV) || null : null,
      ])
    }
    if (toInsert.length === 0) { console.log(`  nothing new`); return }
    const BATCH = 200
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const slice = toInsert.slice(i, i + BATCH)
      const values: string[] = []; const params: any[] = []
      slice.forEach((row, idx) => {
        const base = idx * 4
        values.push(`(${Array.from({ length: 4 }, (_, j) => `$${base + j + 1}`).join(',')})`)
        params.push(...row)
      })
      await client.query(`INSERT INTO ${WS}."_station" (name, "stationCode", "stationLine", "stationVenueId") VALUES ${values.join(',')}`, params)
    }
    console.log(`[${baseName}] Stations ✓ ${toInsert.length}`)
  }

  // ---------- Iterate bases ----------
  const files = fs.readdirSync(EXPORT_DIR).filter((f) => f.endsWith('.json'))
  for (const file of files) {
    if (baseFilter && !file.toLowerCase().includes(baseFilter.toLowerCase())) continue
    const baseFile = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, file), 'utf8'))
    const baseName = baseFile.name
    console.log(`\n========== ${baseName} ==========`)

    const vMap = await venueMapFor(baseFile)
    console.log(`  venue map entries: ${vMap.size}`)

    if ((stage === 'all' || stage === 'displays') && baseFile.tables.Displays) {
      await loadDisplays(baseName, baseFile.tables.Displays, vMap)
    }
    if ((stage === 'all' || stage === 'issues') && baseFile.tables.Issues) {
      await loadIssues(baseName, baseFile.tables.Issues)
    }
    if ((stage === 'all' || stage === 'maintenance') && baseFile.tables['Maintenance Events']) {
      await loadMaintenance(baseName, baseFile.tables['Maintenance Events'], vMap)
    }
    if ((stage === 'all' || stage === 'walkthrough') && baseFile.tables['Walkthrough Log']) {
      await loadWalkthrough(baseName, baseFile.tables['Walkthrough Log'])
    }
    let dlMap = new Map<string, string>()
    let rackMap = new Map<string, string>()
    if (stage === 'all' || stage === 'infra') {
      if (baseFile.tables['Display Locations']) {
        dlMap = await loadDisplayLocations(baseName, baseFile.tables['Display Locations'], vMap)
      }
      if (baseFile.tables['Racks']) {
        rackMap = await loadRacks(baseName, baseFile.tables['Racks'], vMap, dlMap)
      }
      if (baseFile.tables['Rack Devices'] || baseFile.tables['IP Devices'] || baseFile.tables['Devices']) {
        const devTable = baseFile.tables['Rack Devices'] || baseFile.tables['IP Devices'] || baseFile.tables['Devices']
        await loadRackDevices(baseName, devTable, vMap, rackMap)
      }
    }
    if (stage === 'all' || stage === 'wmata') {
      const rmaMap = baseFile.tables['RMA Event']
        ? await loadRmaEvents(baseName, baseFile.tables['RMA Event'])
        : new Map<string, string>()
      const caseMap = baseFile.tables['Shipping Cases']
        ? await loadShippingCases(baseName, baseFile.tables['Shipping Cases'])
        : new Map<string, string>()
      if (baseFile.tables['Frames']) await loadFrames(baseName, baseFile.tables['Frames'], caseMap)
      if (baseFile.tables['LUs']) await loadLoadUnits(baseName, baseFile.tables['LUs'], rmaMap)
      if (baseFile.tables['LCD']) await loadLcdUnits(baseName, baseFile.tables['LCD'])
      if (baseFile.tables['Stations']) await loadStations(baseName, baseFile.tables['Stations'], vMap)
    }
  }

  await client.end()
  console.log(`\n✅ Done`)
}

main().catch((e) => { console.error(e); process.exit(1) })
