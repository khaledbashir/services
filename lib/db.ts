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
    await client.query(`CREATE TABLE IF NOT EXISTS proposal_portals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL DEFAULT 'Untitled Client Portal',
      mode TEXT NOT NULL DEFAULT 'PROPOSAL',
      recipe TEXT NOT NULL DEFAULT 'natalia',
      enabled_modules JSONB NOT NULL DEFAULT '[]'::jsonb,
      client_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_by_user_id UUID NOT NULL,
      created_by_email TEXT NOT NULL,
      is_public BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
      published_at TIMESTAMP,
      published_version INTEGER NOT NULL DEFAULT 0,
      published_title TEXT,
      published_modules JSONB,
      published_client_data JSONB
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_proposal_portals_user ON proposal_portals(created_by_user_id)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_proposal_portals_updated ON proposal_portals(updated_at DESC)`)
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
    await client.query(`CREATE TABLE IF NOT EXISTS slack_worklog_threads (
      channel_id TEXT NOT NULL,
      thread_ts TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      created_by_slack_user_id TEXT,
      created_from TEXT NOT NULL DEFAULT 'manual',
      source_message_ts TEXT,
      source_permalink TEXT,
      summary TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (channel_id, thread_ts, entity_type)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_slack_worklog_threads_entity ON slack_worklog_threads(entity_type, entity_id)`)

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
    await client.query(`ALTER TABLE design_requests ADD COLUMN IF NOT EXISTS tricode TEXT`)
    await client.query(`ALTER TABLE design_requests ADD COLUMN IF NOT EXISTS ftp_proof_link TEXT`)
    await client.query(`ALTER TABLE design_requests ADD COLUMN IF NOT EXISTS ftp_final_link TEXT`)
    await client.query(`CREATE TABLE IF NOT EXISTS design_request_designers (
      design_request_id UUID NOT NULL REFERENCES design_requests(id) ON DELETE CASCADE,
      staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      assigned_by UUID REFERENCES staff(id) ON DELETE SET NULL,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (design_request_id, staff_id)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_design_request_designers_staff ON design_request_designers(staff_id)`)
    await client.query(`CREATE TABLE IF NOT EXISTS design_request_enterprise_contacts (
      design_request_id UUID NOT NULL REFERENCES design_requests(id) ON DELETE CASCADE,
      staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (design_request_id, staff_id)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_design_request_enterprise_contacts_staff ON design_request_enterprise_contacts(staff_id)`)
    await client.query(`ALTER TABLE cg_design_requests ADD COLUMN IF NOT EXISTS tricode TEXT`)
    await client.query(`CREATE TABLE IF NOT EXISTS cg_design_designers (
      cg_design_request_id UUID NOT NULL REFERENCES cg_design_requests(id) ON DELETE CASCADE,
      staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      assigned_by UUID REFERENCES staff(id) ON DELETE SET NULL,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (cg_design_request_id, staff_id)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cg_design_designers_staff ON cg_design_designers(staff_id)`)
    await client.query(`CREATE TABLE IF NOT EXISTS cg_design_enterprise_contacts (
      cg_design_request_id UUID NOT NULL REFERENCES cg_design_requests(id) ON DELETE CASCADE,
      staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (cg_design_request_id, staff_id)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cg_design_enterprise_contacts_staff ON cg_design_enterprise_contacts(staff_id)`)
    await client.query(`ALTER TABLE designer_time_entries ADD COLUMN IF NOT EXISTS cg_design_request_id UUID REFERENCES cg_design_requests(id) ON DELETE CASCADE`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_designer_time_entries_cg ON designer_time_entries(cg_design_request_id)`)
    await client.query(`CREATE TABLE IF NOT EXISTS cg_design_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      cg_design_request_id UUID NOT NULL REFERENCES cg_design_requests(id) ON DELETE CASCADE,
      author_id UUID REFERENCES staff(id) ON DELETE SET NULL,
      author_name TEXT,
      body TEXT NOT NULL,
      mentions TEXT[] DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cg_design_comments_request ON cg_design_comments(cg_design_request_id, created_at DESC)`)
    await client.query(`CREATE TABLE IF NOT EXISTS cg_design_attachments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      cg_design_request_id UUID NOT NULL REFERENCES cg_design_requests(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      size_bytes BIGINT NOT NULL DEFAULT 0,
      data BYTEA,
      uploaded_by UUID REFERENCES staff(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_cg_design_attachments_request ON cg_design_attachments(cg_design_request_id, created_at DESC)`)
    await client.query(`ALTER TABLE content_schedules ADD COLUMN IF NOT EXISTS file_location TEXT`)
    await client.query(`CREATE TABLE IF NOT EXISTS content_schedule_operators (
      content_schedule_id UUID NOT NULL REFERENCES content_schedules(id) ON DELETE CASCADE,
      staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      is_primary BOOLEAN NOT NULL DEFAULT false,
      assigned_by UUID REFERENCES staff(id) ON DELETE SET NULL,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (content_schedule_id, staff_id)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_content_schedule_operators_staff ON content_schedule_operators(staff_id)`)
    await client.query(`CREATE TABLE IF NOT EXISTS content_schedule_enterprise_contacts (
      content_schedule_id UUID NOT NULL REFERENCES content_schedules(id) ON DELETE CASCADE,
      staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (content_schedule_id, staff_id)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_content_schedule_enterprise_contacts_staff ON content_schedule_enterprise_contacts(staff_id)`)

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
    // portal_users — customer accounts for the client-facing portal
    // (login → see all open/closed tickets across their org's venues,
    // submit tickets, reply on threads). Access scope = the venues of
    // their client via client_venues, plus optional direct venue grants.
    // ============================================================
    await client.query(`
      CREATE TABLE IF NOT EXISTS portal_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        password_hash TEXT,
        client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        invite_token TEXT UNIQUE,
        invite_expires_at TIMESTAMPTZ,
        invited_by TEXT,
        last_login_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_portal_users_client ON portal_users(client_id)`)
    // Customer-authored comments carry a display name; author_id stays the
    // service-account staff row so existing joins keep working.
    await client.query(`ALTER TABLE ticket_comments ADD COLUMN IF NOT EXISTS author_name TEXT`)
    await client.query(`
      CREATE TABLE IF NOT EXISTS portal_user_venues (
        portal_user_id UUID NOT NULL REFERENCES portal_users(id) ON DELETE CASCADE,
        venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (portal_user_id, venue_id)
      )
    `)

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

    await client.query(`CREATE TABLE IF NOT EXISTS automation_jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      schedule TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`ALTER TABLE automation_jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`)

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

    // Bucket model — every row is one of four buckets that drive what counts
    // where on /transparency:
    //   service_contract → FIX on shipped feature, counts toward 12hr/mo
    //   warranty         → FIX on a NEW shipped <30d ago, free (doesn't count)
    //   change_order     → NEW capability, separate quote (doesn't count toward retainer hours)
    //   not_billable     → personal/internal/infra/non-ANC, never appears on stakeholder views
    //
    // bucket_confirmed flips to true when a human approves the auto-classified
    // push from the inbox. Until then, auto-push rows (source='auto-push')
    // stay invisible to the public meter even if their bucket=service_contract.
    //
    // estimate_basis_chain stores the executive-defensible rationale: which
    // past change orders the hours were derived from, with similarity scores.
    await client.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS bucket TEXT`)
    await client.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS bucket_confirmed BOOLEAN NOT NULL DEFAULT false`)
    await client.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS estimate_basis_chain JSONB`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_bucket ON service_requests(bucket)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_pending_bucket ON service_requests(bucket_confirmed) WHERE source = 'auto-push' AND bucket_confirmed = false`)

    // One-off: backfill bucket for existing rows based on classification +
    // retainer_covered so the historical ledger lines up with the new model.
    await client.query(`UPDATE service_requests
       SET bucket = CASE
         WHEN source = 'auto-push' AND COALESCE(repo, '') IN ('rag2', 'anc-kb') THEN 'not_billable'
         WHEN classification = 'FIX' AND retainer_covered = true THEN 'service_contract'
         WHEN classification IN ('NEW', 'MIXED') THEN 'change_order'
         WHEN classification = 'FIX' AND retainer_covered = false THEN 'warranty'
         ELSE 'not_billable'
       END
       WHERE bucket IS NULL`)

    // One-off backfill: grandfather everything shipped BEFORE today as
    // bucket_confirmed = true so the historical meter stays accurate. Rows
    // shipped today are quarantined pending approval — the auto-push hook
    // started inflating actual_hours via line-count estimates and that has
    // to be reviewed before counting toward the public retainer cap.
    await client.query(`UPDATE service_requests
       SET bucket_confirmed = true
       WHERE bucket_confirmed = false
         AND (shipped_at IS NULL OR shipped_at < DATE_TRUNC('day', NOW()))`)

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
    await client.query(`CREATE INDEX IF NOT EXISTS idx_infra_receipts_paid_at ON infra_receipts(paid_at)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_infra_receipts_vendor ON infra_receipts(vendor_canonical)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_infra_receipts_category ON infra_receipts(category)`)
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_infra_receipts_invoice ON infra_receipts(vendor_canonical, invoice_number) WHERE invoice_number IS NOT NULL AND vendor_canonical IS NOT NULL`)

    // Threaded comments per receipt — wall-feed style: any user can post,
    // newest at the bottom. Cascade on receipt delete.
    await client.query(`CREATE TABLE IF NOT EXISTS infra_receipt_comments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      receipt_id UUID NOT NULL REFERENCES infra_receipts(id) ON DELETE CASCADE,
      author_id UUID REFERENCES staff(id) ON DELETE SET NULL,
      author_name TEXT,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_infra_receipt_comments_receipt ON infra_receipt_comments(receipt_id, created_at ASC)`)

    // AI-generated dashboards — the Advisor's anc-dashboard-builder agent
    // skill POSTs a spec here and gets back a public token URL it can drop
    // into the chat. Public (no-auth) on purpose so embedded-chat readers
    // can click through.
    await client.query(`CREATE TABLE IF NOT EXISTS ai_dashboards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      token TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      subtitle TEXT,
      spec JSONB NOT NULL,
      created_by TEXT,
      view_count INTEGER NOT NULL DEFAULT 0,
      last_viewed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_dashboards_token ON ai_dashboards(token)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_dashboards_created ON ai_dashboards(created_at DESC)`)

    // ---- Tenants: Ahmad's multi-client foundation. -------------------------
    // tenants holds each independent client of Ahmad's freelance practice
    // (ANC, hypothetical Acme Sports, etc). Distinct from the existing
    // `clients` table which is ANC's CRM clients (sports orgs / venues).
    //
    // tenant_features is a per-tenant feature toggle so Ahmad can decide
    // from /admin which capability each client gets (transparency on,
    // advisor off, etc).
    //
    // service_requests.tenant_id ties every ledger row to a tenant so the
    // /transparency dashboard scopes correctly. Existing rows backfill to
    // the ANC tenant (slug='anc') seeded below.
    await client.query(`CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT UNIQUE NOT NULL,
      subdomain TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      brand_name TEXT,
      logo_url TEXT,
      primary_color TEXT,
      retainer_cap_hours NUMERIC(6,2) NOT NULL DEFAULT 12,
      hourly_rate_usd NUMERIC(8,2) NOT NULL DEFAULT 90,
      monthly_retainer_usd NUMERIC(10,2) NOT NULL DEFAULT 1500,
      warranty_days INTEGER NOT NULL DEFAULT 30,
      payoneer_pending_url TEXT,
      payoneer_topup_url TEXT,
      contract_summary TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      archived_at TIMESTAMPTZ
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain) WHERE is_active = true`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_tenants_active ON tenants(is_active)`)

    // page_maintenance is a per-page lock map: { feature_key: true } means
    // that page is in maintenance for this tenant. Non-admin viewers see a
    // maintenance card; admins still see the live page so work continues.
    // Separate from tenant_features.enabled — "disabled" means the page
    // doesn't exist for this tenant, "maintenance" means temporarily down.
    await client.query(`ALTER TABLE tenants ADD COLUMN IF NOT EXISTS page_maintenance JSONB NOT NULL DEFAULT '{}'::jsonb`)

    await client.query(`CREATE TABLE IF NOT EXISTS tenant_features (
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      feature_key TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (tenant_id, feature_key)
    )`)

    // Seed the ANC tenant if it doesn't exist yet. Pre-existing service_requests
    // get backfilled to this tenant.
    await client.query(`INSERT INTO tenants
      (slug, subdomain, name, brand_name, retainer_cap_hours, hourly_rate_usd, monthly_retainer_usd, warranty_days, contract_summary)
      VALUES ('anc', 'anc', 'ANC Sports', 'ANC Sports',
              12, 90, 1500, 30,
              'Standard service contract · $1,500/mo · 12 hrs included · 30-day post-delivery warranty per project · $90/hr overage')
      ON CONFLICT (slug) DO NOTHING`)

    // Default-on feature set for the ANC tenant (all known capabilities).
    await client.query(`INSERT INTO tenant_features (tenant_id, feature_key, enabled)
      SELECT t.id, f.key, true
        FROM tenants t
       CROSS JOIN (VALUES
         ('transparency'),
         ('change_orders'),
         ('explore'),
         ('morning_brief'),
         ('service_log'),
         ('expenses'),
         ('advisor')
       ) AS f(key)
      WHERE t.slug = 'anc'
      ON CONFLICT (tenant_id, feature_key) DO NOTHING`)

    await client.query(`ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_service_requests_tenant ON service_requests(tenant_id)`)

    // Backfill: every existing ledger row predates multi-tenant — assign to ANC.
    await client.query(`UPDATE service_requests sr
       SET tenant_id = t.id
       FROM tenants t
       WHERE sr.tenant_id IS NULL AND t.slug = 'anc'`)

    // ---- Marketing Hub: HubSpot replacement surface for Media & Partnerships.
    // Audiences, newsletter campaigns, tracking events, form routing, and social
    // queue metadata live here so the marketing workflow does not depend on
    // HubSpot while still linking back to CRM records when available.
    await client.query(`CREATE TABLE IF NOT EXISTS marketing_audiences (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)

    await client.query(`CREATE TABLE IF NOT EXISTS marketing_contacts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      crm_person_id TEXT,
      crm_company_id TEXT,
      email TEXT UNIQUE NOT NULL,
      first_name TEXT,
      last_name TEXT,
      company_name TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      subscription_status TEXT NOT NULL DEFAULT 'subscribed',
      unsubscribe_reason TEXT,
      bounced_at TIMESTAMPTZ,
      unsubscribed_at TIMESTAMPTZ,
      last_synced_at TIMESTAMPTZ,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_marketing_contacts_status ON marketing_contacts(subscription_status)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_marketing_contacts_company ON marketing_contacts(company_name)`)

    await client.query(`CREATE TABLE IF NOT EXISTS marketing_audience_members (
      audience_id UUID NOT NULL REFERENCES marketing_audiences(id) ON DELETE CASCADE,
      contact_id UUID NOT NULL REFERENCES marketing_contacts(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active',
      added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (audience_id, contact_id)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_marketing_audience_members_contact ON marketing_audience_members(contact_id)`)

    await client.query(`CREATE TABLE IF NOT EXISTS newsletter_campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      audience_id UUID REFERENCES marketing_audiences(id) ON DELETE SET NULL,
      template_id UUID,
      name TEXT NOT NULL,
      subject TEXT NOT NULL,
      preview_text TEXT,
      from_name TEXT NOT NULL DEFAULT 'ANC Sports',
      from_email TEXT NOT NULL DEFAULT 'notifications@ancsports.net',
      reply_to TEXT,
      body_html TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      created_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS template_id UUID`)
    await client.query(`ALTER TABLE newsletter_campaigns ADD COLUMN IF NOT EXISTS visual_content JSONB`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_status ON newsletter_campaigns(status)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_newsletter_campaigns_audience ON newsletter_campaigns(audience_id)`)

    await client.query(`CREATE TABLE IF NOT EXISTS newsletter_campaign_recipients (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID NOT NULL REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
      contact_id UUID REFERENCES marketing_contacts(id) ON DELETE SET NULL,
      email TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      sent_at TIMESTAMPTZ,
      opened_at TIMESTAMPTZ,
      first_clicked_at TIMESTAMPTZ,
      unsubscribed_at TIMESTAMPTZ,
      bounced_at TIMESTAMPTZ,
      error_text TEXT,
      open_count INTEGER NOT NULL DEFAULT 0,
      click_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (campaign_id, email)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_newsletter_recipients_campaign ON newsletter_campaign_recipients(campaign_id)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_newsletter_recipients_contact ON newsletter_campaign_recipients(contact_id)`)

    await client.query(`CREATE TABLE IF NOT EXISTS newsletter_campaign_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID REFERENCES newsletter_campaigns(id) ON DELETE CASCADE,
      recipient_id UUID REFERENCES newsletter_campaign_recipients(id) ON DELETE SET NULL,
      contact_id UUID REFERENCES marketing_contacts(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      event_url TEXT,
      user_agent TEXT,
      ip_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_newsletter_events_campaign ON newsletter_campaign_events(campaign_id, created_at DESC)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_newsletter_events_type ON newsletter_campaign_events(event_type)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_newsletter_events_recipient ON newsletter_campaign_events(recipient_id, created_at DESC)`)

    await client.query(`CREATE TABLE IF NOT EXISTS marketing_sync_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      sync_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'success',
      result JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_marketing_sync_runs_type ON marketing_sync_runs(sync_type, created_at DESC)`)

    await client.query(`CREATE TABLE IF NOT EXISTS marketing_form_routing_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      form_id TEXT NOT NULL,
      form_title TEXT NOT NULL,
      inquiry_type TEXT,
      route_to_name TEXT NOT NULL,
      route_to_email TEXT NOT NULL,
      slack_channel TEXT,
      crm_target TEXT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_marketing_form_routes_form ON marketing_form_routing_rules(form_id)`)

    await client.query(`CREATE TABLE IF NOT EXISTS marketing_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      template_type TEXT NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      subject TEXT,
      preview_text TEXT,
      body_html TEXT,
      content TEXT,
      platform TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(template_type, name)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_marketing_templates_type ON marketing_templates(template_type, is_active)`)
    await client.query(`ALTER TABLE marketing_templates ADD COLUMN IF NOT EXISTS visual_content JSONB`)

    await client.query(`CREATE TABLE IF NOT EXISTS marketing_approval_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      item_type TEXT NOT NULL,
      item_id UUID NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      requested_by TEXT,
      approver_group TEXT NOT NULL DEFAULT 'Jerry, Kirsten, Joe, Jireh, John',
      notes TEXT,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      decided_by TEXT,
      decided_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_marketing_approvals_item ON marketing_approval_requests(item_type, item_id, requested_at DESC)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_marketing_approvals_status ON marketing_approval_requests(status, requested_at DESC)`)

    await client.query(`CREATE TABLE IF NOT EXISTS marketing_form_submissions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source TEXT NOT NULL DEFAULT 'hubspot',
      source_id TEXT UNIQUE,
      form_id TEXT NOT NULL,
      form_title TEXT NOT NULL,
      submitted_at TIMESTAMPTZ,
      email TEXT,
      first_name TEXT,
      last_name TEXT,
      company_name TEXT,
      page_url TEXT,
      contact_id UUID REFERENCES marketing_contacts(id) ON DELETE SET NULL,
      crm_person_id TEXT,
      crm_note_id TEXT,
      timeline_status TEXT NOT NULL DEFAULT 'archived',
      fields JSONB NOT NULL DEFAULT '{}'::jsonb,
      raw JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_marketing_form_submissions_form ON marketing_form_submissions(form_id, submitted_at DESC)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_marketing_form_submissions_email ON marketing_form_submissions(email)`)

    await client.query(`CREATE TABLE IF NOT EXISTS marketing_social_posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID REFERENCES newsletter_campaigns(id) ON DELETE SET NULL,
      template_id UUID,
      platform TEXT NOT NULL,
      integration_id TEXT,
      channel_name TEXT,
      content TEXT NOT NULL,
      media_url TEXT,
      scheduled_at TIMESTAMPTZ,
      postiz_post_id TEXT,
      release_url TEXT,
      state TEXT NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`ALTER TABLE marketing_social_posts ADD COLUMN IF NOT EXISTS template_id UUID`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_marketing_social_posts_state ON marketing_social_posts(state)`)

    // Signal: native social OAuth + token storage (replaces Postiz)
    await client.query(`CREATE TABLE IF NOT EXISTS marketing_social_accounts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      platform TEXT NOT NULL,
      account_label TEXT NOT NULL,
      external_id TEXT,
      external_urn TEXT,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at TIMESTAMPTZ,
      scopes TEXT[] DEFAULT '{}',
      metadata JSONB NOT NULL DEFAULT '{}',
      connected_by TEXT,
      connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_refreshed_at TIMESTAMPTZ,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(platform, external_id)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_marketing_social_accounts_platform ON marketing_social_accounts(platform) WHERE revoked_at IS NULL`)

    // Signal: OAuth state CSRF protection
    await client.query(`CREATE TABLE IF NOT EXISTS marketing_social_oauth_state (
      state TEXT PRIMARY KEY,
      platform TEXT NOT NULL,
      return_to TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`DELETE FROM marketing_social_oauth_state WHERE created_at < NOW() - INTERVAL '1 hour'`)

    // Signal: signed approval tokens — Slack-DM link decisions without Slack interactivity setup
    await client.query(`CREATE TABLE IF NOT EXISTS marketing_approval_tokens (
      token TEXT PRIMARY KEY,
      approval_id UUID NOT NULL REFERENCES marketing_approval_requests(id) ON DELETE CASCADE,
      approver_slack_id TEXT NOT NULL,
      approver_label TEXT,
      decision TEXT,                    -- 'approve' | 'reject' once clicked
      decided_at TIMESTAMPTZ,
      ip TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_marketing_approval_tokens_approval ON marketing_approval_tokens(approval_id)`)

    await client.query(`INSERT INTO marketing_audiences (name, description, source)
      VALUES (
        'Media & Partnerships Newsletter',
        'Default audience for Alison''s monthly Media & Partnerships newsletter, seeded for the HubSpot replacement workflow.',
        'crm'
      )
      ON CONFLICT (name) DO NOTHING`)

    await client.query(`WITH defaults(form_id, form_title, inquiry_type, route_to_name, route_to_email, slack_channel, crm_target) AS (
        VALUES
          ('contact-inquiry', 'Contact Inquiry Form', 'general', 'Alison', 'alison@anc.com', NULL, NULL),
          ('design-request', 'ANC Design Request', 'design', 'Alison', 'alison@anc.com', NULL, 'designRequests'),
          ('print-request', 'ANC Print Request', 'print', 'Alison', 'alison@anc.com', NULL, 'printRequests'),
          ('parts-order', 'ANC Parts Order', 'parts', 'Alison', 'alison@anc.com', NULL, 'partsOrders'),
          ('content-schedule', 'ANC Content Schedule', 'content', 'Alison', 'alison@anc.com', NULL, 'contentSchedules'),
          ('hubspot-contact-form-2026', 'Contact Form 2026', 'general', 'Alison', 'alison@anc.com', NULL, NULL)
      )
      INSERT INTO marketing_form_routing_rules
        (form_id, form_title, inquiry_type, route_to_name, route_to_email, slack_channel, crm_target)
      SELECT d.form_id, d.form_title, d.inquiry_type, d.route_to_name, d.route_to_email, d.slack_channel, d.crm_target
      FROM defaults d
      WHERE NOT EXISTS (
        SELECT 1 FROM marketing_form_routing_rules r
        WHERE r.form_id = d.form_id
          AND COALESCE(r.inquiry_type, '') = COALESCE(d.inquiry_type, '')
          AND r.route_to_email = d.route_to_email
      )`)

    await client.query(`
      INSERT INTO automation_jobs (id, name, description, schedule, enabled)
      VALUES
        (
          'marketing-eligibility-sync',
          'Marketing Eligibility Sync',
          'Sync new/updated Twenty CRM people into Marketing Hub newsletter eligibility and suppression state.',
          'every-15-minutes',
          true
        ),
        (
          'marketing-newsletter-sender',
          'Marketing Newsletter Sender',
          'Sends due Marketing Hub newsletter campaigns whose status is scheduled.',
          'every-5-minutes',
          true
        )
      ON CONFLICT (id) DO UPDATE
        SET description = EXCLUDED.description,
            schedule = EXCLUDED.schedule,
            updated_at = NOW()
    `)

    await client.query(`
      WITH templates(template_type, name, category, subject, preview_text, body_html, content, platform, metadata) AS (
        VALUES
          (
            'newsletter',
            'Monthly Media & Partnerships Newsletter',
            'newsletter',
            'ANC Sports Media & Partnerships Update',
            'Latest ANC media, venue, and partnership updates.',
            '<h2 style="margin:0 0 12px">Media & Partnerships Update</h2><p>Lead with the month''s strongest venue, partner, or project update.</p><h3>Highlights</h3><ul><li>Partner or venue highlight</li><li>Project/update worth sharing</li><li>Call to action</li></ul>',
            NULL,
            NULL,
            '{"source":"hubspot_retirement_default"}'::jsonb
          ),
          (
            'newsletter',
            'Event Announcement',
            'announcement',
            'ANC Sports Event Update',
            'A quick update from ANC Sports.',
            '<h2 style="margin:0 0 12px">Event Announcement</h2><p>Share the event, venue, date, and why it matters.</p><p><strong>Next step:</strong> Add the link or contact path here.</p>',
            NULL,
            NULL,
            '{"source":"hubspot_retirement_default"}'::jsonb
          ),
          (
            'social',
            'Partner Highlight',
            'partner',
            NULL,
            NULL,
            NULL,
            'A quick partner note from ANC Sports: [partner/client] is moving [venue/project] forward with [specific upgrade or media opportunity]. The story is the outcome: [one concrete impact for fans, sponsors, or venue operators].',
            'linkedin',
            '{"source":"hubspot_retirement_default","approvalPath":"media_partnerships"}'::jsonb
          ),
          (
            'social',
            'Newsletter Promo',
            'newsletter_promo',
            NULL,
            NULL,
            NULL,
            'The latest ANC Sports Media & Partnerships brief is ready. Lead story: [headline]. Inside: [partner signal], [venue note], and [what to watch]. Read more: [link]',
            'linkedin',
            '{"source":"hubspot_retirement_default","approvalPath":"media_partnerships"}'::jsonb
          ),
          (
            'social',
            'Hiring / Team Post',
            'hiring',
            NULL,
            NULL,
            NULL,
            'ANC Sports is growing the team behind live-event execution. We are looking for [role/team] to support [venue/work type]. Details: [link]',
            'linkedin',
            '{"source":"hubspot_retirement_default","approvalPath":"people"}'::jsonb
          ),
          (
            'social',
            'Venue Moment',
            'venue_moment',
            NULL,
            NULL,
            NULL,
            '[Venue/event] had the kind of moment that shows why live media matters: [moment]. ANC Sports helped power [display/media/sponsorship surface], giving fans and partners [specific outcome].',
            'linkedin',
            '{"source":"hubspot_retirement_default","approvalPath":"media_partnerships"}'::jsonb
          ),
          (
            'social',
            'Sponsor Signal',
            'sponsor_signal',
            NULL,
            NULL,
            NULL,
            'Sponsor visibility works best when the message belongs to the moment. At [venue/event], [brand/partner] showed up through [asset/channel] with [measurable or observable impact].',
            'linkedin',
            '{"source":"hubspot_retirement_default","approvalPath":"media_partnerships"}'::jsonb
          ),
          (
            'social',
            'Internal Approval Brief',
            'approval_brief',
            NULL,
            NULL,
            NULL,
            'Approval brief for [campaign/post]: audience = [audience], channel = [LinkedIn/X/Instagram/Slack], publish window = [date/time], risk check = [client/logo/rightsholder notes], final copy = [copy].',
            'slack',
            '{"source":"hubspot_retirement_default","approvalPath":"internal"}'::jsonb
          )
      )
      INSERT INTO marketing_templates
        (template_type, name, category, subject, preview_text, body_html, content, platform, metadata)
      SELECT template_type, name, category, subject, preview_text, body_html, content, platform, metadata
      FROM templates
      ON CONFLICT (template_type, name) DO NOTHING
    `)

    await client.query(`CREATE TABLE IF NOT EXISTS gamification_points (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      staff_id TEXT NOT NULL,
      staff_name TEXT NOT NULL DEFAULT '',
      team TEXT NOT NULL DEFAULT 'general',
      action_type TEXT NOT NULL,
      points INTEGER NOT NULL,
      metadata JSONB DEFAULT '{}',
      earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gam_points_staff ON gamification_points(staff_id)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gam_points_earned ON gamification_points(earned_at)`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gam_points_team ON gamification_points(team)`)
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_gam_points_once ON gamification_points(staff_id, action_type, (metadata->>'event_key')) WHERE metadata ? 'event_key'`)

    await client.query(`CREATE TABLE IF NOT EXISTS gamification_badges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '🏆',
      tier TEXT NOT NULL DEFAULT 'bronze',
      category TEXT NOT NULL DEFAULT 'volume',
      criteria JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)

    await client.query(`CREATE TABLE IF NOT EXISTS gamification_user_badges (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      staff_id TEXT NOT NULL,
      badge_id UUID NOT NULL REFERENCES gamification_badges(id) ON DELETE CASCADE,
      earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      context JSONB DEFAULT '{}',
      UNIQUE(staff_id, badge_id)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gam_ubadges_staff ON gamification_user_badges(staff_id)`)

    await client.query(`CREATE TABLE IF NOT EXISTS gamification_streaks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      staff_id TEXT NOT NULL,
      streak_type TEXT NOT NULL,
      current_count INTEGER NOT NULL DEFAULT 0,
      best_count INTEGER NOT NULL DEFAULT 0,
      last_activity_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(staff_id, streak_type)
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gam_streaks_staff ON gamification_streaks(staff_id)`)

    await client.query(`CREATE TABLE IF NOT EXISTS gamification_leaderboard_snapshots (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      period TEXT NOT NULL,
      team TEXT,
      rankings JSONB NOT NULL DEFAULT '[]',
      snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_gam_lb_period ON gamification_leaderboard_snapshots(period, snapshot_at)`)

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
