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
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS source TEXT`)
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confirmed'`)
    await client.query(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMP DEFAULT NOW())`)
    await client.query(`CREATE TABLE IF NOT EXISTS staff_venues (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      staff_id UUID NOT NULL REFERENCES staff(id),
      venue_id UUID NOT NULL REFERENCES venues(id),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(staff_id, venue_id)
    )`)
    await client.query(`CREATE TABLE IF NOT EXISTS venue_briefings (
      venue_id UUID PRIMARY KEY REFERENCES venues(id),
      content TEXT NOT NULL,
      alerts JSONB DEFAULT '[]',
      stats JSONB DEFAULT '{}',
      recommendation TEXT,
      generated_at TIMESTAMP DEFAULT NOW()
    )`)
    await client.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS image_url TEXT`)
    // Ticket fields to match Salesforce
    await client.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'web'`) // email, slack, web, phone, portal
    await client.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS ticket_type TEXT DEFAULT 'support'`) // support, dev_ticket
    await client.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS contact_name TEXT`)
    await client.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS contact_email TEXT`)
    await client.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS contact_phone TEXT`)
    await client.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS parent_ticket_id UUID REFERENCES tickets(id)`)
    await client.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS sf_case_number TEXT`)
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS logo_url TEXT`)
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS cover_image_url TEXT`)
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS venue_manager_id UUID REFERENCES staff(id)`)
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS lead_field_rep_id UUID REFERENCES staff(id)`)
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS feed_url TEXT`)
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS feed_type TEXT`)
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS last_feed_synced_at TIMESTAMP`)
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS last_feed_sync_status TEXT`)
    await client.query(`CREATE TABLE IF NOT EXISTS shift_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      venue_id UUID NOT NULL REFERENCES venues(id),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      required_staff INT DEFAULT 1,
      recurrence TEXT NOT NULL DEFAULT 'weekdays',
      custom_days INT[] DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      created_by UUID REFERENCES staff(id),
      created_at TIMESTAMP DEFAULT NOW()
    )`)
    await client.query(`CREATE TABLE IF NOT EXISTS user_preferences (
      user_id UUID NOT NULL REFERENCES staff(id),
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY(user_id, key)
    )`)
    await client.query(`ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMP`)
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS last_escalation_sent_at TIMESTAMP`)
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS requires_staffing BOOLEAN`)
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`)
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION`)
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION`)
    await client.query(`CREATE TABLE IF NOT EXISTS venue_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_type TEXT NOT NULL DEFAULT 'document',
      file_size BIGINT DEFAULT 0,
      description TEXT,
      uploaded_by UUID REFERENCES staff(id),
      created_at TIMESTAMP DEFAULT NOW()
    )`)
    await client.query(`CREATE TABLE IF NOT EXISTS kb_entries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      description TEXT,
      issue_type TEXT,
      venue_id UUID REFERENCES venues(id),
      suggested_fix TEXT,
      image_url TEXT,
      embedding float8[],
      created_by UUID REFERENCES staff(id),
      created_at TIMESTAMP DEFAULT NOW()
    )`)
    await client.query(`CREATE TABLE IF NOT EXISTS discovery_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
      discovered_at TIMESTAMP NOT NULL DEFAULT NOW(),
      source TEXT NOT NULL,
      events_found INT NOT NULL DEFAULT 0,
      events_imported INT NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      raw_response JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT NOW()
    )`)
    await client.query(`UPDATE venues
      SET feed_url = 'https://www.prucenter.com/events',
          feed_type = 'ticketmaster'
      WHERE LOWER(name) = 'prudential center'
        AND COALESCE(feed_url, '') = ''`)
    await client.query(`UPDATE venues
      SET feed_url = 'https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=venue,team',
          feed_type = 'mlb-schedule'
      WHERE LOWER(name) = 'fenway park'
        AND (COALESCE(feed_url, '') = '' OR feed_type = 'team-website')`)
    // Twenty CRM ID columns for bidirectional mapping
    await client.query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS twenty_person_id TEXT`)
    await client.query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS twenty_technician_id TEXT`)
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS twenty_id TEXT`)

    await client.query(`
      CREATE OR REPLACE FUNCTION cosine_similarity(a float8[], b float8[]) RETURNS float8 AS $$
      DECLARE
        dot float8 := 0;
        norm_a float8 := 0;
        norm_b float8 := 0;
        i int;
      BEGIN
        FOR i IN 1..array_length(a, 1) LOOP
          dot := dot + a[i] * b[i];
          norm_a := norm_a + a[i] * a[i];
          norm_b := norm_b + b[i] * b[i];
        END LOOP;
        IF norm_a = 0 OR norm_b = 0 THEN RETURN 0; END IF;
        RETURN dot / (sqrt(norm_a) * sqrt(norm_b));
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `)

    // ============================================================
    // proof_shares — public URL sharing for Twenty CRM proof files
    // ============================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS proof_shares (
        token TEXT PRIMARY KEY,
        twenty_object_type TEXT NOT NULL,
        twenty_record_id UUID NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ,
        view_count INT NOT NULL DEFAULT 0,
        last_viewed_at TIMESTAMPTZ,
        last_viewed_ip TEXT,
        client_response TEXT,
        client_response_at TIMESTAMPTZ,
        client_response_note TEXT,
        message TEXT,
        created_by_name TEXT,
        created_by_email TEXT,
        client_email TEXT,
        last_nudged_at TIMESTAMPTZ
      )
    `)
    await client.query(`ALTER TABLE proof_shares ADD COLUMN IF NOT EXISTS client_email TEXT`)
    await client.query(`ALTER TABLE proof_shares ADD COLUMN IF NOT EXISTS last_nudged_at TIMESTAMPTZ`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_proof_shares_record ON proof_shares(twenty_record_id)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_proof_shares_expires ON proof_shares(expires_at)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_proof_shares_created ON proof_shares(created_at) WHERE client_response IS NULL`)
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
