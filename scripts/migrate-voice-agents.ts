import { Client } from 'pg'

const client = new Client({
  host: process.env.DB_HOST || 'anc-services-db-standalone',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'ancservices',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || 'AncSvc2026SecureDB',
  database: process.env.DB_NAME || 'anc_services',
})

// One row per configurable voice agent. Each agent picks its own TTS
// provider/voice/model and an LLM-tool allowlist, so swapping MiMo for
// another provider later is a per-agent column update — not a code change.
//
// allowed_tools NULL = full access to every registered skill
// (matches what /internal/voice has today).
//
// visibility 'internal' = requires logged-in staff cookie.
// visibility 'public'   = open via the share link, optionally restricted
// to embed_origins for iframe usage.
async function main() {
  await client.connect()
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS voice_agents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        system_prompt TEXT,
        kb_text TEXT,
        tts_provider TEXT NOT NULL DEFAULT 'mimo',
        tts_voice TEXT NOT NULL DEFAULT 'mimo_default',
        tts_model TEXT,
        llm_provider TEXT,
        allowed_tools TEXT[],
        visibility TEXT NOT NULL DEFAULT 'internal' CHECK (visibility IN ('internal', 'public')),
        embed_origins TEXT[],
        greeting TEXT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_by UUID REFERENCES staff(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `)

    await client.query(`CREATE INDEX IF NOT EXISTS idx_voice_agents_slug ON voice_agents(slug);`)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_voice_agents_active ON voice_agents(is_active) WHERE is_active = true;`)

    // Pin a chat to its agent so per-agent call logs are queryable.
    await client.query(`
      ALTER TABLE ai_chats ADD COLUMN IF NOT EXISTS voice_agent_id UUID
        REFERENCES voice_agents(id) ON DELETE SET NULL;
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_chats_voice_agent ON ai_chats(voice_agent_id);`)

    // Seed the default internal agent if nothing exists yet.
    const existing = await client.query(`SELECT 1 FROM voice_agents LIMIT 1`)
    if (existing.rowCount === 0) {
      await client.query(
        `INSERT INTO voice_agents (slug, name, description, greeting, system_prompt, kb_text, tts_provider, tts_voice, visibility)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          'anc-ops-internal',
          'ANC Ops Internal',
          'Staff-only ops co-pilot — full read/write access across events, venues, tickets, design requests, maintenance, and parts.',
          'ANC Ops here. What do you need?',
          null,
          null,
          'mimo',
          'mimo_default',
          'internal',
        ]
      )
      console.log('Seeded default voice agent: anc-ops-internal')
    }

    console.log('voice_agents migration complete')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('migrate-voice-agents failed:', err)
  process.exit(1)
})
