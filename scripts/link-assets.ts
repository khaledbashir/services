/**
 * Backfill the asset links on serviceTicket, maintenanceLog, walkthroughLog.
 *
 * Strategy:
 *   1. Build (airtable display-recId → Twenty inventoryAsset id) map from ALL
 *      bases, by matching Display Name.
 *   2. Build (airtable display-location recId → Twenty displayLocation id) map.
 *   3. For each Airtable issue/maintenance/walkthrough, look up its linked
 *      displays/locations and UPDATE the corresponding Twenty row.
 *
 * Runs inside a node container on the easypanel-abc network so it can talk
 * to abc_twenty-db directly.
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

async function main() {
  const client = new Client(DB_CONFIG)
  await client.connect()
  console.log('Connected.')

  // ---------- Build lookup maps ----------
  const assetsByName = new Map<string, string>()
  for (const r of (await client.query(`SELECT id, name FROM ${WS}."_inventoryAsset" WHERE "deletedAt" IS NULL AND name IS NOT NULL`)).rows) {
    assetsByName.set(r.name.trim(), r.id)
  }
  console.log(`Loaded ${assetsByName.size} Twenty displays by name`)

  const dlByName = new Map<string, string>()
  for (const r of (await client.query(`SELECT id, name FROM ${WS}."_displayLocation" WHERE "deletedAt" IS NULL AND name IS NOT NULL`)).rows) {
    dlByName.set(r.name.trim(), r.id)
  }
  console.log(`Loaded ${dlByName.size} Twenty display locations by name`)

  const files = fs.readdirSync(EXPORT_DIR).filter((f) => f.endsWith('.json'))

  // Per-base: airtable recId → Display Name / DL Name
  const atDisplayName = new Map<string, string>()
  const atDlName = new Map<string, string>()
  for (const file of files) {
    const baseFile = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, file), 'utf8'))
    for (const d of baseFile.tables.Displays || []) {
      const name = String(d.fields?.['Display Name'] || d.fields?.['Nick Name'] || '').trim()
      if (name) atDisplayName.set(d.id, name)
    }
    for (const dl of baseFile.tables['Display Locations'] || []) {
      const name = String(dl.fields?.['Name'] || dl.fields?.['Location Abbreviation'] || '').trim()
      if (name) atDlName.set(dl.id, name)
    }
  }
  console.log(`Airtable: ${atDisplayName.size} displays, ${atDlName.size} display locations indexed`)

  function atIdToAssetId(atId: string): string | null {
    const name = atDisplayName.get(atId)
    if (!name) return null
    return assetsByName.get(name) || null
  }
  function atIdToDlId(atId: string): string | null {
    const name = atDlName.get(atId)
    if (!name) return null
    return dlByName.get(name) || null
  }

  // ---------- Backfill ----------
  let stLinked = 0, mlLinked = 0, wlLinked = 0

  for (const file of files) {
    const baseFile = JSON.parse(fs.readFileSync(path.join(EXPORT_DIR, file), 'utf8'))
    const baseName = baseFile.name

    // Tickets → ticketAsset
    for (const isu of baseFile.tables.Issues || []) {
      const ticketNumber = String(isu.fields?.['Issue ID'] || isu.fields?.['Autonumber'] || isu.id)
      const affected = isu.fields?.['Affected Displays']
      if (!Array.isArray(affected) || affected.length === 0) continue
      const assetId = atIdToAssetId(affected[0])
      if (!assetId) continue
      const r = await client.query(
        `UPDATE ${WS}."_serviceTicket" SET "ticketAssetId" = $2
         WHERE "ticketNumber" = $1 AND "deletedAt" IS NULL AND "ticketAssetId" IS NULL`,
        [ticketNumber, assetId]
      )
      stLinked += r.rowCount || 0
    }

    // Maintenance → maintenanceAsset (field already exists but we may not have populated)
    for (const ev of baseFile.tables['Maintenance Events'] || []) {
      const name = String(ev.fields?.['Name'] || '').slice(0, 200).trim()
      const disp = ev.fields?.['Displays']
      if (!Array.isArray(disp) || disp.length === 0 || !name) continue
      const assetId = atIdToAssetId(disp[0])
      if (!assetId) continue
      const r = await client.query(
        `UPDATE ${WS}."_maintenanceLog" SET "maintenanceAssetId" = $2
         WHERE name LIKE $1 AND "deletedAt" IS NULL AND "maintenanceAssetId" IS NULL`,
        [`${name}%`, assetId]
      )
      mlLinked += r.rowCount || 0
    }

    // Walkthrough → walkLocation (first Locations Visited)
    for (const w of baseFile.tables['Walkthrough Log'] || []) {
      const name = String(w.fields?.['Log ID'] || '').trim()
      const locs = w.fields?.['Locations Visited']
      if (!Array.isArray(locs) || locs.length === 0 || !name) continue
      const dlId = atIdToDlId(locs[0])
      if (!dlId) continue
      const r = await client.query(
        `UPDATE ${WS}."_walkthroughLog" SET "walkLocationId" = $2
         WHERE name = $1 AND "deletedAt" IS NULL AND "walkLocationId" IS NULL`,
        [name, dlId]
      )
      wlLinked += r.rowCount || 0
    }

    console.log(`[${baseName}] running totals — tickets=${stLinked} maintenance=${mlLinked} walks=${wlLinked}`)
  }

  console.log(`\n✅ Done.`)
  console.log(`   serviceTicket.ticketAssetId set on:    ${stLinked}`)
  console.log(`   maintenanceLog.maintenanceAssetId set: ${mlLinked}`)
  console.log(`   walkthroughLog.walkLocationId set:     ${wlLinked}`)
  await client.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
