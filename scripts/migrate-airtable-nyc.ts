/**
 * Full NYC Airtable base → Twenty CRM migration.
 *
 * Bases/tables imported:
 *   Venues (20)              → core.venue           (match existing or create)
 *   Displays (337)           → core.inventoryAsset
 *   Walkthrough Log (20446)  → core.walkthroughLog
 *   Issues (925)             → core.serviceTicket
 *   Maintenance Events (231) → core.maintenanceLog
 *
 * Strategy:
 *   - Idempotent-ish: stores airtable record id in a notes/searchable field
 *     so a re-run can skip existing records. First version just skips dedupe
 *     and trusts the operator to only run once.
 *   - Rate-limited: 200ms between writes to stay polite to Twenty.
 *   - Logs progress every 25 records.
 *
 * Usage:
 *   TWENTY_API_KEY=... npx tsx scripts/migrate-airtable-nyc.ts [--stage=venues|displays|walkthrough|issues|maintenance|all]
 */

import fs from 'node:fs'

const BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const KEY = process.env.TWENTY_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA'
const NYC_FILE = '/root/anc-services/airtable-export/records/appDn6nC8yRvdJHT2_New York.json'

const stage = process.argv.find((a) => a.startsWith('--stage='))?.split('=')[1] || 'all'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function twentyRequest(method: string, path: string, body?: unknown, _retry = 0): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: any
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (res.status === 429 && _retry < 6) {
    // Rate limit — back off and retry. Twenty limit = 100 requests / 60 s.
    await wait(15_000)
    return twentyRequest(method, path, body, _retry + 1)
  }
  if (!res.ok) {
    throw new Error(`Twenty ${method} ${path}: ${res.status} — ${text.slice(0, 300)}`)
  }
  return data
}

// --- Load all Twenty venues for name-matching ---
async function loadTwentyVenues(): Promise<Array<{ id: string; name: string; market: string | null }>> {
  const out: any[] = []
  let cursor: string | null = null
  for (let i = 0; i < 20; i++) {
    const url = `/rest/venues?limit=60${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`
    const r = await twentyRequest('GET', url)
    out.push(...r.data.venues)
    if (!r.pageInfo?.hasNextPage) break
    cursor = r.pageInfo.endCursor
  }
  return out
}

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// --- Stage: Venues ---
async function migrateVenues(twVenues: any[]): Promise<Record<string, string>> {
  const nyc = JSON.parse(fs.readFileSync(NYC_FILE, 'utf8'))
  const atVenues = nyc.tables.Venues
  const byNorm = new Map<string, any>()
  for (const v of twVenues) byNorm.set(norm(v.name), v)

  const map: Record<string, string> = {}
  let matched = 0, created = 0, skipped = 0

  for (const v of atVenues) {
    const atName = String(v.fields?.['Venue Name'] || '').trim()
    if (!atName) { skipped++; continue }
    let hit = byNorm.get(norm(atName))
    if (!hit) {
      // partial match — useful for "Tin Building" vs "TIN Building" etc.
      for (const [k, tw] of byNorm) {
        if (k.length > 3 && atName.length > 3 && (k.includes(norm(atName)) || norm(atName).includes(k))) {
          hit = tw
          break
        }
      }
    }
    if (hit) {
      map[v.id] = hit.id
      matched++
    } else {
      // Create a new Twenty venue
      try {
        const res = await twentyRequest('POST', '/rest/venues', { name: atName })
        const createdV = res?.data?.createVenue
        if (createdV?.id) {
          map[v.id] = createdV.id
          byNorm.set(norm(atName), createdV)
          created++
          console.log(`  + created venue: ${atName}`)
        }
      } catch (e: any) {
        console.log(`  ! venue create failed (${atName}): ${e.message}`)
      }
      await wait(200)
    }
  }
  console.log(`Venues — matched: ${matched}, created: ${created}, skipped: ${skipped}`)
  fs.writeFileSync('/tmp/venue_map.json', JSON.stringify(map, null, 2))
  return map
}

