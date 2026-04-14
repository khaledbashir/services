/**
 * Backfill the structural relations we just added:
 *   inventoryAsset.assetDisplayLocationId
 *   inventoryAsset.assetStationId
 *   rackDevice.deviceDisplayLocationId
 *   maintenanceLog.maintenanceStationId
 *   walkthroughLog.walkVenueId
 *
 * Source: the Airtable exports. We map Airtable record-ids through the name-
 * index we already built (inventoryAsset by name, displayLocation by name,
 * station by name, venue by name).
 */
import fs from 'node:fs'
import path from 'node:path'
import { Client } from 'pg'

const EXPORT_DIR = process.env.EXPORT_DIR || '/work/airtable-export/records'
const WS = 'workspace_cjspnkm8glh7iooo1gep8c1qo'
const DB_CONFIG = {
  host: 'abc_twenty-db', port: 5432,
  user: 'postgres', password: 'dad2b4d5746daa8baa11', database: 'abc',
}

async function main() {
  const client = new Client(DB_CONFIG)
  await client.connect()
  console.log('Connected.')

  const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

  // --- Twenty-side lookup tables ---
  const assetByName = new Map<string, string>()
  for (const r of (await client.query(`SELECT id, name FROM ${WS}."_inventoryAsset" WHERE "deletedAt" IS NULL AND name IS NOT NULL`)).rows) assetByName.set(r.name.trim(), r.id)
  const dlByName = new Map<string, string>()
  for (const r of (await client.query(`SELECT id, name FROM ${WS}."_displayLocation" WHERE "deletedAt" IS NULL AND name IS NOT NULL`)).rows) dlByName.set(r.name.trim(), r.id)
  const stationByName = new Map<string, string>()
  for (const r of (await client.query(`SELECT id, name FROM ${WS}."_station" WHERE "deletedAt" IS NULL AND name IS NOT NULL`)).rows) stationByName.set(r.name.trim(), r.id)
  const venueByNorm = new Map<string, string>()
  for (const r of (await client.query(`SELECT id, name FROM ${WS}."_venue" WHERE "deletedAt" IS NULL AND name IS NOT NULL`)).rows) venueByNorm.set(norm(r.name), r.id)
  console.log(`Twenty: ${assetByName.size} displays, ${dlByName.size} locations, ${stationByName.size} stations, ${venueByNorm.size} venues`)

  // --- Airtable indices ---
  const atDisplayName = new Map<string, string>()
  const atDlName = new Map<string, string>()
  const atStationName = new Map<string, string>()
  const atVenueName = new Map<string, string>()
  const files = fs.readdirSync(EXPORT_DIR).filter((f) => f.endsWith('.json'))
  for (const file of files) {
    const base = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, file), 'utf8'))
    for (const d of base.tables.Displays || []) {
      const n = String(d.fields?.['Display Name'] || d.fields?.['Nick Name'] || '').trim()
      if (n) atDisplayName.set(d.id, n)
    }
    for (const dl of base.tables['Display Locations'] || []) {
      const n = String(dl.fields?.['Name'] || dl.fields?.['Location Abbreviation'] || '').trim()
      if (n) atDlName.set(dl.id, n)
    }
    for (const s of base.tables.Stations || []) {
      const n = String(s.fields?.['Name'] || s.fields?.['Station Name'] || '').trim()
      if (n) atStationName.set(s.id, n)
    }
    for (const v of (base.tables.Venues || base.tables['Active Venues'] || [])) {
      const n = String(v.fields?.['Venue Name'] || v.fields?.['Name'] || '').trim()
      if (n) atVenueName.set(v.id, n)
    }
  }
  console.log(`Airtable: ${atDisplayName.size} displays, ${atDlName.size} locations, ${atStationName.size} stations, ${atVenueName.size} venues`)

  let iaDl = 0, iaSt = 0, rdDl = 0, mlSt = 0, wlVn = 0

  for (const file of files) {
    const base = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, file), 'utf8'))
    const baseName = base.name

    // inventoryAsset ← Display Location, Station
    for (const d of base.tables.Displays || []) {
      const name = String(d.fields?.['Display Name'] || d.fields?.['Nick Name'] || '').trim()
      if (!name) continue
      const twId = assetByName.get(name)
      if (!twId) continue
      const atDl = Array.isArray(d.fields?.['Display Location']) ? d.fields['Display Location'][0] : null
      const atSt = Array.isArray(d.fields?.['Station']) ? d.fields['Station'][0] : null
      const twDl = atDl ? dlByName.get(atDlName.get(atDl) || '') : null
      const twSt = atSt ? stationByName.get(atStationName.get(atSt) || '') : null
      if (twDl || twSt) {
        const r = await client.query(
          `UPDATE ${WS}."_inventoryAsset"
           SET "assetDisplayLocationId" = COALESCE("assetDisplayLocationId", $2),
               "assetStationId" = COALESCE("assetStationId", $3)
           WHERE id = $1
             AND ("assetDisplayLocationId" IS NULL OR "assetStationId" IS NULL)`,
          [twId, twDl || null, twSt || null]
        )
        iaDl += r.rowCount || 0
      }
    }

    // rackDevice ← Display Location
    for (const rd of (base.tables['Rack Devices'] || base.tables['IP Devices'] || base.tables['Devices'] || [])) {
      const name = String(rd.fields?.['Device Name'] || rd.fields?.['Nick Name'] || '').trim()
      if (!name) continue
      const atDl = Array.isArray(rd.fields?.['Display Location']) ? rd.fields['Display Location'][0]
        : Array.isArray(rd.fields?.['Locations']) ? rd.fields['Locations'][0] : null
      if (!atDl) continue
      const twDl = dlByName.get(atDlName.get(atDl) || '')
      if (!twDl) continue
      const r = await client.query(
        `UPDATE ${WS}."_rackDevice" SET "deviceDisplayLocationId" = $2
         WHERE name = $1 AND "deletedAt" IS NULL AND "deviceDisplayLocationId" IS NULL`,
        [name, twDl]
      )
      rdDl += r.rowCount || 0
    }

    // maintenanceLog ← Station
    for (const ev of base.tables['Maintenance Events'] || []) {
      const name = String(ev.fields?.['Name'] || '').slice(0, 200).trim()
      const atSt = Array.isArray(ev.fields?.['Stations']) ? ev.fields['Stations'][0] : null
      if (!name || !atSt) continue
      const twSt = stationByName.get(atStationName.get(atSt) || '')
      if (!twSt) continue
      const r = await client.query(
        `UPDATE ${WS}."_maintenanceLog" SET "maintenanceStationId" = $2
         WHERE name LIKE $1 AND "deletedAt" IS NULL AND "maintenanceStationId" IS NULL`,
        [`${name}%`, twSt]
      )
      mlSt += r.rowCount || 0
    }

    // walkthroughLog ← Venue (Airtable: "Venue" field, array of rec ids)
    for (const w of base.tables['Walkthrough Log'] || []) {
      const logName = String(w.fields?.['Log ID'] || '').trim()
      if (!logName) continue
      const atV = Array.isArray(w.fields?.['Venue']) ? w.fields['Venue'][0] : null
      if (!atV) continue
      const vName = atVenueName.get(atV)
      if (!vName) continue
      const twV = venueByNorm.get(norm(vName))
      if (!twV) continue
      const r = await client.query(
        `UPDATE ${WS}."_walkthroughLog" SET "walkVenueId" = $2
         WHERE name = $1 AND "deletedAt" IS NULL AND "walkVenueId" IS NULL`,
        [logName, twV]
      )
      wlVn += r.rowCount || 0
    }

    console.log(`[${baseName}] running — ia_loc=${iaDl} ia_station=${iaSt} rd_loc=${rdDl} maint_station=${mlSt} walk_venue=${wlVn}`)
  }

  console.log(`\n✅ Done.`)
  console.log(`   inventoryAsset.assetDisplayLocation/Station: ${iaDl}`)
  console.log(`   rackDevice.deviceDisplayLocation:            ${rdDl}`)
  console.log(`   maintenanceLog.maintenanceStation:           ${mlSt}`)
  console.log(`   walkthroughLog.walkVenue:                    ${wlVn}`)
  await client.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
