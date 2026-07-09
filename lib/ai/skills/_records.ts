import { query } from '@/lib/db'
import { SkillError, roleAtLeast, type Skill, type SkillContext, type AgentRole } from '@/lib/ai/types'
import { getTableInfo, jsonSchemaForColumn, type TableInfo } from '@/lib/ai/schema'
import {
  TABLE_POLICIES,
  getPolicy,
  primaryPolicies,
  canDelete,
  canWrite,
  deleteRole,
  writeRole,
  type TablePolicy,
} from '@/lib/ai/table-policy'

/**
 * Generic, schema-aware record tools.
 *
 * These replace the 85 hand-written per-table CRUD skills that used to live
 * in _auto-crud.ts. Seven tools now cover every table in table-policy.ts
 * (75 and counting) instead of five tools covering seventeen.
 *
 * The reason is not elegance, it's accuracy: the model was already being
 * handed ~131 tool definitions. Growing per-table CRUD to full coverage
 * would have pushed it past 300, and tool-selection quality falls off a
 * cliff well before that. Fewer tools + a table catalog in the system
 * prompt beats a tool per table.
 *
 * Safety model:
 *   - table must appear in TABLE_POLICIES (allowlist; anything else is invisible)
 *   - every column identifier is checked against the introspected column list
 *     before it reaches SQL — identifiers are never interpolated from raw input
 *   - all values are parameterized
 *   - denied columns (credentials/tokens) are stripped by lib/ai/schema.ts and
 *     can be neither read nor written
 *   - role is enforced per-table in the handler, since one tool spans many tables
 */

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 20

/** Operators the model may use in `filters`. Keys are validated, never interpolated. */
const OPERATORS: Record<string, string> = {
  eq: '=',
  neq: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'ILIKE',
}

interface Ctx extends SkillContext {}

// ---------------------------------------------------------------------------
// Guards

function policyOrThrow(table: unknown): TablePolicy {
  const name = String(table || '')
  const policy = getPolicy(name)
  if (!policy) {
    throw new SkillError(
      'unknown_table',
      `Table "${name}" is not available to the assistant.`,
      'Call list_data_tables to see what you can read and write.'
    )
  }
  return policy
}

async function infoOrThrow(table: string): Promise<TableInfo> {
  const info = await getTableInfo(table)
  if (!info) {
    throw new SkillError('unknown_table', `Table "${table}" does not exist in the database.`)
  }
  return info
}

function assertRole(userRole: AgentRole, minimum: Exclude<AgentRole, 'any'> | undefined, action: string, table: string) {
  if (!roleAtLeast(userRole, minimum)) {
    throw new SkillError(
      'permission_denied',
      `Your role (${userRole}) cannot ${action} ${table}. Requires ${minimum}.`,
      'Ask a manager or admin to perform this.'
    )
  }
}

function assertWritable(policy: TablePolicy, userRole: AgentRole, action: 'create' | 'update') {
  if (!canWrite(policy)) {
    throw new SkillError('read_only', `${policy.table} is read-only.`, 'This table is an audit trail or derived data.')
  }
  assertRole(userRole, writeRole(policy), action, policy.table)
}

/** Validate a column identifier against the introspected list. Blocks injection AND typos. */
function assertColumn(info: TableInfo, col: string, kind: 'readable' | 'writable'): string {
  const allowed = kind === 'readable' ? info.readable : info.writable
  if (!allowed.includes(col)) {
    throw new SkillError(
      'unknown_column',
      `Column "${col}" is not ${kind} on ${info.table}.`,
      `Call describe_data_table for ${info.table} to see valid columns.`
    )
  }
  return col
}

function assertNotPrimaryKey(info: TableInfo, col: string) {
  if (info.primaryKey.includes(col)) {
    throw new SkillError(
      'immutable_column',
      `Column "${col}" is part of the primary key of ${info.table} and cannot be changed.`,
      'Delete the row and create a new one instead.'
    )
  }
}

// ---------------------------------------------------------------------------
// Helpers

const LABEL_CANDIDATES = [
  'name', 'title', 'job_title', 'summary', 'full_name', 'content_name',
  'item_name', 'part_name', 'task_description', 'issue', 'subject', 'label',
  'company_name', 'client_name', 'team_name', 'result',
]

function pickLabelColumn(info: TableInfo): string | undefined {
  return LABEL_CANDIDATES.find(c => info.readable.includes(c))
}

