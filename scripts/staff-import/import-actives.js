#!/usr/bin/env node
/**
 * Import "Report of Actives for Gianni 4.20.26" staff and venue assignments
 * Source: /root/anc-services/Report of Actives for Gianni 4.20.26 (2).xlsx
 * Joe's sign-off (4/27 9:53 PM) applied: typo fixes, ambiguous resolutions, missing-venue mappings.
 *
 * Modes:
 *   node import-actives.js --dry-run   (default)
 *   node import-actives.js --live
 */

const { Client } = require('pg')
const XLSX = require('xlsx')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')

const DRY = !process.argv.includes('--live')
const FILE = '/root/anc-services/Report of Actives for Gianni 4.20.26 (2).xlsx'
const DEFAULT_PASSWORD = 'anc123'

// Joe-approved canonical mappings (typo + ambiguous + missing).
// Key = exact name as it appears in the spreadsheet, value = canonical DB venue name.
const VENUE_MAP = {
  // Typos / formatting
  'Crypto Arena': 'Crypto.com Arena',
  'Levi Stadium': "Levi's Stadium",
  'MetLife Stadium': 'Met Life Stadium',
  'Capitol One Arena': 'Capital One Arena',
  Superdome: 'Super Dome',
  'Rock n Roll Hall of Fame': 'Rock and Roll Hall of Fame',
  WMATA: 'Washington Metro Area Transportation Authority (WMATA)',
  'Yum Center': 'KFC Yum! Center',
  'Razorback Stadium': 'University of Arkansas (Razorback Stadium - Football)',
  'California Memorial Stadium':
    'University of California, Berkeley (California Memorial Stadium - Football and Lax)',
  'QU Soccer and Lacrosse Stadium': 'Quinnipiac University',
  'SHI Stadium': 'Rutgers University (SHI Stadium - Football and Lax)',
  '1604 Broadway': 'NTM - 1604 Broadway',
  'Moynihan Train Hall': 'Moynihan Station',
  'NBCU 30 Rock': 'NBC Universal 30 Rock',
  'PGA Omni Frisco': 'Omni PGA Frisco',
  'Miami Childrens Museum': "NTM - Miami Children's Museum",
  Amerant: 'Amerant Bank Arena',
  'Amerant Arena': 'Amerant Bank Arena',
  'Capital One Arena': 'Capital One Arena',

  // Ambiguous (Joe picked)
  'MGM Boston': 'MGM Music Hall at Fenway',
  'MGM Harbor': 'MGM National Harbor',
  'M&T Bank Arena': 'Quinnipiac University',
  'Dodger Stadium': 'Uniqlo Field at Dodger Stadium',
  'Bogata Savings Bank Center':
    'Fairleigh Dickinson University (FDU Bogota Saving Bank Center - Basketball, Volleyball)',

  // Missing-from-DB → existing alias
  'Fulton Station': 'Westfield Fulton Center',
  'Notre Dame Stadium': 'University of Notre Dame',
  'Choctaw Stadium': 'OBM - Arlington Choctaw',
  'Washington-Grizzely Stadium': 'University of Montana',
  'L&N Federal Credit Union Stadium': 'University of Louisville',
  'Jim Patterson Field': 'University of Louisville',
  'Ulmer Stadium': 'University of Louisville',
  'Bass-Rud Tennis Center': 'University of Louisville',
  'Lacrosse Stadium': 'University of Louisville',
  'Hynes Athletic Center': 'Iona University',
  'Valley Childrens Stadium': 'Fresno State University',
  'Brush Street': 'NTM - Brush St. Detroit Garage',
}

// New venues to add (Joe-approved).
const NEW_VENUES = [
  { name: '390 Madison Ave', venue_type: 'ooh' },
  { name: 'NTM - 1674 Broadway', venue_type: 'ooh' },
  { name: 'UCLA Health Training Center', venue_type: 'sports' },
]
// And map the spreadsheet's "1674 Broadway" to the new canonical name.
VENUE_MAP['1674 Broadway'] = 'NTM - 1674 Broadway'

// Staff who are tech_support role (no venue assignment).
const TECH_SUPPORT_NAMES = new Set(['Saint Louis, Steve'])

// "Tech Support" is not a venue — strip it out before resolving.
const SKIP_AS_VENUE = new Set(['Tech Support'])

// "Blakely, Marqus A" was unassigned per Joe's sheet — confirmed.
function parseFullName(raw) {
  // Sheet format: "Last, First Middle"
  const [last, rest] = raw.split(',').map((s) => s.trim())
  const firstParts = (rest || '').split(/\s+/).filter(Boolean)
  const first = firstParts[0] || ''
  return { last, first, full_name: raw, display: `${first} ${last}`.trim() }
}

function emailFor(first, last, takenSet) {
  const norm = (s) =>
    (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/\s+/g, '')
  let base = `${norm(first)}.${norm(last)}@anc.com`
  if (!takenSet.has(base)) {
    takenSet.add(base)
    return base
  }
  for (let i = 2; i < 50; i++) {
    const candidate = `${norm(first)}.${norm(last)}${i}@anc.com`
    if (!takenSet.has(candidate)) {
      takenSet.add(candidate)
      return candidate
    }
  }
  throw new Error(`Could not generate unique email for ${first} ${last}`)
}

async function main() {
  const wb = XLSX.readFile(FILE)
  const ws = wb.Sheets['Data']
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }).slice(1).filter(r => r[0])

  const client = new Client({
    user: 'ancservices',
    password: 'AncSvc2026SecureDB',
    host: 'localhost',
    port: 5433, // forwarded? we'll handle via docker exec instead
    database: 'anc_services',
  })

  console.log(`Mode: ${DRY ? 'DRY RUN' : 'LIVE IMPORT'}`)
  console.log(`Spreadsheet rows: ${rows.length}`)
  console.log(`New venues to add: ${NEW_VENUES.length}`)
  console.log(`Venue mappings: ${Object.keys(VENUE_MAP).length}`)

  // Print the planned actions per staff row
  const planned = []
  for (const r of rows) {
    const fullRaw = String(r[0]).trim()
    const nick = r[1] ? String(r[1]).trim() : null
    const city = r[2] ? String(r[2]).trim() : null
    const venuesRaw = r[4] ? String(r[4]).trim() : ''
    const venues = venuesRaw
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v && !SKIP_AS_VENUE.has(v))
    const mapped = venues.map((v) => VENUE_MAP[v] || v)
    const role = TECH_SUPPORT_NAMES.has(fullRaw) ? 'tech_support' : 'technician'
    planned.push({ raw: fullRaw, nick, city, role, venues: mapped })
  }

  console.log(`\nFirst 5 planned rows:`)
  planned.slice(0, 5).forEach((p) =>
    console.log(`  ${p.raw}  [${p.role}]  city=${p.city}  venues=${p.venues.length}`)
  )
  console.log(`...`)
  const totalLinks = planned.reduce((s, p) => s + p.venues.length, 0)
  console.log(`\nTotal venue links to create: ${totalLinks}`)

  // Hand off to a SQL-emitting helper that runs via docker exec
  // (avoids needing pg client config here).
  // We just write a SQL file and a JSON manifest for the runner.
  const fs = require('fs')
  fs.writeFileSync(
    '/tmp/import-plan.json',
    JSON.stringify({ planned, NEW_VENUES, VENUE_MAP }, null, 2)
  )
  console.log(`\nWrote plan to /tmp/import-plan.json`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
