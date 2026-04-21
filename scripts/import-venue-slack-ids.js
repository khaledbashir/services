#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')
const XLSX = require('xlsx')

const DEFAULT_INPUT = path.join(process.cwd(), 'ANC Services Venues.xlsx')

function parseArgs(argv) {
  const args = {
    input: DEFAULT_INPUT,
    apply: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--apply') {
      args.apply = true
    } else if (arg === '--input' && argv[i + 1]) {
      args.input = path.resolve(argv[i + 1])
      i += 1
    }
  }

  return args
}

function normalizeName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(the|arena|stadium|ballpark|fieldhouse|field|center|centre|park|pavilion|campus|hall)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isSlackId(value) {
  return typeof value === 'string' && /^C[A-Z0-9]+$/i.test(value.trim())
}

function getWorkbookRows(inputPath) {
  const workbook = XLSX.readFile(inputPath)
  const firstSheetName = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[firstSheetName]
  const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false })

  const rows = []
  for (let i = 2; i < rawRows.length; i += 1) {
    const row = rawRows[i] || []
    const venue = row[1] ? String(row[1]).trim() : ''
    const accountName = row[2] ? String(row[2]).trim() : ''
    const slackId = row[3] ? String(row[3]).trim() : ''
    if (!venue && !accountName && !slackId) continue

    rows.push({
      type: row[0] ? String(row[0]).trim() : '',
      venue,
      accountName,
      slackId,
      hasSlackId: isSlackId(slackId),
    })
  }

  return rows
}

function buildVenueIndexes(venues) {
  const byExactName = new Map()
  const byNormalizedName = new Map()

  for (const venue of venues) {
    const exactKey = String(venue.name || '').trim().toLowerCase()
    const normalizedKey = normalizeName(venue.name)

    if (!byExactName.has(exactKey)) byExactName.set(exactKey, [])
    byExactName.get(exactKey).push(venue)

    if (!byNormalizedName.has(normalizedKey)) byNormalizedName.set(normalizedKey, [])
    byNormalizedName.get(normalizedKey).push(venue)
  }

  return { byExactName, byNormalizedName }
}

function matchVenue(row, indexes) {
  const exactCandidates = [
    String(row.venue || '').trim().toLowerCase(),
    String(row.accountName || '').trim().toLowerCase(),
  ].filter(Boolean)

  for (const candidate of exactCandidates) {
    const matches = indexes.byExactName.get(candidate) || []
    if (matches.length === 1) {
      return { venue: matches[0], method: 'exact' }
    }
  }

  const normalizedCandidates = [
    normalizeName(row.venue),
    normalizeName(row.accountName),
  ].filter(Boolean)

  for (const candidate of normalizedCandidates) {
    const matches = indexes.byNormalizedName.get(candidate) || []
    if (matches.length === 1) {
      return { venue: matches[0], method: 'normalized' }
    }
  }

  return { venue: null, method: null }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!fs.existsSync(args.input)) {
    throw new Error(`Input file not found: ${args.input}`)
  }

  const spreadsheetRows = getWorkbookRows(args.input)
  const pool = new Pool({
    user: process.env.DB_USER || 'ancservices',
    password: process.env.DB_PASSWORD || '',
    host: process.env.DB_HOST || 'anc-services_db',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'anc_services',
  })

  const client = await pool.connect()
  try {
    const venuesResult = await client.query(
      `SELECT id, name, slack_channel_id
       FROM venues
       ORDER BY name`
    )

    const indexes = buildVenueIndexes(venuesResult.rows)
    const matches = []
    const unmatched = []
    const skippedNoSlackId = []

    for (const row of spreadsheetRows) {
      if (!row.hasSlackId) {
        skippedNoSlackId.push(row)
        continue
      }

      const matched = matchVenue(row, indexes)
      if (!matched.venue) {
        unmatched.push(row)
        continue
      }

      matches.push({
        row,
        venue: matched.venue,
        method: matched.method,
        needsUpdate: matched.venue.slack_channel_id !== row.slackId,
      })
    }

    const updates = matches.filter((entry) => entry.needsUpdate)
    const unchanged = matches.filter((entry) => !entry.needsUpdate)

    console.log(`Spreadsheet rows: ${spreadsheetRows.length}`)
    console.log(`Rows with Slack ID: ${spreadsheetRows.length - skippedNoSlackId.length}`)
    console.log(`Matched venues: ${matches.length}`)
    console.log(`Needs update: ${updates.length}`)
    console.log(`Already matched: ${unchanged.length}`)
    console.log(`No Slack ID in sheet: ${skippedNoSlackId.length}`)
    console.log(`Unmatched venues: ${unmatched.length}`)

    if (unmatched.length > 0) {
      console.log('\nUnmatched rows:')
      for (const row of unmatched.slice(0, 25)) {
        console.log(`- ${row.venue} | account: ${row.accountName} | slack: ${row.slackId}`)
      }
      if (unmatched.length > 25) {
        console.log(`...and ${unmatched.length - 25} more`)
      }
    }

    if (!args.apply) {
      console.log('\nDry run only. Re-run with --apply to update venues.slack_channel_id.')
      return
    }

    if (updates.length === 0) {
      console.log('\nNo venue Slack IDs needed updating.')
      return
    }

    await client.query('BEGIN')
    for (const entry of updates) {
      await client.query(
        `UPDATE venues
         SET slack_channel_id = $1
         WHERE id = $2`,
        [entry.row.slackId, entry.venue.id]
      )
    }
    await client.query('COMMIT')

    console.log(`\nApplied ${updates.length} venue Slack ID updates.`)
  } catch (err) {
    try {
      await client.query('ROLLBACK')
    } catch (_) {}
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