function deepLink(
  policy: TablePolicy,
  info: TableInfo,
  row: Record<string, unknown>,
  verb: 'Created' | 'Updated' | 'Found'
): { link?: string; text_summary?: string } {
  if (!policy.pagePath || !row?.id) return {}
  const link = `${policy.pagePath}/${row.id}`
  const labelCol = pickLabelColumn(info)
  const raw = labelCol && row[labelCol] != null ? String(row[labelCol]) : String(row.id)
  const label = raw.length > 60 ? `${raw.slice(0, 60)}…` : raw
  return { link, text_summary: `${verb} ${policy.table.replace(/_/g, ' ')} "${label}" — [open →](${link})` }
}

/** Build a parameterized WHERE from a { column: value } object keyed on real columns. */
function buildWhere(
  info: TableInfo,
  where: Record<string, unknown>,
  params: unknown[]
): string {
  const keys = Object.keys(where || {})
  if (keys.length === 0) {
    throw new SkillError('missing_where', `A "where" object is required for ${info.table}.`, `Primary key: ${info.primaryKey.join(', ') || '(none)'}`)
  }
  const clauses = keys.map(k => {
    assertColumn(info, k, 'readable')
    const v = where[k]
    if (v === null) return `${k} IS NULL`
    params.push(v)
    return `${k} = $${params.length}`
  })
  return clauses.join(' AND ')
}

/** Build the filter clauses for find_records. Supports scalars and {op, value}. */
function buildFilters(info: TableInfo, filters: Record<string, unknown>, params: unknown[]): string[] {
  const clauses: string[] = []
  for (const [col, spec] of Object.entries(filters || {})) {
    assertColumn(info, col, 'readable')
    if (spec === null) {
      clauses.push(`${col} IS NULL`)
      continue
    }
    if (typeof spec === 'object' && spec !== null && 'op' in (spec as Record<string, unknown>)) {
      const { op, value } = spec as { op: string; value: unknown }
      if (op === 'is_null') {
        clauses.push(`${col} IS ${value === false ? 'NOT ' : ''}NULL`)
        continue
      }
      if (op === 'in') {
        const arr = Array.isArray(value) ? value : [value]
        if (arr.length === 0) {
          clauses.push('FALSE')
          continue
        }
        const placeholders = arr.map(v => {
          params.push(v)
          return `$${params.length}`
        })
        clauses.push(`${col} IN (${placeholders.join(', ')})`)
        continue
      }
      const sqlOp = OPERATORS[op]
      if (!sqlOp) {
        throw new SkillError('bad_operator', `Unsupported operator "${op}".`, `Use one of: ${Object.keys(OPERATORS).join(', ')}, in, is_null.`)
      }
      params.push(op === 'like' ? `%${value}%` : value)
      clauses.push(`${col} ${sqlOp} $${params.length}`)
      continue
    }
    params.push(spec)
    clauses.push(`${col} = $${params.length}`)
  }
  return clauses
}

// ---------------------------------------------------------------------------
// Tools

const listTables: Skill = {
  name: 'list_data_tables',
  description:
    'List every data table the assistant can reach, with what each is for and whether it is writable. Use when you are unsure which table holds something.',
  category: 'System',
  icon: '🗂️',
  parameters: {
    type: 'object',
    properties: {
      category: { type: 'string', description: 'Optional filter, e.g. "Marketing", "Support", "Creative".' },
    },
  },
  async handler(args) {
    const wanted = args.category ? String(args.category).toLowerCase() : null
    const rows = TABLE_POLICIES.filter(p => !wanted || p.category.toLowerCase() === wanted).map(p => ({
      table: p.table,
      purpose: p.purpose,
      category: p.category,
      writable: canWrite(p),
      deletable: canDelete(p),
      page: p.pagePath,
    }))
    return { rows, count: rows.length }
  },
}

const describeTable: Skill = {
  name: 'describe_data_table',
  description:
    'Get the real columns, types, required fields, valid status values and primary key of a table. Call this before create_record or update_record on any table you have not written to before.',
  category: 'System',
  icon: '🔬',
  parameters: {
    type: 'object',
    properties: { table: { type: 'string' } },
    required: ['table'],
  },
  async handler(args, ctx) {
    const policy = policyOrThrow(args.table)
    assertRole(ctx.userRole, policy.read, 'read', policy.table)
    const info = await infoOrThrow(policy.table)
    return {
      table: info.table,
      purpose: policy.purpose,
      primary_key: info.primaryKey,
      writable: canWrite(policy),
      deletable: canDelete(policy),
      required_on_create: canWrite(policy) ? info.requiredOnCreate : [],
      page: policy.pagePath,
      columns: info.columns
        .filter(c => info.readable.includes(c.name))
        .map(c => ({
          name: c.name,
          type: c.dataType,
          nullable: c.nullable,
          writable: info.writable.includes(c.name),
          allowed_values: c.allowedValues,
        })),
    }
  },
}