// Load the set of display names already in Twenty so we can skip on rerun.
async function loadExistingInventoryNames(): Promise<Set<string>> {
  const names = new Set<string>()
  let cursor: string | null = null
  for (let i = 0; i < 40; i++) {
    const url = `/rest/inventoryAssets?limit=60${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`
    const r = await twentyRequest('GET', url)
    for (const a of r.data.inventoryAssets) {
      if (a.name) names.add(a.name.trim())
    }
    if (!r.pageInfo?.hasNextPage) break
    cursor = r.pageInfo.endCursor
    await wait(650)
  }
  return names
}

// --- Stage: Displays → inventoryAsset ---
async function migrateDisplays(venueMap: Record<string, string>) {
  const nyc = JSON.parse(fs.readFileSync(NYC_FILE, 'utf8'))
  const displays = nyc.tables.Displays
  const existing = await loadExistingInventoryNames()
  console.log(`Importing ${displays.length} displays (skipping ${existing.size} already in Twenty)...`)

  let ok = 0, failed = 0, skipped = 0
  for (let i = 0; i < displays.length; i++) {
    const d = displays[i]
    const f = d.fields || {}
    const atVenueId = Array.isArray(f.Venue) ? f.Venue[0] : null
    const twVenueId = atVenueId ? venueMap[atVenueId] : null

    const name = String(f['Display Name'] || f['Nick Name'] || 'Untitled Display').slice(0, 255).trim()
    if (existing.has(name)) { skipped++; continue }

    const payload: Record<string, unknown> = {
      name,
      partName: f['Nick Name'] || name,
      modelName: f.Model || undefined,
      manufacturer: f.Make || undefined,
      screenNumber: f['Screen Number'] ? String(f['Screen Number']) : undefined,
      ipAddress: f['LCD IP Address'] || undefined,
      resolution: f.Resolution || undefined,
      displayType: f.Type === 'LCD' ? 'LCD' : f.Type === 'LED' ? 'LED' : f.Type === 'Projection' ? 'PROJECTION' : 'OTHER',
      orientation: f.Orientation === 'Portrait' ? 'PORTRAIT' : f.Orientation === 'Landscape' ? 'LANDSCAPE' : undefined,
      ownershipGroup: Array.isArray(f.Ownership) && f.Ownership[0] === 'Amtrak' ? 'OTHER' : (Array.isArray(f.Ownership) && f.Ownership[0] === 'Cushman & Wakefield' ? 'CUSHMAN_WAKEFIELD' : 'OTHER'),
      installPhase: f['Moynihan Phase#'] === 'P1' ? 'PHASE_1' : f['Moynihan Phase#'] === 'P2' ? 'PHASE_2' : f['Moynihan Phase#'] === 'P3' ? 'PHASE_3' : undefined,
    }
    if (twVenueId) payload.assetVenueId = twVenueId
    // Strip undefineds
    for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k]

    try {
      await twentyRequest('POST', '/rest/inventoryAssets', payload)
      ok++
      existing.add(name) // prevent dup within the same run
    } catch (e: any) {
      failed++
      if (failed <= 3) console.log(`  ! display ${i}: ${e.message.slice(0, 200)}`)
    }
    if ((i + 1) % 25 === 0) console.log(`  [${i + 1}/${displays.length}] ok=${ok} fail=${failed} skip=${skipped}`)
    // ~90 per minute — stays under Twenty's 100-token limit with headroom
    await wait(650)
  }
  console.log(`Displays — ok: ${ok}, failed: ${failed}, skipped: ${skipped}`)
}

