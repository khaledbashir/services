import { Client } from 'pg'

const client = new Client({
  host: process.env.DB_HOST || 'anc-services-db-standalone',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'ancservices',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || 'AncSvc2026SecureDB',
  database: process.env.DB_NAME || 'anc_services',
})

async function main() {
  await client.connect()

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS client_portals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token TEXT NOT NULL UNIQUE,
        twenty_venue_id UUID,
        dashboard_venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
        created_by_email TEXT NOT NULL,
        expires_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_viewed_at TIMESTAMPTZ,
        view_count INTEGER NOT NULL DEFAULT 0,
        revoked_at TIMESTAMPTZ
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_client_portals_venue ON client_portals(dashboard_venue_id)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_client_portals_token_active ON client_portals(token) WHERE revoked_at IS NULL`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_client_portals_created ON client_portals(created_at DESC)`)

    console.log('client_portals table ready')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('Failed to create client_portals table:', error)
  process.exit(1)
})