const findRecords: Skill = {
  name: 'find_records',
  description:
    'Search any data table. `q` does a free-text match across its text columns; `filters` does exact/range matching. Always read `total_count` for "how many" questions — never count the returned rows.',
  category: 'System',
  icon: '🔍',
  parameters: {
    type: 'object',
    properties: {
      table: { type: 'string', description: 'Table name from list_data_tables.' },
      q: { type: 'string', description: 'Free-text search across the table\'s text columns.' },
      filters: {
        type: 'object',
        additionalProperties: true,
        description:
          'Exact match {"status":"new"}, or an operator {"event_date":{"op":"gte","value":"2026-07-01"}}. Operators: eq, neq, gt, gte, lt, lte, like, in, is_null.',
      },
      order_by: { type: 'string', description: 'Column to sort by.' },
      order_dir: { type: 'string', enum: ['asc', 'desc'] },
      limit: { type: 'integer', default: DEFAULT_LIMIT, maximum: MAX_LIMIT },
      offset: { type: 'integer', default: 0 },
    },
    required: ['table'],
  },
  async handler(args, ctx: Ctx) {
    const policy = policyOrThrow(args.table)
    assertRole(ctx.userRole, policy.read, 'read', policy.table)
    const info = await infoOrThrow(policy.table)

    const params: unknown[] = []
    const clauses: string[] = []

    if (args.filters && typeof args.filters === 'object') {
      clauses.push(...buildFilters(info, args.filters as Record<string, unknown>, params))
    }

    if (args.q) {
      // Cap the ILIKE fan-out; searching 40 text columns helps nobody.
      const cols = info.searchable.slice(0, 8)
      if (cols.length > 0) {
        params.push(`%${args.q}%`)
        const p = `$${params.length}`
        clauses.push(`(${cols.map(c => `COALESCE(${c}::text,'') ILIKE ${p}`).join(' OR ')})`)
      }
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

    let orderBy = info.primaryKey[0] || info.readable[0]
    if (args.order_by) orderBy = assertColumn(info, String(args.order_by), 'readable')
    const orderDir = String(args.order_dir || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC'

    const limit = Math.min(Math.max(Number(args.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT)
    const offset = Math.max(Number(args.offset) || 0, 0)

    const [countRes, rowsRes] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total_count FROM ${info.table} ${where}`, params),
      query(
        `SELECT ${info.readable.join(', ')} FROM ${info.table} ${where} ORDER BY ${orderBy} ${orderDir} LIMIT ${limit} OFFSET ${offset}`,
        params
      ),
    ])

    const total = Number(countRes.rows[0]?.total_count || 0)
    return {
      table: info.table,
      rows: rowsRes.rows,
      count: total,
      total_count: total,
      returned_count: rowsRes.rows.length,
    }
  },
}

const getRecord: Skill = {
  name: 'get_record',
  description:
    'Fetch one row by its primary key. Pass `where` as the primary-key columns, e.g. {"id":"..."} or {"ticket_id":"...","staff_id":"..."} for join tables.',
  category: 'System',
  icon: '📄',
  parameters: {
    type: 'object',
    properties: {
      table: { type: 'string' },
      where: { type: 'object', additionalProperties: true, description: 'Primary-key columns and values.' },
    },
    required: ['table', 'where'],
  },
  async handler(args, ctx: Ctx) {
    const policy = policyOrThrow(args.table)
    assertRole(ctx.userRole, policy.read, 'read', policy.table)
    const info = await infoOrThrow(policy.table)

    const params: unknown[] = []
    const where = buildWhere(info, args.where as Record<string, unknown>, params)
    const r = await query(`SELECT ${info.readable.join(', ')} FROM ${info.table} WHERE ${where} LIMIT 1`, params)
    const row = r.rows[0]
    if (!row) throw new SkillError('not_found', `No ${info.table} row matched.`, 'Use find_records to locate it first.')
    return { table: info.table, row, ...deepLink(policy, info, row, 'Found') }
  },
}

const createRecord: Skill = {
  name: 'create_record',
  description:
    'Insert a row into any writable table. Call describe_data_table first to learn the required fields and valid status values. Never invent UUIDs — look up foreign keys with find_records.',
  category: 'System',
  icon: '➕',
  parameters: {
    type: 'object',
    properties: {
      table: { type: 'string' },
      values: { type: 'object', additionalProperties: true, description: 'Column → value map.' },
    },
    required: ['table', 'values'],
  },
  async handler(args, ctx: Ctx) {
    const policy = policyOrThrow(args.table)
    assertWritable(policy, ctx.userRole, 'create')
    const info = await infoOrThrow(policy.table)

    const values = (args.values || {}) as Record<string, unknown>
    const cols = Object.keys(values).filter(c => values[c] !== undefined)
    if (cols.length === 0) throw new SkillError('no_fields', 'No fields provided.')
    cols.forEach(c => assertColumn(info, c, 'writable'))

    const missing = info.requiredOnCreate.filter(c => !cols.includes(c))
    if (missing.length > 0) {
      throw new SkillError('missing_required', `Missing required field(s): ${missing.join(', ')}.`, `Call describe_data_table for ${info.table}.`)
    }

    const params = cols.map(c => (values[c] === '' ? null : values[c]))
    const placeholders = cols.map((_, i) => `$${i + 1}`)
    const r = await query(
      `INSERT INTO ${info.table} (${cols.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING ${info.readable.join(', ')}`,
      params
    )
    const row = r.rows[0]
    return { table: info.table, row, ...deepLink(policy, info, row, 'Created'), _ui_action: { type: 'refresh' } }
  },
}

const updateRecord: Skill = {
  name: 'update_record',
  description:
    'Update columns on an existing row. `where` selects the row (usually its primary key); `values` are the changes. Status changes go through here.',
  category: 'System',
  icon: '✏️',
  parameters: {
    type: 'object',
    properties: {
      table: { type: 'string' },
      where: { type: 'object', additionalProperties: true, description: 'Primary-key columns and values.' },
      values: { type: 'object', additionalProperties: true, description: 'Column → new value map.' },
    },
    required: ['table', 'where', 'values'],
  },
  async handler(args, ctx: Ctx) {
    const policy = policyOrThrow(args.table)
    assertWritable(policy, ctx.userRole, 'update')
    const info = await infoOrThrow(policy.table)

    const values = (args.values || {}) as Record<string, unknown>
    const cols = Object.keys(values).filter(c => values[c] !== undefined)
    if (cols.length === 0) throw new SkillError('no_fields', 'No fields to update.')
    cols.forEach(c => {
      assertColumn(info, c, 'writable')
      assertNotPrimaryKey(info, c)
    })

    const params: unknown[] = cols.map(c => (values[c] === '' ? null : values[c]))
    const setSql = cols.map((c, i) => `${c} = $${i + 1}`).join(', ')
    const whereSql = buildWhere(info, args.where as Record<string, unknown>, params)

    const r = await query(
      `UPDATE ${info.table} SET ${setSql} WHERE ${whereSql} RETURNING ${info.readable.join(', ')}`,
      params
    )
    const row = r.rows[0]
    if (!row) throw new SkillError('not_found', `No ${info.table} row matched the where clause.`)
    return { table: info.table, row, ...deepLink(policy, info, row, 'Updated'), _ui_action: { type: 'refresh' } }
  },
}

const deleteRecord: Skill = {
  name: 'delete_record',
  description:
    'Delete a row. Only permitted on tables marked deletable, and only for sufficiently privileged roles. Confirm with the user before calling this.',
  category: 'System',
  icon: '🗑️',
  parameters: {
    type: 'object',
    properties: {
      table: { type: 'string' },
      where: { type: 'object', additionalProperties: true, description: 'Primary-key columns and values.' },
    },
    required: ['table', 'where'],
  },
  async handler(args, ctx: Ctx) {
    const policy = policyOrThrow(args.table)
    if (!canDelete(policy)) {
      throw new SkillError('delete_forbidden', `Rows in ${policy.table} cannot be deleted by the assistant.`, 'Update a status field instead.')
    }
    assertRole(ctx.userRole, deleteRole(policy), 'delete from', policy.table)
    const info = await infoOrThrow(policy.table)

    const params: unknown[] = []
    const whereSql = buildWhere(info, args.where as Record<string, unknown>, params)
    const r = await query(`DELETE FROM ${info.table} WHERE ${whereSql} RETURNING ${info.readable.join(', ')}`, params)
    if (r.rows.length === 0) throw new SkillError('not_found', `No ${info.table} row matched.`)
    return { table: info.table, deleted_count: r.rows.length, _ui_action: { type: 'refresh' } }
  },
}

// ---------------------------------------------------------------------------
// Named CRUD for the hot tables. Same engine, friendlier surface.
//
// These take flat, individually-typed column arguments rather than a freeform
// `values` object, because the schema is introspected: the model sees real
// types, real required fields, and real status enums pulled from the table's
// CHECK constraints. A generic {values: object} would throw that away.

function pick(args: Record<string, unknown>, allowed: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of allowed) if (args[k] !== undefined) out[k] = args[k]
  return out
}

async function namedSkillsFor(policy: TablePolicy): Promise<Skill[]> {
  const { singular, plural, category, icon, table } = policy
  if (!singular || !plural) return []
  const info = await getTableInfo(table)
  if (!info) return []

  const noun = singular.replace(/_/g, ' ')
  const writableCols = info.writable
  const updatableCols = writableCols.filter(c => !info.primaryKey.includes(c))

  const propsFor = (cols: string[]) => {
    const props: Record<string, unknown> = {}
    for (const c of info.columns) {
      if (cols.includes(c.name)) props[c.name] = jsonSchemaForColumn(c)
    }
    return props
  }

  const findMany: Skill = {
    name: `find_many_${plural}`,
    description: `Search ${plural.replace(/_/g, ' ')} by free text, with optional exact/range filters. Read total_count for "how many" questions — never count the returned rows.`,
    category, icon,
    role: policy.read,
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string', description: `Free-text match across ${info.searchable.slice(0, 5).join(', ')}` },
        filters: {
          type: 'object',
          additionalProperties: true,
          description: 'Exact {"status":"new"} or operator {"event_date":{"op":"gte","value":"2026-07-01"}}.',
        },
        order_by: { type: 'string' },
        order_dir: { type: 'string', enum: ['asc', 'desc'] },
        limit: { type: 'integer', default: DEFAULT_LIMIT, maximum: MAX_LIMIT },
      },
    },
    handler: (args, ctx) => findRecords.handler({ ...args, table }, ctx),
  }

  const findOne: Skill = {
    name: `find_one_${singular}`,
    description: `Get a single ${noun} by id.`,
    category, icon,
    role: policy.read,
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: (args, ctx) => getRecord.handler({ table, where: { id: args.id } }, ctx),
  }

  const create: Skill = {
    name: `create_${singular}`,
    description: `Create a new ${noun}.${info.requiredOnCreate.length ? ` Required: ${info.requiredOnCreate.join(', ')}.` : ''} Resolve foreign keys with find_many_* first — never invent a UUID.`,
    category, icon,
    role: writeRole(policy),
    parameters: { type: 'object', properties: propsFor(writableCols), required: info.requiredOnCreate },
    handler: (args, ctx) => createRecord.handler({ table, values: pick(args, writableCols) }, ctx),
  }

  const update: Skill = {
    name: `update_${singular}`,
    description: `Update fields on an existing ${noun}, including its status.`,
    category, icon,
    role: writeRole(policy),
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' }, ...propsFor(updatableCols) },
      required: ['id'],
    },
    handler: (args, ctx) =>
      updateRecord.handler({ table, where: { id: args.id }, values: pick(args, updatableCols) }, ctx),
  }

  const remove: Skill = {
    name: `delete_${singular}`,
    description: `Delete a ${noun} by id. Confirm with the user first.`,
    category, icon,
    role: deleteRole(policy),
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: (args, ctx) => deleteRecord.handler({ table, where: { id: args.id } }, ctx),
  }

  return canDelete(policy) ? [findMany, findOne, create, update, remove] : [findMany, findOne, create, update]
}

export async function recordSkills(): Promise<Skill[]> {
  const named = await Promise.all(primaryPolicies().map(namedSkillsFor))
  return [
    listTables,
    describeTable,
    findRecords,
    getRecord,
    createRecord,
    updateRecord,
    deleteRecord,
    ...named.flat(),
  ]
}

/**
 * Compact table catalog embedded in the system prompt. Giving the model the
 * table names up-front means it rarely has to spend a turn on
 * list_data_tables before it can act.
 */
export function tableCatalogForPrompt(): string {
  const byCategory = new Map<string, TablePolicy[]>()
  for (const p of TABLE_POLICIES) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, [])
    byCategory.get(p.category)!.push(p)
  }
  const lines: string[] = []
  for (const [category, policies] of byCategory) {
    lines.push(`${category}:`)
    for (const p of policies) {
      const flags = p.readOnly ? ' (read-only)' : ''
      lines.push(`  ${p.table}${flags} — ${p.purpose}`)
    }
  }
  return lines.join('\n')
}
