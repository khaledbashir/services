/**
 * Generic Airtable → Twenty CRM migration.
 *
 * Walks every exported Airtable base in /root/anc-services/airtable-export/records/
 * and imports:
 *   - Venues (name-match or create)
 *   - Displays → core.inventoryAsset
 *   - Issues → core.serviceTicket
 *   - Maintenance Events → core.maintenanceLog
 *   - Walkthrough Log → core.walkthroughLog
 *
 * Designed to be resumable: dedupes on record name / ticketNumber / log id,
 * so a re-run picks up where it left off. Rate-limits to 90 req/min to stay
 * under Twenty's 100/60s limit.
 *
 * Usage:
 *   npx tsx scripts/migrate-airtable-all.ts [--stage=all|venues|displays|issues|maintenance|walkthrough]
 *                                           [--base=<base-name-pattern>]
 */
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const KEY = process.env.TWENTY_API_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA'
const EXPORT_DIR = '/root/anc-services/airtable-export/records'

const argv = process.argv.slice(2)
const stage = argv.find((a) => a.startsWith('--stage='))?.split('=')[1] || 'all'
const baseFilter = argv.find((a) => a.startsWith('--base='))?.split('=')[1] || ''

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
const PACE_MS = 670 // ~89/min

async function twentyReq(method: string, path: string, body?: unknown, retry = 0): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let data: any; try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (res.status === 429 && retry < 6) {
    await wait(15_000)
    return twentyReq(method, path, body, retry + 1)
  }
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} — ${text.slice(0, 300)}`)
  return data
}

async function fetchAllPages(plural: string, nameField = 'name'): Promise<Set<string>> {
  const set = new Set<string>()
  let cursor: string | null = null
  for (let i = 0; i < 400; i++) {
    const url = `/rest/${plural}?limit=60${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`
    const r = await twentyReq('GET', url)
    const arr = r.data?.[plural] || []
    for (const x of arr) if (x[nameField]) set.add(String(x[nameField]).trim())
    if (!r.pageInfo?.hasNextPage) break
    cursor = r.pageInfo.endCursor
    await wait(PACE_MS)
  }
  return set
}

const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

// ---------- Venue mapping (shared across all bases) ----------
async function loadTwentyVenueMap(): Promise<Map<string, { id: string; name: string }>> {
  const byNorm = new Map<string, { id: string; name: string }>()
  let cursor: string | null = null
  for (let i = 0; i < 20; i++) {
    const url = `/rest/venues?limit=60${cursor ? `&starting_after=${encodeURIComponent(cursor)}` : ''}`
    const r = await twentyReq('GET', url)
    for (const v of r.data.venues) byNorm.set(norm(v.name), { id: v.id, name: v.name })
    if (!r.pageInfo?.hasNextPage) break
    cursor = r.pageInfo.endCursor
    await wait(PACE_MS)
  }
  return byNorm
}

async function ensureVenue(
  atName: string,
  twByNorm: Map<string, { id: string; name: string }>
): Promise<string | null> {
  if (!atName) return null
  const n = norm(atName)
  let hit = twByNorm.get(n)
  if (!hit) {
    for (const [k, v] of twByNorm) {
      if (k.length > 3 && n.length > 3 && (k.includes(n) || n.includes(k))) { hit = v; break }
    }
  }
  if (hit) return hit.id
  // Create
  try {
    const r = await twentyReq('POST', '/rest/venues', { name: atName.slice(0, 255) })
    const created = r?.data?.createVenue
    if (created?.id) {
      twByNorm.set(norm(atName), { id: created.id, name: atName })
      console.log(`  + venue created: ${atName}`)
      await wait(PACE_MS)
      return created.id
    }
  } catch (e: any) {
    console.log(`  ! venue create failed (${atName}): ${e.message.slice(0, 120)}`)
  }
  return null
}

// Per-base venue record id map (airtable recId → Twenty venue id)
async function buildVenueRecordMap(
  baseFile: any,
  twByNorm: Map<string, { id: string; name: string }>
): Promise<Map<string, string>> {
  const atVenues = baseFile.tables.Venues || baseFile.tables['Active Venues'] || []
  const m = new Map<string, string>()
  for (const v of atVenues) {
    const n = v.fields?.['Venue Name'] || v.fields?.['Name']
    if (!n) continue
    const id = await ensureVenue(String(n).trim(), twByNorm)
    if (id) m.set(v.id, id)
  }
  return m
}

// ---------- Display import ----------
async function importDisplays(baseName: string, displays: any[], venueMap: Map<string, string>, existing: Set<string>) {
  console.log(`[${baseName}] Importing ${displays.length} displays (skipping ${existing.size} existing)...`)
  let ok = 0, fail = 0, skip = 0
  for (let i = 0; i < displays.length; i++) {
    const f = displays[i].fields || {}
    const name = String(f['Display Name'] || f['Nick Name'] || `Display ${displays[i].id}`).slice(0, 255).trim()
    if (existing.has(name)) { skip++; continue }
    const atVenueId = Array.isArray(f.Venue) ? f.Venue[0] : null
    const twVenueId = atVenueId ? venueMap.get(atVenueId) : null

    const payload: Record<string, unknown> = {
      name,
      partName: f['Nick Name'] || name,
      modelName: f.Model || undefined,
      manufacturer: f.Make || undefined,
      screenNumber: f['Screen Number'] ? String(f['Screen Number']) : undefined,
      ipAddress: f['LCD IP Address'] || f['IP Address'] || undefined,
      resolution: f.Resolution || undefined,
      displayType: f.Type === 'LCD' ? 'LCD' : f.Type === 'LED' ? 'LED' : f.Type === 'Projection' ? 'PROJECTION' : 'OTHER',
      orientation: f.Orientation === 'Portrait' ? 'PORTRAIT' : f.Orientation === 'Landscape' ? 'LANDSCAPE' : undefined,
      ownershipGroup: Array.isArray(f.Ownership) && f.Ownership[0] === 'Cushman & Wakefield' ? 'CUSHMAN_WAKEFIELD' : 'OTHER',
      installPhase: f['Moynihan Phase#'] === 'P1' ? 'PHASE_1' : f['Moynihan Phase#'] === 'P2' ? 'PHASE_2' : f['Moynihan Phase#'] === 'P3' ? 'PHASE_3' : undefined,
    }
    if (twVenueId) payload.assetVenueId = twVenueId
    for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k]
    try {
      await twentyReq('POST', '/rest/inventoryAssets', payload)
      ok++; existing.add(name)
    } catch (e: any) {
      fail++
      if (fail <= 2) console.log(`  ! display ${i}: ${e.message.slice(0, 150)}`)
    }
    if ((i + 1) % 50 === 0) console.log(`  [${baseName}] ${i + 1}/${displays.length} ok=${ok} fail=${fail} skip=${skip}`)
    await wait(PACE_MS)
  }
  console.log(`[${baseName}] Displays — ok: ${ok}, fail: ${fail}, skip: ${skip}`)
}

// ---------- Issues import ----------
async function importIssues(baseName: string, issues: any[], existing: Set<string>) {
  console.log(`[${baseName}] Importing ${issues.length} issues (skipping ${existing.size})...`)
  const priorityMap: Record<string, string> = { High: 'PRIORITY_HIGH', Medium: 'PRIORITY_MEDIUM', Low: 'PRIORITY_LOW', Critical: 'PRIORITY_CRITICAL' }
  let ok = 0, fail = 0, skip = 0
  for (let i = 0; i < issues.length; i++) {
    const f = issues[i].fields || {}
    const ticketNumber = String(f['Issue ID'] || f['Autonumber'] || issues[i].id)
    if (existing.has(ticketNumber)) { skip++; continue }
    const payload: Record<string, unknown> = {
      name: String(f['Issue Summary'] || f['Observed State'] || f['Short Issue Description'] || `Issue ${ticketNumber}`).slice(0, 255),
      ticketNumber,
      description: String(f['Details'] || f['Issue Summary'] || '').slice(0, 5000),
      priority: priorityMap[String(f['Priority'] || '')] || 'PRIORITY_MEDIUM',
      ticketStatus: f['Closed Date'] ? 'TICKET_CLOSED' : 'TICKET_OPEN',
      category: 'CAT_HARDWARE',
      submitterName: String(f['Created By'] || '').slice(0, 255),
      assignedToName: String(f['Assign to'] || '').slice(0, 255),
      resolutionNotes: String(f['ANC Action'] || f['Action'] || '').slice(0, 5000),
    }
    for (const k of Object.keys(payload)) if (!payload[k]) delete payload[k]
    try {
      await twentyReq('POST', '/rest/serviceTickets', payload)
      ok++; existing.add(ticketNumber)
    } catch (e: any) {
      fail++
      if (fail <= 2) console.log(`  ! issue ${i}: ${e.message.slice(0, 150)}`)
    }
    if ((i + 1) % 50 === 0) console.log(`  [${baseName}] ${i + 1}/${issues.length} ok=${ok} fail=${fail} skip=${skip}`)
    await wait(PACE_MS)
  }
  console.log(`[${baseName}] Issues — ok: ${ok}, fail: ${fail}, skip: ${skip}`)
}

// ---------- Maintenance import ----------
async function importMaintenance(baseName: string, events: any[], venueMap: Map<string, string>, existing: Set<string>) {
  console.log(`[${baseName}] Importing ${events.length} maintenance events (skipping ${existing.size})...`)
  const typeMap: Record<string, string> = {
    Cleaning: 'CLEANING', Replacement: 'REPLACEMENT', 'Hardware Removal': 'HARDWARE_REMOVAL',
    'Power Supply': 'POWER_SUPPLY', 'LED Project Build': 'LED_PROJECT_BUILD', Software: 'SOFTWARE',
  }
  let ok = 0, fail = 0, skip = 0
  for (let i = 0; i < events.length; i++) {
    const f = events[i].fields || {}
    // Use a unique name — append record id if base name is generic
    let name = String(f['Name'] || `Maint ${events[i].id}`).slice(0, 200).trim()
    if (existing.has(name)) name = `${name} [${events[i].id.slice(-6)}]`
    if (existing.has(name)) { skip++; continue }
    const atVenue = Array.isArray(f['Venue']) ? f['Venue'][0] : null
    const twVenue = atVenue ? venueMap.get(atVenue) : null
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
      await twentyReq('POST', '/rest/maintenanceLogs', payload)
      ok++; existing.add(name)
    } catch (e: any) {
      fail++
      if (fail <= 2) console.log(`  ! maint ${i}: ${e.message.slice(0, 150)}`)
    }
    if ((i + 1) % 25 === 0) console.log(`  [${baseName}] ${i + 1}/${events.length} ok=${ok} fail=${fail} skip=${skip}`)
    await wait(PACE_MS)
  }
  console.log(`[${baseName}] Maintenance — ok: ${ok}, fail: ${fail}, skip: ${skip}`)
}

// ---------- Walkthrough import ----------
async function importWalkthrough(baseName: string, logs: any[], existing: Set<string>) {
  console.log(`[${baseName}] Importing ${logs.length} walkthrough logs (skipping ${existing.size})...`)
  let ok = 0, fail = 0, skip = 0
  for (let i = 0; i < logs.length; i++) {
    const f = logs[i].fields || {}
    const name = String(f['Log ID'] || `Walk ${logs[i].id}`).slice(0, 255).trim()
    if (existing.has(name)) { skip++; continue }
    const resultStr = String(f['Result'] || '')
    const resultVal = /good/i.test(resultStr) ? 'RESULT_GOOD'
      : /problem|issue|observ/i.test(resultStr) ? 'RESULT_PROBLEM'
      : /partial/i.test(resultStr) ? 'RESULT_PARTIAL' : undefined
    const logDateIso = f['Log Date'] ? String(f['Log Date']).slice(0, 10) : undefined
    const issuesRaw = Array.isArray(f['Problem Detected']) ? f['Problem Detected'].join(', ') : String(f['Problem Detected'] || '')
    const notesRaw = String(f['Comments (log issues above)'] || f['Notes'] || '')
    const payload: Record<string, unknown> = {
      name,
      logDate: logDateIso,
      logTime: f['Log Time'] || undefined,
      result: resultVal,
      issuesFound: issuesRaw ? { blocknote: null, markdown: issuesRaw.slice(0, 5000) } : undefined,
      notes: notesRaw ? { blocknote: null, markdown: notesRaw.slice(0, 5000) } : undefined,
      inPerson: String(f['Type'] || '').toLowerCase().includes('in-person'),
    }
    for (const k of Object.keys(payload)) if (payload[k] === undefined) delete payload[k]
    try {
      await twentyReq('POST', '/rest/walkthroughLogs', payload)
      ok++; existing.add(name)
    } catch (e: any) {
      fail++
      if (fail <= 2) console.log(`  ! walk ${i}: ${e.message.slice(0, 150)}`)
    }
    if ((i + 1) % 100 === 0) console.log(`  [${baseName}] ${i + 1}/${logs.length} ok=${ok} fail=${fail} skip=${skip}`)
    await wait(PACE_MS)
  }
  console.log(`[${baseName}] Walkthrough — ok: ${ok}, fail: ${fail}, skip: ${skip}`)
}

// ---------- Main loop ----------
;(async () => {
  const files = fs.readdirSync(EXPORT_DIR).filter((f) => f.endsWith('.json'))
  console.log(`=== Loading Twenty venues ===`)
  const twVenueMap = await loadTwentyVenueMap()
  console.log(`Loaded ${twVenueMap.size} Twenty venues`)

  console.log(`=== Preloading existing Twenty counts ===`)
  let existingDisplays: Set<string> | null = null
  let existingIssues: Set<string> | null = null
  let existingMaint: Set<string> | null = null
  let existingWalk: Set<string> | null = null
  if (stage === 'all' || stage === 'displays') existingDisplays = await fetchAllPages('inventoryAssets')
  if (stage === 'all' || stage === 'issues') existingIssues = await fetchAllPages('serviceTickets', 'ticketNumber')
  if (stage === 'all' || stage === 'maintenance') existingMaint = await fetchAllPages('maintenanceLogs')
  if (stage === 'all' || stage === 'walkthrough') existingWalk = await fetchAllPages('walkthroughLogs')

  for (const file of files) {
    if (baseFilter && !file.toLowerCase().includes(baseFilter.toLowerCase())) continue
    const baseFile = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, file), 'utf8'))
    const baseName = baseFile.name
    console.log(`\n========== ${baseName} ==========`)

    const venueRecMap = await buildVenueRecordMap(baseFile, twVenueMap)
    console.log(`  venue map entries: ${venueRecMap.size}`)

    if ((stage === 'all' || stage === 'displays') && baseFile.tables.Displays) {
      await importDisplays(baseName, baseFile.tables.Displays, venueRecMap, existingDisplays!)
    }
    if ((stage === 'all' || stage === 'issues') && baseFile.tables.Issues) {
      await importIssues(baseName, baseFile.tables.Issues, existingIssues!)
    }
    if ((stage === 'all' || stage === 'maintenance') && baseFile.tables['Maintenance Events']) {
      await importMaintenance(baseName, baseFile.tables['Maintenance Events'], venueRecMap, existingMaint!)
    }
    if ((stage === 'all' || stage === 'walkthrough') && baseFile.tables['Walkthrough Log']) {
      await importWalkthrough(baseName, baseFile.tables['Walkthrough Log'], existingWalk!)
    }
  }

  console.log(`\n✅ Done.`)
})().catch((e) => { console.error(e); process.exit(1) })
