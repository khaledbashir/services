import { Pool } from 'pg'

const pool = new Pool({
  user: process.env.DB_USER || 'ancservices',
  password: process.env.DB_PASSWORD || '',
  host: process.env.DB_HOST || 'anc-services_db',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'anc_services',
})

let migrationRan = false

async function runMigrations() {
  if (migrationRan) return
  migrationRan = true
  const client = await pool.connect()
  try {
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS venue_type TEXT DEFAULT 'sports'`)
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS distribution_emails TEXT[] DEFAULT '{}'`)
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'event'`)
    await client.query(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMP DEFAULT NOW())`)
    await client.query(`CREATE TABLE IF NOT EXISTS staff_venues (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      staff_id UUID NOT NULL REFERENCES staff(id),
      venue_id UUID NOT NULL REFERENCES venues(id),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(staff_id, venue_id)
    )`)
    await client.query(`ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMP`)
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS last_escalation_sent_at TIMESTAMP`)
  } catch (err) {
    // Non-fatal — columns/tables may already exist or we lack permissions
    console.warn('Migration check:', err)
  } finally {
    client.release()
  }
}

export async function query(text: string, params?: any[]) {
  await runMigrations()
  const client = await pool.connect()
  try {
    const result = await client.query(text, params)
    return result
  } finally {
    client.release()
  }
}

export async function getClient() {
  return pool.connect()
}

export { pool }
