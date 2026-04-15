#!/usr/bin/env npx tsx
/**
 * Phase 2B-3: Create Service Records in Twenty CRM
 *
 * Reads venue_services from Dashboard DB and creates Service records in Twenty.
 * Maps service type names to Twenty's serviceType enum values.
 *
 * Usage: npx tsx scripts/twenty-phase2b-services.ts
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

// Map Dashboard service type names to Twenty serviceType enum
const serviceTypeMap: Record<string, string> = {
  'full service': 'LED_MAINTENANCE',
  'led maintenance': 'LED_MAINTENANCE',
  'content management': 'CONTENT_MANAGEMENT',
  'content': 'CONTENT_MANAGEMENT',
  'staffing': 'STAFFING',
  'warranty': 'WARRANTY',
  'installation': 'INSTALLATION',
  'consulting': 'CONSULTING',
  'remote monitoring': 'REMOTE_MONITORING',
}

// Services that require tech assignments at events
const staffingServices = new Set(['LED_MAINTENANCE', 'STAFFING', 'INSTALLATION'])

async function main() {
  if (!TWENTY_API_KEY) {
    console.error('TWENTY_API_KEY is required')
    process.exit(1)
  }

  console.log('Phase 2B-3: Creating Service Records in Twenty...\n')

  // Build Twenty venue index by servicesId
  const twentyVenues = await fetchAllTwenty<{ id: string; servicesId: string; name: string; companyId: string }>('venues')
  const venueByServicesId = new Map<string, { id: string; companyId: string; name: string }>()
  for (const v of twentyVenues) {
    if (v.servicesId) venueByServicesId.set(v.servicesId, { id: v.id, companyId: v.companyId, name: v.name })
  }

  // Check existing services in Twenty to avoid duplicates
  const existingServices = await fetchAllTwenty<{ id: string; venueId: string; serviceType: string }>('services')
  const existingSet = new Set<string>()
  for (const s of existingServices) {
    existingSet.add(`${s.venueId}:${s.serviceType}`)
  }

  // Get enabled venue services from Dashboard
  const result = await pool.query(`
    SELECT vs.venue_id, vs.enabled, st.name as service_name,
           v.name as venue_name
    FROM venue_services vs
    JOIN service_types st ON st.id = vs.service_type_id
    JOIN venues v ON v.id = vs.venue_id
    WHERE vs.enabled = true
    ORDER BY v.name, st.name
  `)

  console.log(`Found ${result.rows.length} enabled venue services in Dashboard\n`)

  let created = 0, skipped = 0, errors = 0
  const venuesWithServices = new Set<string>()

  for (const row of result.rows) {
    const twentyVenue = venueByServicesId.get(row.venue_id)
    if (!twentyVenue) {
      console.log(`  [skip] ${row.venue_name} / ${row.service_name} — no matching Twenty venue`)
      skipped++
      continue
    }

    const serviceType = serviceTypeMap[(row.service_name || '').toLowerCase()] || 'LED_MAINTENANCE'

    // Check for duplicate
    if (existingSet.has(`${twentyVenue.id}:${serviceType}`)) {
      console.log(`  [skip] ${row.venue_name} / ${row.service_name} — already exists`)
      skipped++
      venuesWithServices.add(twentyVenue.id)
      continue
    }

    try {
      const res = await twentyFetch('services', {
        method: 'POST',
        body: JSON.stringify({
          name: `${twentyVenue.name} — ${row.service_name}`,
          serviceType,
          serviceStatus: 'ACTIVE',
          venueId: twentyVenue.id,
          companyId: twentyVenue.companyId || undefined,
          requiresStaffing: staffingServices.has(serviceType),
        }),
      })

      if (res.ok) {
        console.log(`  [created] ${row.venue_name} — ${row.service_name} (${serviceType})`)
        created++
        venuesWithServices.add(twentyVenue.id)
      } else {
        console.error(`  [error] ${row.venue_name} / ${row.service_name}: ${await res.text()}`)
        errors++
      }

      await delay(1200)
    } catch (err) {
      console.error(`  [error] ${row.venue_name} / ${row.service_name}:`, err)
      errors++
    }
  }

  // Update hasContractedServices on venues that have active services
  console.log(`\nUpdating hasContractedServices on ${venuesWithServices.size} venues...`)
  for (const venueId of venuesWithServices) {
    try {
      await twentyFetch(`venues/${venueId}`, {
        method: 'PATCH',
        body: JSON.stringify({ hasContractedServices: true }),
      })
      await delay(1200)
    } catch (err) {
      console.error(`  [error] updating venue ${venueId}:`, err)
    }
  }

  console.log(`\nDone! Created: ${created}, Skipped: ${skipped}, Errors: ${errors}`)
  await pool.end()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
