import { Client } from 'pg'

const client = new Client({
  host: process.env.DB_HOST || 'anc-services-db-standalone',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'ancservices',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || 'AncSvc2026SecureDB',
  database: process.env.DB_NAME || 'anc_services',
})

// Sample packs are bundles of past examples Alexis sends to a sponsor as a
// single shareable URL. Replaces the workspace.anc.com link-generator
// workflow ("a client will ask for examples of files used in the past, and
// I'll create an examples request and send a link"). Items are URL + label
// pairs so we don't have to know whether the underlying file lives on the
// FTP server, in our own proof storage, or anywhere else.
async function main() {
  await client.connect()

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS design_sample_packs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        description TEXT,
        client_label TEXT,
        client_email TEXT,
        share_token TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMPTZ,
        view_count INTEGER NOT NULL DEFAULT 0,
        last_viewed_at TIMESTAMPTZ,
        created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sample_packs_token ON design_sample_packs(share_token)`)

    await client.query(`
      CREATE TABLE IF NOT EXISTS design_sample_pack_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        pack_id UUID NOT NULL REFERENCES design_sample_packs(id) ON DELETE CASCADE,
        label TEXT,
        url TEXT NOT NULL,
        caption TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_sample_pack_items_pack ON design_sample_pack_items(pack_id, position)`)

    console.log('design_sample_packs + design_sample_pack_items ready')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('Failed to migrate sample packs:', error)
  process.exit(1)
})
