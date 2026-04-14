/**
 * Backfill the new Twenty columns onto records that were already migrated.
 *
 * For each Airtable record we can match (by name / ticketNumber / logId),
 * UPDATE the corresponding Twenty row with the columns that didn't exist
 * during the first pass:
 *
 *   inventoryAsset: photoUrl, renderName, physicalDimensions, locationCode, threeLetterCode
 *   serviceTicket:  observedState, playerName, dateReported, closedDate
 *   maintenanceLog: escortInformation, techsScheduled, scheduledEndTime
 *   walkthroughLog: threeLetterCode, locationsVisited, technicianName
 *
 * Only UPDATEs — never INSERTs. Safe to rerun.
 *
 * Runs from inside a Docker container attached to the easypanel-abc network
 * so it can reach abc_twenty-db directly.
 */
import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'

const EXPORT_DIR = process.env.EXPORT_DIR || '/work/airtable-export/records'
const WS = 'workspace_cjspnkm8glh7iooo1gep8c1qo'

const DB_CONFIG = {
  host: 'abc_twenty-db',
  port: 5432,
  user: 'postgres',
  password: 'dad2b4d5746daa8baa11',
  database: 'abc',
}

function firstStr(v: unknown): string | null {
  if (v == null) return null
  if (Array.isArray(v)) return v.length > 0 ? String(v[0]).slice(0, 500) : null
  return String(v).slice(0, 500)
}

function asDate(v: unknown): string | null {
  if (!v) return null
  const s = String(v)
  return s.slice(0, 10) || null
}

async function main() {
  const client = new Client(DB_CONFIG)
  await client.connect()
  console.log('Connected.')

  const files = fs.readdirSync(EXPORT_DIR).filter((f) => f.endsWith('.json'))
  let iaUpdated = 0, stUpdated = 0, mlUpdated = 0, wlUpdated = 0

  for (const file of files) {
    const baseFile = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, file), 'utf8'))
    const baseName = baseFile.name
    console.log(`\n========== ${baseName} ==========`)

    // --- Displays ---
    for (const d of baseFile.tables.Displays || []) {
      const f = d.fields || {}
      const name = String(f['Display Name'] || f['Nick Name'] || `Display ${d.id}`).slice(0, 255).trim()
      const photoUrl = Array.isArray(f.Image) && f.Image[0]?.url ? String(f.Image[0].url).slice(0, 2000) : null
      const renderName = firstStr(f['Render Name'])
      const physical = firstStr(f['Physical Dimensions'])
      const locCode = firstStr(f['Location Code'])
      const threeLC = firstStr(f['Three Letter Code'])
      if (!photoUrl && !renderName && !physical && !locCode && !threeLC) continue
      const r = await client.query(
        `UPDATE ${WS}."_inventoryAsset"
         SET "photoUrl" = COALESCE("photoUrl", $2),
             "renderName" = COALESCE("renderName", $3),
             "physicalDimensions" = COALESCE("physicalDimensions", $4),
             "locationCode" = COALESCE("locationCode", $5),
             "threeLetterCode" = COALESCE("threeLetterCode", $6)
         WHERE name = $1 AND "deletedAt" IS NULL
           AND ("photoUrl" IS NULL OR "renderName" IS NULL
                OR "physicalDimensions" IS NULL OR "locationCode" IS NULL
                OR "threeLetterCode" IS NULL)`,
        [name, photoUrl, renderName, physical, locCode, threeLC]
      )
      iaUpdated += r.rowCount || 0
    }

    // --- Issues → serviceTicket ---
    for (const isu of baseFile.tables.Issues || []) {
      const f = isu.fields || {}
      const ticketNumber = String(f['Issue ID'] || f['Autonumber'] || isu.id)
      const observedState = firstStr(f['Observed State'])
      const playerName = firstStr(f['Player Name'])
      const dateReported = asDate(f['Date Reported'])
      const closedDate = asDate(f['Closed Date'])
      if (!observedState && !playerName && !dateReported && !closedDate) continue
      const r = await client.query(
        `UPDATE ${WS}."_serviceTicket"
         SET "observedState" = COALESCE("observedState", $2),
             "playerName" = COALESCE("playerName", $3),
             "dateReported" = COALESCE("dateReported", $4::date),
             "closedDate" = COALESCE("closedDate", $5::date)
         WHERE "ticketNumber" = $1 AND "deletedAt" IS NULL`,
        [ticketNumber, observedState, playerName, dateReported, closedDate]
      )
      stUpdated += r.rowCount || 0
    }

    // --- Maintenance Events → maintenanceLog ---
    for (const ev of baseFile.tables['Maintenance Events'] || []) {
      const f = ev.fields || {}
      const name = String(f['Name'] || `Maint ${ev.id}`).slice(0, 200).trim()
      const escort = firstStr(f['Escort Information'])
      const techs = Array.isArray(f['Techs Scheduled']) ? f['Techs Scheduled'].join(', ').slice(0, 500) : firstStr(f['Techs Scheduled'])
      const endTime = firstStr(f['Scheduled End Time'])
      if (!escort && !techs && !endTime) continue
      const r = await client.query(
        `UPDATE ${WS}."_maintenanceLog"
         SET "escortInformation" = COALESCE("escortInformation", $2),
             "techsScheduled" = COALESCE("techsScheduled", $3),
             "scheduledEndTime" = COALESCE("scheduledEndTime", $4)
         WHERE name LIKE $1 AND "deletedAt" IS NULL`,
        [`${name}%`, escort, techs, endTime]
      )
      mlUpdated += r.rowCount || 0
    }

    // --- Walkthrough Log ---
    for (const w of baseFile.tables['Walkthrough Log'] || []) {
      const f = w.fields || {}
      const name = String(f['Log ID'] || `Walk ${w.id}`).slice(0, 255).trim()
      const threeLC = firstStr(f['Three Letter Code'])
      const locs = Array.isArray(f['Locations Visited'])
        ? f['Locations Visited'].join(', ').slice(0, 500)
        : firstStr(f['Locations Visited'])
      const techRaw = f['Technician']
      const techName = (techRaw && typeof techRaw === 'object' && 'name' in techRaw)
        ? String(techRaw.name).slice(0, 200)
        : firstStr(techRaw)
      if (!threeLC && !locs && !techName) continue
      const r = await client.query(
        `UPDATE ${WS}."_walkthroughLog"
         SET "threeLetterCode" = COALESCE("threeLetterCode", $2),
             "locationsVisited" = COALESCE("locationsVisited", $3),
             "technicianName" = COALESCE("technicianName", $4)
         WHERE name = $1 AND "deletedAt" IS NULL`,
        [name, threeLC, locs, techName]
      )
      wlUpdated += r.rowCount || 0
    }

    console.log(`  [${baseName}] running totals — ia=${iaUpdated} st=${stUpdated} ml=${mlUpdated} wl=${wlUpdated}`)
  }

  console.log(`\n✅ Backfill complete:`)
  console.log(`   inventoryAsset rows updated: ${iaUpdated}`)
  console.log(`   serviceTicket rows updated:  ${stUpdated}`)
  console.log(`   maintenanceLog rows updated: ${mlUpdated}`)
  console.log(`   walkthroughLog rows updated: ${wlUpdated}`)
  await client.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
