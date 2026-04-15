#!/usr/bin/env npx tsx
/**
 * Phase 2B-2: Staff-to-Venue Assignments in Twenty CRM
 *
 * Links Technicians to their home venues (homeVenueId),
 * and sets Venue Manager / Lead Field Rep on venues.
 *
 * Usage: npx tsx scripts/twenty-phase2b-assignments.ts
 * Env: TWENTY_API_KEY, DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
 */

import { Pool } from 'pg'

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''

const pool = new Pool({
  user: process.env.DB_USER || 'ancservices',
  password: process.env.DB_PASSWORD || '',
  host: process.env.DB_HOST || 'anc-services_db',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'anc_services',
})

async function twentyFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  return fetch(`${TWENTY_BASE}/rest/${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${TWENTY_API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}

async function fetchAllTwenty<T>(endpoint: string): Promise<T[]> {
  const items: T[] = []
  let cursor: string | null = null
  for (let page = 0; page < 50; page++) {
    const url = cursor ? `${endpoint}?limit=60&starting_after=${cursor}` : `${endpoint}?limit=60`
    const res = await twentyFetch(url)
    const data = await res.json()
    const key = endpoint.split('?')[0]
    const records = data?.data?.[key] || []
    if (records.length === 0) break
    items.push(...records)
    if (!data?.pageInfo?.hasNextPage) break
    cursor = data.pageInfo.endCursor
  }
  return items
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main() {
  if (!TWENTY_API_KEY) {
    console.error('TWENTY_API_KEY is required')
    process.exit(1)
  }

  console.log('Phase 2B-2: Staff-to-Venue Assignments...\n')

  // --- Part 1: Link Technicians to home venues ---
  console.log('=== Part 1: Technician homeVenueId ===')

  // Build index of Twenty technicians by servicesId
  const twentyTechs = await fetchAllTwenty<{ id: string; servicesId: string; name: string }>('technicians')
  const techByServicesId = new Map<string, string>()
  for (const t of twentyTechs) {
    if (t.servicesId) techByServicesId.set(t.servicesId, t.id)
  }

  // Build index of Twenty venues by servicesId
  const twentyVenues = await fetchAllTwenty<{ id: string; servicesId: string; name: string }>('venues')
  const venueByServicesId = new Map<string, string>()
  for (const v of twentyVenues) {
    if (v.servicesId) venueByServicesId.set(v.servicesId, v.id)
  }

  // Get staff-venue assignments from Dashboard
  const assignmentsResult = await pool.query(`
    SELECT sv.staff_id, sv.venue_id, s.name as staff_name, v.name as venue_name
    FROM staff_venues sv
    JOIN staff s ON s.id = sv.staff_id
    JOIN venues v ON v.id = sv.venue_id
    ORDER BY s.name
  `)

  let techLinked = 0, techSkipped = 0, techErrors = 0

  for (const row of assignmentsResult.rows) {
    const twentyTechId = techByServicesId.get(row.staff_id)
    const twentyVenueId = venueByServicesId.get(row.venue_id)

    if (!twentyTechId) {
      console.log(`  [skip] ${row.staff_name} — no matching Twenty technician`)
      techSkipped++
      continue
    }
    if (!twentyVenueId) {
      console.log(`  [skip] ${row.staff_name} → ${row.venue_name} — no matching Twenty venue`)
      techSkipped++
      continue
    }

    try {
      const res = await twentyFetch(`technicians/${twentyTechId}`, {
        method: 'PATCH',
        body: JSON.stringify({ homeVenueId: twentyVenueId }),
      })
      if (res.ok) {
        console.log(`  [linked] ${row.staff_name} → ${row.venue_name}`)
        techLinked++
      } else {
        console.error(`  [error] ${row.staff_name}: ${await res.text()}`)
        techErrors++
      }
      await delay(1200)
    } catch (err) {
      console.error(`  [error] ${row.staff_name}:`, err)
      techErrors++
    }
  }

  console.log(`Technicians: Linked ${techLinked}, Skipped ${techSkipped}, Errors ${techErrors}\n`)

  // --- Part 2: Venue Manager & Lead Field Rep ---
  console.log('=== Part 2: Venue Manager & Lead Field Rep ===')

  const venueManagerResult = await pool.query(`
    SELECT v.id as venue_id, v.name as venue_name,
           v.venue_manager_id, v.lead_field_rep_id,
           sm.name as manager_name, sm.twenty_person_id as manager_twenty_id,
           sr.name as rep_name, sr.twenty_person_id as rep_twenty_id
    FROM venues v
    LEFT JOIN staff sm ON sm.id = v.venue_manager_id
    LEFT JOIN staff sr ON sr.id = v.lead_field_rep_id
    WHERE v.venue_manager_id IS NOT NULL OR v.lead_field_rep_id IS NOT NULL
    ORDER BY v.name
  `)

  let venueUpdated = 0, venueSkipped = 0, venueErrors = 0

  for (const row of venueManagerResult.rows) {
    const twentyVenueId = venueByServicesId.get(row.venue_id)
    if (!twentyVenueId) {
      console.log(`  [skip] ${row.venue_name} — no matching Twenty venue`)
      venueSkipped++
      continue
    }

    const patch: Record<string, string> = {}
    if (row.manager_twenty_id) patch.venueManagerId = row.manager_twenty_id
    if (row.rep_twenty_id) patch.leadFieldRepId = row.rep_twenty_id

    if (Object.keys(patch).length === 0) {
      console.log(`  [skip] ${row.venue_name} — manager/rep don't have Twenty Person IDs yet (run 2B-1 first)`)
      venueSkipped++
      continue
    }

    try {
      const res = await twentyFetch(`venues/${twentyVenueId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      })
      if (res.ok) {
        console.log(`  [updated] ${row.venue_name} — Manager: ${row.manager_name || 'n/a'}, Rep: ${row.rep_name || 'n/a'}`)
        venueUpdated++
      } else {
        console.error(`  [error] ${row.venue_name}: ${await res.text()}`)
        venueErrors++
      }
      await delay(1200)
    } catch (err) {
      console.error(`  [error] ${row.venue_name}:`, err)
      venueErrors++
    }
  }

  console.log(`Venues: Updated ${venueUpdated}, Skipped ${venueSkipped}, Errors ${venueErrors}`)
  await pool.end()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
