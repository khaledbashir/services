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
    await client.query(`ALTER TABLE design_request_files ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN NOT NULL DEFAULT false`)
    await client.query(`ALTER TABLE design_request_files ADD COLUMN IF NOT EXISTS ai_prompt TEXT`)
    await client.query(`ALTER TABLE design_request_files ADD COLUMN IF NOT EXISTS ai_model TEXT`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_design_request_files_ai ON design_request_files(design_request_id) WHERE is_ai_generated = true`)

    console.log('design_request_files AI columns ready (is_ai_generated, ai_prompt, ai_model)')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('Failed to migrate design AI columns:', error)
  process.exit(1)
})
