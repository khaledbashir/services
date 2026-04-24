import { Pool } from 'pg'

const pool = new Pool({
  user: process.env.DB_USER || 'ancservices',
  password: process.env.DB_PASSWORD || '',
  host: process.env.DB_HOST || 'anc-services_db',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'anc_services',
})

let migrationRan = false
let migrationRunning: Promise<void> | null = null

async function runMigrations() {
  if (migrationRan) return
  if (migrationRunning) return migrationRunning
  migrationRunning = (async () => {
  const client = await pool.connect()
  try {
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS venue_type TEXT DEFAULT 'sports'`)
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS distribution_emails TEXT[] DEFAULT '{}'`)
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS event_type TEXT DEFAULT 'event'`)
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS source TEXT`)
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'confirmed'`)
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS client_id UUID`)
    await client.query(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMP DEFAULT NOW())`)
    await client.query(`CREATE TABLE IF NOT EXISTS clients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      parent_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
      client_type TEXT NOT NULL DEFAULT 'client',
      sport TEXT,
      primary_contact_name TEXT,
      primary_contact_email TEXT,
      notes TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_clients_parent ON clients(parent_client_id)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active)`)
    await client.query(`CREATE TABLE IF NOT EXISTS client_venues (
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (client_id, venue_id)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_client_venues_venue ON client_venues(venue_id)`)
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
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS notes TEXT`)
    await client.query(`CREATE TABLE IF NOT EXISTS venue_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      author_id UUID REFERENCES staff(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_venue_notes_venue ON venue_notes(venue_id, created_at DESC)`)
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
    await client.query(`ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS last_game_ready_reminder_at TIMESTAMP`)
    await client.query(`ALTER TABLE event_assignments ADD COLUMN IF NOT EXISTS last_post_game_reminder_at TIMESTAMP`)
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
    await client.query(`UPDATE venues
      SET feed_url = 'https://www.ticketmaster.com/moda-center-tickets-portland/venue/123078',
          feed_type = 'ticketmaster',
          timezone = CASE
            WHEN COALESCE(timezone, '') = '' OR timezone = 'America/New_York' THEN 'America/Los_Angeles'
            ELSE timezone
          END
      WHERE LOWER(name) IN ('moda center', 'moda center portland')
        AND (
          COALESCE(feed_url, '') = ''
          OR COALESCE(feed_type, '') <> 'ticketmaster'
          OR feed_url NOT LIKE '%123078%'
        )`)
    // Twenty CRM ID columns for bidirectional mapping
    await client.query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS twenty_person_id TEXT`)
    await client.query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS twenty_technician_id TEXT`)
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS twenty_id TEXT`)

    // Slack user → staff mapping so OpenClaw (Claw bot) can resolve the
    // inbound Slack user to a real staff record + role when calling skills
    // via /api/ai/invoke. Array because Ahmad has multiple Slack IDs.
    await client.query(`ALTER TABLE staff ADD COLUMN IF NOT EXISTS slack_user_ids TEXT[] DEFAULT '{}'::text[]`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_staff_slack_user_ids ON staff USING GIN(slack_user_ids)`)
    await client.query(`CREATE TABLE IF NOT EXISTS ai_chats (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT 'New chat',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_chats_user_updated ON ai_chats(user_id, updated_at DESC)`)
    await client.query(`CREATE TABLE IF NOT EXISTS ai_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      chat_id UUID NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT,
      tool_calls JSONB,
      tool_call_id TEXT,
      tool_name TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_messages_chat_created ON ai_messages(chat_id, created_at ASC)`)
    await client.query(`CREATE TABLE IF NOT EXISTS slack_ai_threads (
      channel_id TEXT NOT NULL,
      thread_ts TEXT NOT NULL,
      chat_id UUID NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
      created_by UUID REFERENCES staff(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (channel_id, thread_ts)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_slack_ai_threads_chat_id ON slack_ai_threads(chat_id)`)
    await client.query(`CREATE TABLE IF NOT EXISTS slack_processed_events (
      event_id TEXT PRIMARY KEY,
      processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)

    // Normalize older client schema versions into the Option B shape.
    await client.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_kind TEXT`)
    await client.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS legacy_venue_id UUID`)
    await client.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()`)
    await client.query(`UPDATE clients SET client_kind = COALESCE(client_kind, client_type, 'client') WHERE client_kind IS NULL`)
    await client.query(`ALTER TABLE clients ALTER COLUMN client_kind SET DEFAULT 'client'`)
    await client.query(`UPDATE clients SET updated_at = COALESCE(updated_at, created_at, NOW()) WHERE updated_at IS NULL`)
    await client.query(`ALTER TABLE client_venues ADD COLUMN IF NOT EXISTS relation_type TEXT`)
    await client.query(`UPDATE client_venues
      SET relation_type = CASE WHEN COALESCE(is_primary, false) THEN 'primary' ELSE 'secondary' END
      WHERE relation_type IS NULL`)
    await client.query(`ALTER TABLE client_venues ALTER COLUMN relation_type SET DEFAULT 'primary'`)
    await client.query(`UPDATE client_venues SET created_at = NOW() WHERE created_at IS NULL`)

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
    await client.query(`ALTER TABLE design_request_files ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1`)
    await client.query(`ALTER TABLE design_request_files ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ`)
    await client.query(`ALTER TABLE design_request_files ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_design_request_files_req_version ON design_request_files(design_request_id, version DESC)`)

    // ============================================================
    // client_portals — shareable read-only venue health links
    // for external clients. Multiple active links per venue are
    // allowed so managers can rotate / revoke without downtime.
    // ============================================================
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

    // ============================================================
    // service_types + venue_services — per-venue contracted services
    // (Joe's Apr 16 list: White Glove, Break/Fix, Event Support, etc.)
    // ============================================================
    await client.query(`CREATE TABLE IF NOT EXISTS service_types (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`)
    await client.query(`CREATE TABLE IF NOT EXISTS venue_services (
      venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      service_type_id UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (venue_id, service_type_id)
    )`)
    await client.query(`CREATE TABLE IF NOT EXISTS client_services (
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      service_type_id UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (client_id, service_type_id)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_client_services_client ON client_services(client_id) WHERE enabled = true`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_venue_services_venue ON venue_services(venue_id) WHERE enabled = true`)

    // ============================================================
    // clients + client_venues + client_services — Option B model
    // ============================================================
    await client.query(`CREATE TABLE IF NOT EXISTS clients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      parent_client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
      client_kind TEXT NOT NULL DEFAULT 'client',
      sport TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      legacy_venue_id UUID UNIQUE REFERENCES venues(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_clients_parent ON clients(parent_client_id)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(is_active)`)
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_legacy_venue ON clients(legacy_venue_id) WHERE legacy_venue_id IS NOT NULL`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_clients_scope
      ON clients (LOWER(name), COALESCE(parent_client_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(LOWER(sport), ''))`)
    await client.query(`CREATE TABLE IF NOT EXISTS client_venues (
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
      relation_type TEXT NOT NULL DEFAULT 'primary',
      created_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (client_id, venue_id)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_client_venues_venue ON client_venues(venue_id)`)
    await client.query(`CREATE TABLE IF NOT EXISTS client_services (
      client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      service_type_id UUID NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
      enabled BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (client_id, service_type_id)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_client_services_client ON client_services(client_id) WHERE enabled = true`)
    await client.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_client_id ON events(client_id)`)
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'events_client_id_fkey'
        ) THEN
          ALTER TABLE events
            ADD CONSTRAINT events_client_id_fkey
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL;
        END IF;
      END
      $$;
    `)

    // Seed Joe's canonical contracted-service list. Idempotent via ON CONFLICT.
    const joeServices: Array<[string, string]> = [
      ['White Glove Maintenance', 'Proactive scheduled maintenance with premium response SLA'],
      ['Break/Fix Maintenance', 'Reactive repair dispatch when something breaks'],
      ['Event Support', 'On-site technical support during events — events at this venue must be assigned to staff'],
      ['Walkthroughs', 'Scheduled venue walkthroughs and inspections'],
      ['Operations', 'Day-to-day operational support and coordination'],
      ['Scheduling', 'Shift scheduling and staff dispatch for this venue'],
      ['Tech Support', 'Remote / on-call technical support'],
      ['LiveSync', 'LiveSync product — live content / scoreboard sync'],
      ['VisionStats', 'VisionStats product — statistics integration for displays'],
      ['Parts', 'Parts inventory and fulfillment for this venue'],
    ]
    for (const [name, description] of joeServices) {
      await client.query(
        `INSERT INTO service_types (name, description) VALUES ($1, $2)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description`,
        [name, description]
      )
    }

    // Backfill an initial 1:1 client for legacy venue-based records so the
    // app can start using client-level services immediately without data loss.
    await client.query(`
      INSERT INTO clients (name, legacy_venue_id)
      SELECT v.name, v.id
      FROM venues v
      LEFT JOIN clients c ON c.legacy_venue_id = v.id
      WHERE c.id IS NULL
    `)
    await client.query(`
      INSERT INTO client_venues (client_id, venue_id, relation_type)
      SELECT c.id, v.id, 'primary'
      FROM clients c
      JOIN venues v ON v.id = c.legacy_venue_id
      ON CONFLICT (client_id, venue_id) DO NOTHING
    `)
    await client.query(`
      INSERT INTO client_services (client_id, service_type_id, enabled)
      SELECT c.id, vs.service_type_id, vs.enabled
      FROM venue_services vs
      JOIN clients c ON c.legacy_venue_id = vs.venue_id
      ON CONFLICT (client_id, service_type_id)
      DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
    `)
    await client.query(`
      UPDATE events e
      SET client_id = c.id
      FROM clients c
      WHERE c.legacy_venue_id = e.venue_id
        AND e.client_id IS NULL
    `)
    migrationRan = true
  } catch (err) {
    console.warn('Migration check:', err)
  } finally {
    client.release()
    migrationRunning = null
  }
  })()
  return migrationRunning
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
