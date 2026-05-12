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
    await client.query(`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS twenty_ticket_id TEXT`)
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_twenty_ticket_id ON tickets(twenty_ticket_id) WHERE twenty_ticket_id IS NOT NULL`)
    await client.query(`CREATE TABLE IF NOT EXISTS ticket_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      author_id UUID REFERENCES staff(id) ON DELETE SET NULL,
      body TEXT NOT NULL,
      is_internal BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE TABLE IF NOT EXISTS ticket_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      comment_id UUID REFERENCES ticket_comments(id) ON DELETE SET NULL,
      filename TEXT,
      mime_type TEXT NOT NULL DEFAULT 'image/jpeg',
      image_url TEXT NOT NULL,
      caption TEXT,
      uploaded_by UUID REFERENCES staff(id) ON DELETE SET NULL,
      is_internal BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket ON ticket_attachments(ticket_id, created_at DESC)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ticket_attachments_comment ON ticket_attachments(comment_id) WHERE comment_id IS NOT NULL`)
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
    // Joe 2026-05-04: team aliases for venue search. Tech support gets calls
    // like "Philadelphia Flyers" — typing "Flyers" should resolve to Xfinity
    // Mobile Arena. Stored as a TEXT[] of free-form strings.
    await client.query(`ALTER TABLE venues ADD COLUMN IF NOT EXISTS aliases TEXT[] DEFAULT '{}'`)
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

    // Slack-native service desk configuration. This is the Ravenna-style
    // channel binding layer for ANC: a Slack channel can be connected to a
    // venue, set to manual ticket capture, or set to auto-create tickets.
    await client.query(`CREATE TABLE IF NOT EXISTS slack_request_channels (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      channel_id TEXT NOT NULL UNIQUE,
      channel_name TEXT,
      venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      auto_create_tickets BOOLEAN NOT NULL DEFAULT false,
      silent_mode BOOLEAN NOT NULL DEFAULT false,
      triage_channel_id TEXT,
      default_priority TEXT NOT NULL DEFAULT 'medium',
      default_category TEXT NOT NULL DEFAULT 'slack',
      request_type TEXT NOT NULL DEFAULT 'Support',
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_slack_request_channels_venue ON slack_request_channels(venue_id)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_slack_request_channels_enabled ON slack_request_channels(enabled) WHERE enabled = true`)
    await client.query(`CREATE TABLE IF NOT EXISTS slack_ticket_threads (
      channel_id TEXT NOT NULL,
      thread_ts TEXT NOT NULL,
      ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      created_by_slack_user_id TEXT,
      created_from TEXT NOT NULL DEFAULT 'manual',
      source_message_ts TEXT,
      source_permalink TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_synced_at TIMESTAMPTZ,
      PRIMARY KEY (channel_id, thread_ts)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_slack_ticket_threads_ticket ON slack_ticket_threads(ticket_id)`)

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

    // Toggle for the synchronous workflow-success Slack blasts. Joe asked
    // 2026-04-29 to silence venue-channel pings on completed check-ins /
    // game-ready / post-game and only get pinged on misses (handled by the
    // tech-reminders cron). Default off; admins can re-enable via Settings →
    // Automation if Chris's local-team pulse view becomes important again.
    await client.query(`
      INSERT INTO automation_jobs (id, name, description, schedule, enabled)
      VALUES (
        'workflow-success-pings',
        'Workflow Success Pings',
        'Slack message on every check-in / game-ready / post-game completion. Off = only miss-based reminders fire.',
        'on-event',
        false
      )
      ON CONFLICT (id) DO NOTHING
    `)

    // Service-contract triage + tracking. Every Slack/email/etc. request
    // lands here so the team has a real-time ledger of fix vs. new, real
    // estimated hours from past similar work, and an actual_hours close-out
    // when shipped. Replaces guesswork with a tracked dataset.
    await client.query(`CREATE TABLE IF NOT EXISTS service_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source TEXT NOT NULL DEFAULT 'manual',
      source_url TEXT,
      requester TEXT,
      raw_text TEXT NOT NULL,
      summary TEXT,
      classification TEXT NOT NULL,
      classification_confidence INT,
      classification_basis TEXT,
      repo TEXT,
      area TEXT,
      keywords TEXT[],
      estimated_hours NUMERIC(6,2),
      estimate_basis TEXT,
      retainer_covered BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'open',
      started_at TIMESTAMPTZ,
      shipped_at TIMESTAMPTZ,
      actual_hours NUMERIC(6,2),
      shipped_commit_sha TEXT,
      notes TEXT,
      created_by UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_classification ON service_requests(classification)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_repo_area ON service_requests(repo, area)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_received ON service_requests(received_at DESC)`)

    // Service-contract payment ledger — one row per month, drives the
    // "paid / pending / overdue" indicator on the public transparency page.
    await client.query(`CREATE TABLE IF NOT EXISTS service_payments (
      month TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'pending',
      amount NUMERIC(10,2),
      paid_at TIMESTAMPTZ,
      invoice_number TEXT,
      notes TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)

    // Market-grounded change-order breakdown for NEW asks. Stores the full
    // chain: US market median → outsourcing efficiency → contract rate →
    // friendly-partner cushion → final $ amount. Surfaced on the public
    // transparency dashboard so any number can defend itself when clicked.
    await client.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS market_breakdown JSONB`)
    await client.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS estimated_usd NUMERIC(10,2)`)

    // Change-order kanban lifecycle. Retainer rows still use status='open'/'in_progress'/'shipped'.
    // Change-order rows extend the same status field with 'approved' and 'paid' so the kanban can
    // run Requested → Quoted → Approved → In Progress → Shipped → Paid without a parallel column.
    await client.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ`)
    await client.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ`)
    await client.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10,2)`)
    await client.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS quote_amount NUMERIC(10,2)`)

    // Multi-project board: each request belongs to one logical project so the
    // kanban can group work into per-project pipelines (proposal-engine,
    // service-dashboard, crm, kb, anything-llm, mirror-mode, internal).
    await client.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS project TEXT`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_project ON service_requests(project)`)

    // Inbox: AI-captured candidate requests (Slack reactions, DMs to the bot,
    // etc.) land here with inbox=true and don't count anywhere until Ahmad
    // approves them. Approval flips inbox=false and routes to the right
    // project board; reject moves them to status='cancelled'.
    await client.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS inbox BOOLEAN NOT NULL DEFAULT false`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_inbox ON service_requests(inbox) WHERE inbox = true`)

    // Platforms registry — drives the warranty countdown timers on /transparency.
    // Each row is a "thing ANC has paid for" that carries a 30-day post-delivery
    // warranty. delivered_at + warranty_days defines the window.
    await client.query(`CREATE TABLE IF NOT EXISTS platforms (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      tagline TEXT,
      delivered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      warranty_days INTEGER NOT NULL DEFAULT 30,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)

    // Proposed change-orders catalog — Ahmad's proactive CO ideas with
    // pre-baked price + timeline + benefit, ready to pitch to stakeholders.
    // Lives separately from service_requests because these are unsolicited
    // ideas (no requester yet); when one gets approved it's promoted into a
    // real service_requests row.
    await client.query(`CREATE TABLE IF NOT EXISTS proposed_change_orders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      pitch TEXT,
      bullets TEXT[] NOT NULL DEFAULT '{}',
      price_usd NUMERIC(10,2),
      timeline_label TEXT,
      benefit TEXT,
      category TEXT NOT NULL DEFAULT 'individual',
      target_project TEXT,
      status TEXT NOT NULL DEFAULT 'available',
      pitched_to TEXT[] NOT NULL DEFAULT '{}',
      promoted_request_id UUID REFERENCES service_requests(id),
      is_placeholder BOOLEAN NOT NULL DEFAULT false,
      sort_order INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_proposed_cos_status ON proposed_change_orders(status)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_proposed_cos_sort ON proposed_change_orders(sort_order, created_at DESC)`)
    // Pricing transparency: keep the full 4-step market-rate chain + the
    // workType + scope band so the detail page can show how the price was
    // computed (and stakeholders can audit it).
    await client.query(`ALTER TABLE proposed_change_orders ADD COLUMN IF NOT EXISTS market_breakdown JSONB`)
    await client.query(`ALTER TABLE proposed_change_orders ADD COLUMN IF NOT EXISTS work_type TEXT`)
    await client.query(`ALTER TABLE proposed_change_orders ADD COLUMN IF NOT EXISTS scope_band TEXT`)
    // AI reasoning chain-of-thought captured from reasoning models (glm-5.1, etc.)
    // — surfaced on the detail page in an accordion so stakeholders can see HOW
    // the AI arrived at the price, scope, and timeline.
    await client.query(`ALTER TABLE proposed_change_orders ADD COLUMN IF NOT EXISTS ai_reasoning TEXT`)

    // SSO-based identity tracking — every action carries the authenticated
    // user's id + name + email captured at action time. Pulled from the JWT
    // session via requireRole, so it's tamper-proof at the API layer.
    await client.query(`ALTER TABLE proposed_change_orders ADD COLUMN IF NOT EXISTS created_by_user_id UUID`)
    await client.query(`ALTER TABLE proposed_change_orders ADD COLUMN IF NOT EXISTS created_by_name TEXT`)
    await client.query(`ALTER TABLE proposed_change_orders ADD COLUMN IF NOT EXISTS created_by_email TEXT`)
    await client.query(`ALTER TABLE proposed_change_orders ADD COLUMN IF NOT EXISTS promoted_by_user_id UUID`)
    await client.query(`ALTER TABLE proposed_change_orders ADD COLUMN IF NOT EXISTS promoted_by_name TEXT`)
    await client.query(`ALTER TABLE proposed_change_orders ADD COLUMN IF NOT EXISTS view_count INTEGER NOT NULL DEFAULT 0`)
    await client.query(`ALTER TABLE proposed_change_orders ADD COLUMN IF NOT EXISTS last_viewed_at TIMESTAMPTZ`)

    // Retainer alert ledger — fires once per (month, threshold) so the
    // 90% / 100% emails to Joe + Jireh + Charlie don't spam.
    await client.query(`CREATE TABLE IF NOT EXISTS retainer_alerts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      month TEXT NOT NULL,
      threshold TEXT NOT NULL,
      hours_used NUMERIC(6,2) NOT NULL,
      cap_hours NUMERIC(6,2) NOT NULL,
      recipients TEXT[],
      cc TEXT[],
      sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      delivered BOOLEAN NOT NULL DEFAULT false,
      UNIQUE (month, threshold)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_retainer_alerts_month ON retainer_alerts(month)`)

    // Infra / SaaS receipt vault — Ahmad drops receipts at /transparency, the
    // dropzone extracts via Mistral OCR + reasons over the OCR'd text with
    // Ollama Cloud, persists structured rows here. Charlie pulls a monthly
    // audit pack (ZIP of every PDF + CSV summary) for accounting.
    await client.query(`CREATE TABLE IF NOT EXISTS infra_receipts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      vendor_raw TEXT,
      vendor_canonical TEXT,
      category TEXT,
      amount_cents BIGINT,
      currency TEXT NOT NULL DEFAULT 'USD',
      period_start DATE,
      period_end DATE,
      invoice_number TEXT,
      paid_at DATE,
      file_key TEXT NOT NULL,
      original_filename TEXT,
      file_mime TEXT,
      file_size BIGINT,
      extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      raw_ocr_text TEXT,
      extractor_provider TEXT,
      extractor_confidence NUMERIC(4,3),
      reasoner_model TEXT,
      notes TEXT,
      uploaded_by UUID REFERENCES staff(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_infra_receipts_paid_month ON infra_receipts(date_trunc('month', paid_at))`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_infra_receipts_vendor ON infra_receipts(vendor_canonical)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_infra_receipts_category ON infra_receipts(category)`)
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_infra_receipts_invoice ON infra_receipts(vendor_canonical, invoice_number) WHERE invoice_number IS NOT NULL AND vendor_canonical IS NOT NULL`)

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
