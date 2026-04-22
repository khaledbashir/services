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
    await client.query(`ALTER TABLE design_request_files ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1`)
    await client.query(`ALTER TABLE design_request_files ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ`)
    await client.query(`ALTER TABLE design_request_files ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_design_request_files_req_version ON design_request_files(design_request_id, version DESC)`)

    const result = await client.query(`
      WITH ranked AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY design_request_id
                 ORDER BY created_at ASC, id ASC
               ) AS seq
        FROM design_request_files
      )
      UPDATE design_request_files d
      SET version = ranked.seq
      FROM ranked
      WHERE d.id = ranked.id
        AND d.version IS DISTINCT FROM ranked.seq
      RETURNING d.id
    `)

    console.log(`design_request_files proof versioning ready (${result.rowCount || 0} rows resequenced)`)
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('Failed to migrate design proof versioning:', error)
  process.exit(1)
})
