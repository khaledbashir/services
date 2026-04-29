import { Client } from 'pg'

const client = new Client({
  host: process.env.DB_HOST || 'anc-services-db-standalone',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'ancservices',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || 'AncSvc2026SecureDB',
  database: process.env.DB_NAME || 'anc_services',
})

// Templates live in their own table on Postgres regardless of whether
// design_requests is Twenty-backed. Templates are creation-time scaffolding,
// not records the CRM cares about — keeping them local avoids polluting the
// CRM workspace and avoids an availability dependency on Twenty for the
// "saved request library" feature.
async function main() {
  await client.connect()

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS design_request_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        job_title TEXT,
        company_name TEXT,
        venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
        tricode TEXT,
        notes TEXT,
        boards_requested TEXT,
        sizes_requested TEXT,
        designer_id UUID REFERENCES staff(id) ON DELETE SET NULL,
        enterprise_contact_id UUID REFERENCES staff(id) ON DELETE SET NULL,
        hours_estimated NUMERIC,
        is_rando BOOLEAN NOT NULL DEFAULT false,
        created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_design_request_templates_venue ON design_request_templates(venue_id)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_design_request_templates_name ON design_request_templates(LOWER(name))`)

    console.log('design_request_templates table ready')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('Failed to migrate design_request_templates:', error)
  process.exit(1)
})