// --- Stage: Issues → serviceTicket ---
async function migrateIssues(venueMap: Record<string, string>, displayMap: Map<string, string>) {
  const nyc = JSON.parse(fs.readFileSync(NYC_FILE, 'utf8'))
  const issues = nyc.tables.Issues
  const existing = new Set<string>()
  // Use Issue ID in ticketNumber to dedupe
  let cursor: string | null = null
  for (let i = 0; i < 40; i++) {
    const url = `/rest/serviceTickets?limit=60${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`
    const r = await twentyRequest('GET', url)
    for (const t of r.data.serviceTickets) if (t.ticketNumber) existing.add(String(t.ticketNumber))
    if (!r.pageInfo?.hasNextPage) break
    cursor = r.pageInfo.endCursor
    await wait(650)
  }
  console.log(`Importing ${issues.length} issues (skipping ${existing.size} already in Twenty)...`)

  let ok = 0, failed = 0, skipped = 0
  for (let i = 0; i < issues.length; i++) {
    const isu = issues[i]
    const f = isu.fields || {}
    const ticketNumber = String(f['Issue ID'] || f['Autonumber'] || isu.id)
    if (existing.has(ticketNumber)) { skipped++; continue }

    const priorityMap: Record<string, string> = { High: 'PRIORITY_HIGH', Medium: 'PRIORITY_MEDIUM', Low: 'PRIORITY_LOW', Critical: 'PRIORITY_CRITICAL' }
    const payload: Record<string, unknown> = {
      name: String(f['Issue Summary'] || f['Observed State'] || `Issue ${ticketNumber}`).slice(0, 255),
      ticketNumber,
      description: String(f['Details'] || f['Issue Summary'] || '').slice(0, 5000),
      priority: priorityMap[String(f['Priority'] || '')] || 'PRIORITY_MEDIUM',
      ticketStatus: f['Closed Date'] ? 'TICKET_CLOSED' : 'TICKET_OPEN',
      category: 'CAT_HARDWARE', // Airtable "Observed State" is free-text — default all to hardware, user can reclassify in Twenty
      submitterName: String(f['Created By'] || '').slice(0, 255),
      assignedToName: String(f['Assign to'] || '').slice(0, 255),
      resolutionNotes: String(f['ANC Action'] || '').slice(0, 5000),
    }
    for (const k of Object.keys(payload)) if (!payload[k]) delete payload[k]

    try {
      await twentyRequest('POST', '/rest/serviceTickets', payload)
      ok++
      existing.add(ticketNumber)
    } catch (e: any) {
      failed++
      if (failed <= 3) console.log(`  ! issue ${i}: ${e.message.slice(0, 200)}`)
    }
    if ((i + 1) % 25 === 0) console.log(`  [${i + 1}/${issues.length}] ok=${ok} fail=${failed} skip=${skipped}`)
    await wait(650)
  }
  console.log(`Issues — ok: ${ok}, failed: ${failed}, skipped: ${skipped}`)
}

// --- Stage: Maintenance Events → maintenanceLog ---
async function migrateMaintenance(venueMap: Record<string, string>) {
  const nyc = JSON.parse(fs.readFileSync(NYC_FILE, 'utf8'))
  const events = nyc.tables['Maintenance Events']
  const existing = new Set<string>()
  let cursor: string | null = null
  for (let i = 0; i < 40; i++) {
    const url = `/rest/maintenanceLogs?limit=60${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`
    const r = await twentyRequest('GET', url)
    for (const t of r.data.maintenanceLogs) if (t.name) existing.add(t.name.trim())
    if (!r.pageInfo?.hasNextPage) break
    cursor = r.pageInfo.endCursor
    await wait(650)
  }
  console.log(`Importing ${events.length} maintenance events (skipping ${existing.size})...`)

  const typeMap: Record<string, string> = {
    Cleaning: 'CLEANING', Replacement: 'REPLACEMENT', 'Hardware Removal': 'HARDWARE_REMOVAL',
    'Power Supply': 'POWER_SUPPLY', 'LED Project Build': 'LED_PROJECT_BUILD', Software: 'SOFTWARE',
  }
  let ok = 0, failed = 0, skipped = 0
  for (let i = 0; i < events.length; i++) {
    const ev = events[i]
    const f = ev.fields || {}
    const name = String(f['Name'] || `Maintenance ${ev.id}`).slice(0, 255).trim()
    if (existing.has(name)) { skipped++; continue }

    const atVenue = Array.isArray(f['Venue']) ? f['Venue'][0] : null
    const twVenue = atVenue ? venueMap[atVenue] : null
    const payload: Record<string, unknown> = {
      name,
      maintenanceType: typeMap[String(f['Maintenance Type'] || '')] || 'OTHER',
      scheduledDate: f['Scheduled Date'] || undefined,
      issueSummary: { blocknote: null, markdown: String(f['Scope of Work'] || '').slice(0, 5000) },
      status: f['Status'] === 'Completed' ? 'STATUS_RESOLVED' : f['Status'] === 'In Progress' ? 'STATUS_IN_PROGRESS' : 'STATUS_OPEN',
    }
    if (twVenue) payload.maintenanceVenueId = twVenue
    for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k]

    try {
      await twentyRequest('POST', '/rest/maintenanceLogs', payload)
      ok++
      existing.add(name)
    } catch (e: any) {
      failed++
      if (failed <= 3) console.log(`  ! maint ${i}: ${e.message.slice(0, 200)}`)
    }
    if ((i + 1) % 25 === 0) console.log(`  [${i + 1}/${events.length}] ok=${ok} fail=${failed} skip=${skipped}`)
    await wait(650)
  }
  console.log(`Maintenance — ok: ${ok}, failed: ${failed}, skipped: ${skipped}`)
}

