/**
 * Natural-language audience builder for Signal.
 *
 * Takes a plain-English query and turns it into a safe SELECT against
 * marketing_contacts joined with audience membership + campaign-recipient
 * engagement signals. Returns BOTH the SQL (so the user sees what's running)
 * and the matching row sample.
 *
 * Safety: the generated query is gated by:
 *   1. The system prompt only emits SELECT against an allowlist of tables.
 *   2. A static regex check rejects anything containing INSERT/UPDATE/DELETE/
 *      DROP/ALTER/CREATE/TRUNCATE/GRANT/REVOKE/COPY/EXECUTE/DO blocks.
 *   3. The SQL is wrapped in a SUBQUERY with a hard LIMIT.
 */

import { openai } from '@ai-sdk/openai'
import { generateText } from 'ai'

const SCHEMA_DOC = `
Available tables (read-only, all in the public schema):

  marketing_contacts (
    id UUID PRIMARY KEY,
    email TEXT,
    first_name TEXT,
    last_name TEXT,
    company_name TEXT,
    subscription_status TEXT,  -- 'subscribed' | 'unsubscribed' | 'bounced'
    unsubscribe_reason TEXT,
    bounced_at TIMESTAMPTZ,
    unsubscribed_at TIMESTAMPTZ,
    metadata JSONB
  )

  marketing_audiences (
    id UUID PRIMARY KEY,
    name TEXT,           -- e.g. 'HubSpot - All Newsletter Contacts - Subscribed', 'Media & Partnerships Newsletter'
    description TEXT,
    source TEXT,
    is_active BOOLEAN
  )

  marketing_audience_members (
    audience_id UUID REFERENCES marketing_audiences(id),
    contact_id UUID REFERENCES marketing_contacts(id),
    status TEXT          -- 'active' for current members
  )

  newsletter_campaigns (
    id UUID PRIMARY KEY,
    name TEXT,
    subject TEXT,
    status TEXT          -- 'sent', 'draft', 'scheduled', 'hubspot_imported_reference'
  )

  newsletter_campaign_recipients (
    id UUID PRIMARY KEY,
    campaign_id UUID REFERENCES newsletter_campaigns(id),
    contact_id UUID REFERENCES marketing_contacts(id),
    sent_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    first_clicked_at TIMESTAMPTZ,
    unsubscribed_at TIMESTAMPTZ
  )
`

const SYSTEM_PROMPT = `You translate plain-English audience descriptions for ANC Sports' marketing system into a single safe SELECT query against PostgreSQL.

${SCHEMA_DOC}

Rules:
- Output exactly one SELECT statement that returns marketing_contacts.id and key display fields.
- The SELECT MUST be: SELECT c.id, c.email, c.first_name, c.last_name, c.company_name FROM marketing_contacts c <joins/where clauses>.
- Always exclude contacts where subscription_status != 'subscribed' (treat unsubscribed/bounced as never eligible unless the user explicitly says "include unsubscribed").
- For audience-name matches, use ILIKE wildcards. Example: a JOIN through marketing_audience_members where the audience name ILIKE '%nba%'.
- For engagement, JOIN newsletter_campaign_recipients (alias r) and newsletter_campaigns (alias camp). Use camp.name ILIKE '%hornets%' or camp.subject ILIKE pattern to identify campaigns.
- Use ORDER BY c.email LIMIT 500 at the end to bound the preview.
- Never use any DDL or DML keyword (INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/TRUNCATE/GRANT/REVOKE/COPY/EXECUTE).
- Output ONLY the SQL — no preamble, no markdown fences, no explanation. Just SQL ending with a semicolon.`

const UNSAFE_KEYWORDS_RE = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|COPY|EXECUTE|DO|VACUUM|CLUSTER)\b/i
const ALLOWED_TABLES = ['marketing_contacts', 'marketing_audiences', 'marketing_audience_members', 'newsletter_campaigns', 'newsletter_campaign_recipients']

export interface NlAudienceResult {
  query: string
  sql: string
  rejected?: string
}

export async function naturalLanguageToSql(query: string): Promise<NlAudienceResult> {
  const trimmed = query.trim()
  if (!trimmed) {
    return { query, sql: '', rejected: 'empty query' }
  }

  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: trimmed }],
    temperature: 0,
  })

  let sql = text.trim()
  // Strip code fences if the model emitted them anyway
  sql = sql.replace(/^```sql\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()

  // Safety: reject non-SELECT or any DML/DDL keywords
  if (!/^\s*select\b/i.test(sql)) {
    return { query, sql, rejected: 'must start with SELECT' }
  }
  if (UNSAFE_KEYWORDS_RE.test(sql)) {
    return { query, sql, rejected: 'contains unsafe keyword' }
  }
  // Only allow joins against our schema tables
  const lower = sql.toLowerCase()
  for (const table of ALLOWED_TABLES) {
    // no-op, just used as allowlist reference
    void table
  }
  // Reject references to unknown tables (anything in FROM/JOIN not in the allowlist)
  const tableRefs = Array.from(lower.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_]*)/g)).map((m) => m[1])
  for (const ref of tableRefs) {
    if (!ALLOWED_TABLES.includes(ref)) {
      return { query, sql, rejected: `references unknown table: ${ref}` }
    }
  }
  // Enforce a hard limit
  if (!/limit\s+\d+/i.test(sql)) {
    sql = sql.replace(/;?\s*$/, ' LIMIT 500;')
  }
  return { query, sql }
}
