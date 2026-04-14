/**
 * Fix the 1,274 WMATA displays that imported with placeholder names
 * like "Display rec02qy8CozHrqDL7".
 *
 * The ANC Service - WMATA base has its own field naming convention:
 *   `Display Name` is null
 *   `Name (no alerts)` holds the real name
 *
 * UPDATE Twenty's inventoryAsset.name using a mapping built from the Airtable
 * record id (stored in partName during import as "Display <recid>").
 */
import fs from 'node:fs'
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

  // Build airtable rec-id → real name
  const renames = new Map<string, { name: string; stationRec?: string | null }>()
  const file = fs.readdirSync(EXPORT_DIR).find((f) => f.includes('ANC Service - WMATA'))
  if (!file) { console.log('no WMATA base file'); return }
  const base = JSON.parse(fs.readFileSync(`${EXPORT_DIR}/${file}`, 'utf8'))

  for (const d of base.tables.Displays || []) {
    const realName = d.fields?.['Name (no alerts)'] || d.fields?.['Display Name'] || null
    if (!realName) continue
    const stationRec = Array.isArray(d.fields?.['Station']) ? d.fields['Station'][0] : null
    renames.set(d.id, { name: String(realName).slice(0, 255).trim(), stationRec })
  }
  console.log(`Airtable WMATA: ${renames.size} displays with real names`)

  // Build station id → Twenty station id from the SAME base
  const atStationName = new Map<string, string>()
  for (const s of base.tables.Stations || []) {
    const n = String(s.fields?.['Station Name'] || s.fields?.['Name'] || '').trim()
    if (n) atStationName.set(s.id, n)
  }
  const twStationByName = new Map<string, string>()
  for (const r of (await client.query(`SELECT id, name FROM ${WS}."_station" WHERE "deletedAt" IS NULL`)).rows) twStationByName.set(r.name.trim(), r.id)

  // UPDATE name + station
  let renamed = 0, stationed = 0, missing = 0
  for (const [atId, info] of renames) {
    const placeholder = `Display ${atId}`
    // Fetch the Twenty row by placeholder name
    const result = await client.query(
      `UPDATE ${WS}."_inventoryAsset"
       SET name = $2, "partName" = $2
       WHERE name = $1 AND "deletedAt" IS NULL
       RETURNING id`,
      [placeholder, info.name]
    )
    if (result.rowCount && result.rowCount > 0) {
      renamed += result.rowCount
      // Also try linking to station
      if (info.stationRec) {
        const stationName = atStationName.get(info.stationRec)
        const twStation = stationName ? twStationByName.get(stationName) : null
        if (twStation) {
          const stId = result.rows[0].id
          await client.query(
            `UPDATE ${WS}."_inventoryAsset" SET "assetStationId" = $2 WHERE id = $1`,
            [stId, twStation]
          )
          stationed++
        }
      }
    } else {
      missing++
    }
  }

  // Also backfill the timelineUrl for the renamed displays (in case the URL was set after name update)
  await client.query(
    `UPDATE ${WS}."_inventoryAsset"
     SET "timelineUrlPrimaryLinkUrl" = 'https://abc-anc-services.izcgmb.easypanel.host/asset/' || id,
         "timelineUrlPrimaryLinkLabel" = 'View History Timeline'
     WHERE "deletedAt" IS NULL`
  )

  console.log(`✅ Renamed: ${renamed}, linked to station: ${stationed}, missing in Twenty: ${missing}`)
  await client.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
