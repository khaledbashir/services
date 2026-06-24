import { query } from '@/lib/db'
import { normalizeVenueTriCode } from '@/lib/venue-tricodes'

// ── Tri-code side tables ──────────────────────────────────────────────────────
// Twenty-backed records (print requests, design requests, content schedules)
// have no native tri-code field, so we persist the tri-code in a local side
// table keyed by the Twenty record id. Mirrors the design_request_priorities
// pattern: create-on-first-write, swallow read errors before the table exists.
//
// Each module gets its own table so a delete cascade is trivial and the schema
// stays self-documenting.

export type TriCodeSideTable =
  | 'print_request_tricodes'
  | 'design_request_tricodes'
  | 'content_schedule_tricodes'
  | 'hours_budget_tricodes'

const ID_COLUMN: Record<TriCodeSideTable, string> = {
  print_request_tricodes: 'print_request_id',
  design_request_tricodes: 'design_request_id',
  content_schedule_tricodes: 'content_schedule_id',
  hours_budget_tricodes: 'hours_budget_id',
}

async function ensureTable(table: TriCodeSideTable) {
  const idColumn = ID_COLUMN[table]
  await query(
    `CREATE TABLE IF NOT EXISTS ${table} (
       ${idColumn} TEXT PRIMARY KEY,
       tricode TEXT,
       updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
     )`,
  )
}

// Upsert (or clear) the tri-code for a Twenty-backed record. Normalizes the
// value; a blank/invalid tri-code clears the row so stale codes don't linger.
export async function upsertTriCode(
  table: TriCodeSideTable,
  recordId: string,
  rawTriCode: unknown,
): Promise<string | null> {
  if (!recordId) return null
  const normalized = normalizeVenueTriCode(rawTriCode)
  await ensureTable(table)
  const idColumn = ID_COLUMN[table]

  if (!normalized) {
    await query(`DELETE FROM ${table} WHERE ${idColumn} = $1`, [recordId])
    return null
  }

  await query(
    `INSERT INTO ${table} (${idColumn}, tricode, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (${idColumn}) DO UPDATE SET tricode = EXCLUDED.tricode, updated_at = NOW()`,
    [recordId, normalized],
  )
  return normalized
}

// Bulk lookup for list reshaping. Returns recordId → tri-code. Swallows the
// missing-table error so the very first GET before any write still works.
export async function loadTriCodeMap(
  table: TriCodeSideTable,
  recordIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (recordIds.length === 0) return map
  const idColumn = ID_COLUMN[table]
  try {
    const res = await query(
      `SELECT ${idColumn} AS id, tricode FROM ${table} WHERE ${idColumn} = ANY($1::text[])`,
      [recordIds],
    )
    for (const row of res.rows) {
      if (row.tricode) map.set(row.id, row.tricode)
    }
  } catch {}
  return map
}

// Single lookup for detail reshaping.
export async function getTriCode(
  table: TriCodeSideTable,
  recordId: string,
): Promise<string | null> {
  if (!recordId) return null
  const idColumn = ID_COLUMN[table]
  try {
    const res = await query(
      `SELECT tricode FROM ${table} WHERE ${idColumn} = $1`,
      [recordId],
    )
    return res.rows[0]?.tricode || null
  } catch {
    return null
  }
}
