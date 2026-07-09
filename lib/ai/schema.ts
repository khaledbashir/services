import { query } from '@/lib/db'

/**
 * Live Postgres schema introspection for the AI record tools.
 *
 * Why this exists: the old _auto-crud.ts hard-coded a column list per table.
 * Every migration silently drifted it — new columns were invisible to the
 * agent, renamed ones produced SQL errors. This layer reads the real schema
 * so the tool surface can never fall behind the database.
 *
 * It is also the single choke point for column redaction. `find_one_*` used
 * to run `SELECT *`, which handed staff.password_hash and venues.portal_token
 * straight to the model (and persisted them into ai_messages). Nothing reads
 * columns from this module without passing through DENIED_COLUMN.
 */

/**
 * Columns never returned to the model and never writable, on any table.
 * Validated against the live schema: matches exactly the 12 credential
 * columns and nothing else (notably NOT `last_refreshed_at`, which the
 * looser /refresh/ pattern would have swallowed).
 */
const DENIED_COLUMN =
  /(password|passwd|secret|_token$|^token$|^token_|api_key|apikey|access_key|private_key|credential|_hash$|^hash$|salt|signing)/i

export function isDeniedColumn(name: string): boolean {
  return DENIED_COLUMN.test(name)
}

export interface ColumnInfo {
  name: string
  dataType: string
  udtName: string
  nullable: boolean
  hasDefault: boolean
  /** Identity / generated / serial / gen_random_uuid() — never accept on create. */
  generated: boolean
  /** Values from a `col = ANY (ARRAY[...])` CHECK constraint, if present. */
  allowedValues?: string[]
}

export interface TableInfo {
  table: string
  columns: ColumnInfo[]
  /** Real PK from pg catalogs. Empty for junction tables with no PK. */
  primaryKey: string[]
  /** Non-denied columns, safe to SELECT. */
  readable: string[]
  /**
   * Non-denied, non-generated columns. PK columns stay writable because on
   * junction tables (ticket_assignees, client_venues) and FK-keyed tables
   * (venue_briefings) the PK *is* the payload. Callers must block PK columns
   * on UPDATE — see assertNotPrimaryKey in _records.ts.
   */
  writable: string[]
  /** Non-denied text-ish columns, usable for ILIKE free-text search. */
  searchable: string[]
  /** Writable columns that are NOT NULL and have no default — required on create. */
  requiredOnCreate: string[]
}

const TEXTISH = new Set(['text', 'character varying', 'character', 'citext'])

function isTextish(c: ColumnInfo): boolean {
  return TEXTISH.has(c.dataType)
}

/** Map a Postgres type to a JSON Schema fragment the LLM can fill correctly. */
export function jsonSchemaForColumn(c: ColumnInfo): Record<string, unknown> {
  const base: Record<string, unknown> = {}
  if (c.allowedValues?.length) {
    return { type: 'string', enum: c.allowedValues }
  }
  switch (c.dataType) {
    case 'smallint':
    case 'integer':
    case 'bigint':
      base.type = 'integer'
      break
    case 'numeric':
    case 'real':
    case 'double precision':
      base.type = 'number'
      break
    case 'boolean':
      base.type = 'boolean'
      break
    case 'date':
      base.type = 'string'
      base.description = 'YYYY-MM-DD'
      break
    case 'timestamp with time zone':
    case 'timestamp without time zone':
      base.type = 'string'
      base.description = 'ISO 8601 timestamp'
      break
    case 'time without time zone':
    case 'time with time zone':
      base.type = 'string'
      base.description = 'HH:MM or HH:MM:SS'
      break
    case 'uuid':
      base.type = 'string'
      base.description = 'UUID — look it up, never invent one'
      break
    case 'ARRAY':
      base.type = 'array'
      base.items = { type: c.udtName === '_int4' || c.udtName === '_int8' ? 'integer' : 'string' }
      break
    case 'json':
    case 'jsonb':
      base.type = 'object'
      base.additionalProperties = true
      break
    default:
      base.type = 'string'
  }
  return base
}

// ---------------------------------------------------------------------------

