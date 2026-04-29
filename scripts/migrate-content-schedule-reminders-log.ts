import { Client } from 'pg'

const client = new Client({
  host: process.env.DB_HOST || 'anc-services-db-standalone',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'ancservices',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || 'AncSvc2026SecureDB',
  database: process.env.DB_NAME || 'anc_services',
})

// Day-before reminder dedup log. The launch + takedown reminder cron runs
// daily; the unique constraint on (schedule_id, kind, reminder_for_date)
// guarantees we never double-fire for the same date even if the cron is
// triggered twice in a day.
//
// schedule_id is TEXT (not uuid) because Twenty-backed schedules can have
// foreign UUIDs that don't match our local schedule rows.
async function main() {
  await client.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS content_schedule_reminders_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        schedule_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        reminder_for_date DATE NOT NULL,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(schedule_id, kind, reminder_for_date)
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_csrl_for_date ON content_schedule_reminders_log(reminder_for_date)`)
    console.log('content_schedule_reminders_log ready')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error('Failed to migrate reminders log:', error)
  process.exit(1)
})
