import { Client } from 'pg'

const client = new Client({
  host: process.env.DB_HOST || 'anc-services-db-standalone',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'ancservices',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || 'AncSvc2026SecureDB',
  database: process.env.DB_NAME || 'anc_services',
})

// Internal/non-billable category tags from Alexis on the 2026-04-29 call:
// spec sheets, ad sales, marketing, proposals, sponsorship. The category is
// orthogonal to whether the request lives in Twenty or local Postgres, so
// it gets its own side-table keyed by the request id (TEXT — supports both
// local UUIDs and Twenty UUIDs without dual schemas).
async function main() {
  await client.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS design_request_internal_categories (
        design_request_id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        notes TEXT,
        set_by UUID REFERENCES staff(id) ON DELETE SET NULL,
        set_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_drici_category ON design_request_internal_categories(category)`)
    console.log('design_request_internal_categories ready')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('Failed to migrate internal categories:', error)
  process.exit(1)
})
