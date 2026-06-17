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
      CREATE TABLE IF NOT EXISTS proposal_portals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title TEXT NOT NULL DEFAULT 'Untitled Client Portal',
        mode TEXT NOT NULL DEFAULT 'PROPOSAL',
        recipe TEXT NOT NULL DEFAULT 'natalia',
        enabled_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
        client_data JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_by_user_id UUID NOT NULL,
        created_by_email TEXT NOT NULL,
        is_public BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_at TIMESTAMPTZ,
        published_version INTEGER NOT NULL DEFAULT 0,
        published_title TEXT,
        published_modules JSONB,
        published_client_data JSONB
      )
    `)
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_proposal_portals_user ON proposal_portals(created_by_user_id)`,
    )
    await client.query(
      `CREATE INDEX IF NOT EXISTS idx_proposal_portals_updated ON proposal_portals(updated_at DESC)`,
    )

    console.log('proposal_portals table ready')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('Failed to create proposal_portals table:', error)
  process.exit(1)
})