interface SchemaCache {
  tables: Map<string, TableInfo>
  loadedAt: number
}

let cache: SchemaCache | null = null
let inflight: Promise<SchemaCache> | null = null

/** Schema changes land via migrations on boot; a 5-minute TTL is plenty. */
const TTL_MS = 5 * 60 * 1000

/** Parse `CHECK ((status = ANY (ARRAY['new'::text, 'closed'::text])))` → { status: [...] } */
function parseCheckConstraint(def: string): { column: string; values: string[] } | null {
  const m = def.match(/\((\w+)\s*=\s*ANY\s*\(ARRAY\[(.*?)\]\)\)/s)
  if (!m) return null
  const values = [...m[2].matchAll(/'([^']*)'/g)].map(v => v[1])
  if (values.length === 0) return null
  return { column: m[1], values }
}

async function introspect(): Promise<SchemaCache> {
  const [colsRes, pkRes, checkRes] = await Promise.all([
    query(`
      SELECT table_name, column_name, data_type, udt_name,
             is_nullable, column_default, is_generated, identity_generation
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `),
    query(`
      SELECT tc.table_name, kcu.column_name, kcu.ordinal_position
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
      ORDER BY tc.table_name, kcu.ordinal_position
    `),
    query(`
      SELECT rel.relname AS table_name, pg_get_constraintdef(con.oid) AS def
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace AND n.nspname = 'public'
      WHERE con.contype = 'c'
    `),
  ])

  // column -> allowed values, per table
  const checks = new Map<string, Map<string, string[]>>()
  for (const row of checkRes.rows) {
    const parsed = parseCheckConstraint(String(row.def))
    if (!parsed) continue
    if (!checks.has(row.table_name)) checks.set(row.table_name, new Map())
    checks.get(row.table_name)!.set(parsed.column, parsed.values)
  }

  const pks = new Map<string, string[]>()
  for (const row of pkRes.rows) {
    if (!pks.has(row.table_name)) pks.set(row.table_name, [])
    pks.get(row.table_name)!.push(row.column_name)
  }

  const byTable = new Map<string, ColumnInfo[]>()
  for (const row of colsRes.rows) {
    const def: string | null = row.column_default
    const generated =
      row.is_generated === 'ALWAYS' ||
      row.identity_generation != null ||
      (def != null && /nextval\(|gen_random_uuid\(|uuid_generate/.test(def))

    const col: ColumnInfo = {
      name: row.column_name,
      dataType: row.data_type,
      udtName: row.udt_name,
      nullable: row.is_nullable === 'YES',
      hasDefault: def != null,
      generated,
      allowedValues: checks.get(row.table_name)?.get(row.column_name),
    }
    if (!byTable.has(row.table_name)) byTable.set(row.table_name, [])
    byTable.get(row.table_name)!.push(col)
  }

  const tables = new Map<string, TableInfo>()
  for (const [table, columns] of byTable) {
    const primaryKey = pks.get(table) || []
    const visible = columns.filter(c => !isDeniedColumn(c.name))
    const readable = visible.map(c => c.name)
    const writable = visible.filter(c => !c.generated).map(c => c.name)
    const searchable = visible.filter(isTextish).map(c => c.name)
    const requiredOnCreate = visible
      .filter(c => !c.generated && !c.nullable && !c.hasDefault)
      .map(c => c.name)
    tables.set(table, { table, columns, primaryKey, readable, writable, searchable, requiredOnCreate })
  }

  return { tables, loadedAt: Date.now() }
}

async function getCache(): Promise<SchemaCache> {
  if (cache && Date.now() - cache.loadedAt < TTL_MS) return cache
  if (inflight) return inflight
  inflight = introspect()
    .then(c => {
      cache = c
      return c
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export async function getTableInfo(table: string): Promise<TableInfo | null> {
  const c = await getCache()
  return c.tables.get(table) || null
}

export async function allTableNames(): Promise<string[]> {
  const c = await getCache()
  return [...c.tables.keys()].sort()
}

/** Drop the cache — call after a migration if the process stays warm. */
export function invalidateSchemaCache(): void {
  cache = null
}
