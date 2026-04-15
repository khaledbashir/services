#!/usr/bin/env npx tsx
/**
 * Phase 2B-1: Create ANC Staff as People in Twenty CRM
 *
 * Reads staff from Dashboard DB, creates Person records in Twenty with isAncStaff=true,
 * stores the returned Twenty Person ID back on the staff table.
 *
 * Usage: npx tsx scripts/twenty-phase2b-people.ts
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

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

async function main() {
  if (!TWENTY_API_KEY) {
    console.error('TWENTY_API_KEY is required')
    process.exit(1)
  }

  console.log('Phase 2B-1: Creating ANC Staff as People in Twenty...')

  // Ensure twenty_person_id column exists
  await pool.query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS twenty_person_id TEXT`)

  // Get all staff who don't have a Twenty Person ID yet
  const staffResult = await pool.query(`
    SELECT id, name as full_name, email, phone, role, title
    FROM staff
    WHERE twenty_person_id IS NULL
    ORDER BY name
  `)

  console.log(`Found ${staffResult.rows.length} staff without Twenty Person ID`)

  // Get existing People in Twenty to avoid duplicates
  const existingRes = await twentyFetch('people?limit=60')
  const existingData = await existingRes.json()
  const existingPeople = existingData?.data?.people || []
  const existingByEmail = new Map<string, string>()
  for (const p of existingPeople) {
    if (p.emails?.primaryEmail) {
      existingByEmail.set(p.emails.primaryEmail.toLowerCase(), p.id)
    }
  }

  let created = 0, skipped = 0, errors = 0

  for (const staff of staffResult.rows) {
    try {
      // Check if person already exists by email
      if (staff.email && existingByEmail.has(staff.email.toLowerCase())) {
        const existingId = existingByEmail.get(staff.email.toLowerCase())!
        console.log(`  [skip] ${staff.full_name} — already exists (${existingId})`)
        await pool.query(`UPDATE staff SET twenty_person_id = $1 WHERE id = $2`, [existingId, staff.id])
        skipped++
        continue
      }

      // Split name
      const nameParts = (staff.full_name || '').trim().split(/\s+/)
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''

      const personData: Record<string, unknown> = {
        name: { firstName, lastName },
        isAncStaff: true,
      }

      if (staff.email) personData.emails = { primaryEmail: staff.email }
      if (staff.phone) personData.phones = { primaryPhoneNumber: staff.phone }

      const res = await twentyFetch('people', {
        method: 'POST',
        body: JSON.stringify(personData),
      })

      if (res.ok) {
        const data = await res.json()
        const personId = data?.data?.createPerson?.id || data?.data?.createPeople?.[0]?.id
        if (personId) {
          await pool.query(`UPDATE staff SET twenty_person_id = $1 WHERE id = $2`, [personId, staff.id])
          console.log(`  [created] ${staff.full_name} → ${personId}`)
          created++
        } else {
          console.error(`  [error] ${staff.full_name} — no ID in response:`, JSON.stringify(data))
          errors++
        }
      } else {
        const text = await res.text()
        console.error(`  [error] ${staff.full_name} — ${res.status}: ${text}`)
        errors++
      }

      await delay(1200) // Rate limit: ~50/min
    } catch (err) {
      console.error(`  [error] ${staff.full_name}:`, err)
      errors++
    }
  }

  console.log(`\nDone! Created: ${created}, Skipped: ${skipped}, Errors: ${errors}`)
  await pool.end()
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