// --- Stage: Walkthrough Log → walkthroughLog ---
async function migrateWalkthrough() {
  const nyc = JSON.parse(fs.readFileSync(NYC_FILE, 'utf8'))
  const logs = nyc.tables['Walkthrough Log']
  const existing = new Set<string>()
  let cursor: string | null = null
  for (let i = 0; i < 200; i++) {
    const url = `/rest/walkthroughLogs?limit=60${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`
    const r = await twentyRequest('GET', url)
    for (const t of r.data.walkthroughLogs) if (t.name) existing.add(t.name.trim())
    if (!r.pageInfo?.hasNextPage) break
    cursor = r.pageInfo.endCursor
    await wait(650)
  }
  console.log(`Importing ${logs.length} walkthrough logs (skipping ${existing.size} already in)...`)

  let ok = 0, failed = 0, skipped = 0
  for (let i = 0; i < logs.length; i++) {
    const w = logs[i]
    const f = w.fields || {}
    const name = String(f['Log ID'] || `Walk ${w.id}`).slice(0, 255).trim()
    if (existing.has(name)) { skipped++; continue }
    const payload: Record<string, unknown> = {
      name,
      logDate: f['Log Date'] || undefined,
      logTime: f['Log Time'] || undefined,
      result: f['Result'] === 'Good' ? 'RESULT_GOOD' : f['Result'] === 'Problem Detected' ? 'RESULT_PROBLEM' : undefined,
      issuesFound: f['Problem Detected'] ? String(f['Problem Detected']).slice(0, 2000) : undefined,
      notes: f['Comments (log issues above)'] ? { blocknote: null, markdown: String(f['Comments (log issues above)']).slice(0, 5000) } : undefined,
      inPerson: true,
    }
    for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k]

    try {
      await twentyRequest('POST', '/rest/walkthroughLogs', payload)
      ok++
      existing.add(name)
    } catch (e: any) {
      failed++
      if (failed <= 3) console.log(`  ! walk ${i}: ${e.message.slice(0, 200)}`)
    }
    if ((i + 1) % 100 === 0) console.log(`  [${i + 1}/${logs.length}] ok=${ok} fail=${failed} skip=${skipped}`)
    await wait(650)
  }
  console.log(`Walkthrough — ok: ${ok}, failed: ${failed}, skipped: ${skipped}`)
}

// --- Main ---
;(async () => {
  console.log('=== Loading Twenty venues ===')
  const twVenues = await loadTwentyVenues()
  console.log(`Loaded ${twVenues.length} Twenty venues`)

  let venueMap: Record<string, string> = {}
  if (fs.existsSync('/tmp/venue_map.json')) {
    venueMap = JSON.parse(fs.readFileSync('/tmp/venue_map.json', 'utf8'))
    console.log(`Loaded cached venue map (${Object.keys(venueMap).length} entries)`)
  }

  if (stage === 'venues' || stage === 'all') {
    console.log('\n=== Stage: Venues ===')
    venueMap = await migrateVenues(twVenues)
  }
  if (stage === 'displays' || stage === 'all') {
    console.log('\n=== Stage: Displays ===')
    if (Object.keys(venueMap).length === 0) {
      const twV = await loadTwentyVenues()
      venueMap = await migrateVenues(twV)
    }
    await migrateDisplays(venueMap)
  }
  if (stage === 'issues' || stage === 'all') {
    console.log('\n=== Stage: Issues ===')
    await migrateIssues(venueMap, new Map())
  }
  if (stage === 'maintenance' || stage === 'all') {
    console.log('\n=== Stage: Maintenance Events ===')
    await migrateMaintenance(venueMap)
  }
  if (stage === 'walkthrough' || stage === 'all') {
    console.log('\n=== Stage: Walkthrough Log ===')
    await migrateWalkthrough()
  }
})().catch((e) => { console.error(e); process.exit(1) })
