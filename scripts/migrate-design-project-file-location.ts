import { Client } from 'pg'

const client = new Client({
  host: process.env.DB_HOST || 'anc-services-db-standalone',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'ancservices',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || 'AncSvc2026SecureDB',
  database: process.env.DB_NAME || 'anc_services',
})

// Charlie 2026-07-15: "PROJECT FILE LOCATION" — where the source/project file
// lives on ANC's internal servers so a designer can jump straight back to it
// for re-work. Distinct from FINAL FILE LOCATION (the deliverable folder).
async function main() {
  await client.connect()
  try {
    await client.query(`ALTER TABLE design_requests ADD COLUMN IF NOT EXISTS project_file_location TEXT`)
    console.log('design_requests.project_file_location ready')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('Failed to migrate design project_file_location:', error)
  process.exit(1)
})
