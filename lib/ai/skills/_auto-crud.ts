import { query } from '@/lib/db'
import type { Skill, AgentRole } from '@/lib/ai/types'

// Auto-generates CRUD skills for every table we want the agent to reach.
// Adds, per table:
//   find_many_<plural>     — paginated search
//   find_one_<singular>    — fetch by id
//   create_<singular>      — insert
//   update_<singular>      — update by id
//   delete_<singular>      — delete by id
//
// Each entry declares: table name, singular/plural labels, allowed columns,
// text columns used for ILIKE search, optional role gate, category, icon.

interface TableSpec {
  table: string
  singular: string                      // e.g. "event"
  plural: string                        // e.g. "events"
  columns: string[]                     // writable + readable columns
  searchColumns: string[]               // used for free-text find_many
  readonlyColumns?: string[]            // allow read, block write
  requireOnCreate?: string[]            // fields that must be present
  roleRead?: Exclude<AgentRole, 'any'>
  roleWrite?: Exclude<AgentRole, 'any'>
  roleDelete?: Exclude<AgentRole, 'any'>
  category: Skill['category']
  icon: string
}

const TABLES: TableSpec[] = [
  {
    table: 'events', singular: 'event', plural: 'events',
    columns: ['venue_id', 'summary', 'league', 'event_date', 'start_time', 'end_time', 'workflow_status', 'event_type', 'source', 'requires_staffing'],
    searchColumns: ['summary', 'league'],
    requireOnCreate: ['summary', 'event_date', 'venue_id'],
    category: 'Events', icon: '📅',
    roleWrite: 'manager', roleDelete: 'admin',
  },
  {
    table: 'venues', singular: 'venue', plural: 'venues',
    columns: ['name', 'address', 'venue_type', 'timezone', 'feed_url', 'feed_type', 'slack_channel_id', 'is_active', 'requires_assignment'],
    searchColumns: ['name', 'address'],
    requireOnCreate: ['name'],
    category: 'Venues', icon: '📍',
    roleWrite: 'manager', roleDelete: 'admin',
  },
  {
    table: 'staff', singular: 'staff_member', plural: 'staff_members',
    columns: ['full_name', 'email', 'role', 'title', 'phone'],
    searchColumns: ['full_name', 'email'],
    requireOnCreate: ['full_name', 'email'],
    category: 'Staff', icon: '👤',
    roleWrite: 'admin', roleDelete: 'admin',
  },
  {
    table: 'tickets', singular: 'ticket', plural: 'tickets',
    columns: ['venue_id', 'title', 'description', 'priority', 'status', 'assigned_to', 'created_by', 'category'],
    searchColumns: ['title', 'description'],
    requireOnCreate: ['venue_id', 'title'],
    category: 'Support', icon: '🎫',
    roleWrite: 'technician', roleDelete: 'admin',
  },
  {
    table: 'design_requests', singular: 'design_request', plural: 'design_requests',
    columns: ['venue_id', 'company_name', 'client_name', 'client_email', 'job_title', 'tricode', 'ftp_proof_link', 'ftp_final_link', 'notes', 'boards_requested', 'sizes_requested', 'designer_id', 'enterprise_contact_id', 'status', 'hours_estimated', 'hours_spent', 'due_date'],
    searchColumns: ['job_title', 'company_name', 'client_name'],
    requireOnCreate: ['job_title'],
    category: 'Creative', icon: '🎨',
    roleWrite: 'technician', roleDelete: 'admin',
  },
  {
    table: 'cg_design_requests', singular: 'cg_design_request', plural: 'cg_design_requests',
    columns: ['venue_id', 'league', 'team_name', 'job_title', 'notes', 'designer_id', 'due_date', 'status'],
    searchColumns: ['job_title', 'team_name'],
    requireOnCreate: ['job_title'],
    category: 'Creative', icon: '🖼️',
    roleWrite: 'technician', roleDelete: 'admin',
  },
  {
    table: 'content_schedules', singular: 'content_schedule', plural: 'content_schedules',
    columns: ['venue_id', 'company_name', 'content_name', 'launch_date', 'end_date', 'operator_id', 'files_ready', 'status', 'notes'],
    searchColumns: ['content_name', 'company_name'],
    requireOnCreate: ['content_name'],
    category: 'Creative', icon: '📺',
    roleWrite: 'technician', roleDelete: 'admin',
  },
  {
    table: 'print_requests', singular: 'print_request', plural: 'print_requests',
    columns: ['venue_id', 'client_name', 'job_title', 'notes', 'shipping_info', 'ship_date', 'arrival_date', 'britten_cost', 'anc_cost', 'tracking_number', 'assignee_id', 'status'],
    searchColumns: ['job_title', 'client_name'],
    requireOnCreate: ['job_title'],
    category: 'Creative', icon: '🖨️',
    roleWrite: 'manager', roleDelete: 'admin',
  },
  {
    table: 'maintenance_logs', singular: 'maintenance_log', plural: 'maintenance_logs',
    columns: ['venue_id', 'asset_id', 'station_id', 'technician_id', 'maintenance_type', 'issue', 'issue_summary', 'details_to_resolve', 'status', 'reported_date', 'scheduled_date', 'completed_date', 'location_reported', 'techs_scheduled'],
    searchColumns: ['issue', 'issue_summary'],
    requireOnCreate: ['venue_id', 'issue'],
    category: 'Service Ops', icon: '🔧',
    roleWrite: 'technician', roleDelete: 'admin',
  },
  {
    table: 'walkthrough_logs', singular: 'walkthrough_log', plural: 'walkthrough_logs',
    columns: ['venue_id', 'technician_id', 'log_date', 'log_time', 'locations_visited', 'issues_found', 'result', 'in_person', 'technician_name', 'three_letter_code', 'notes'],
    searchColumns: ['locations_visited', 'issues_found', 'notes'],
    requireOnCreate: ['venue_id', 'result'],
    category: 'Service Ops', icon: '🚶',
    roleWrite: 'technician', roleDelete: 'manager',
  },
  {
    table: 'checklist_items', singular: 'checklist_item', plural: 'checklist_items',
    columns: ['venue_id', 'days_out', 'league', 'team_name', 'task_description', 'prompt', 'assignee_id', 'due_date', 'status'],
    searchColumns: ['task_description', 'team_name'],
    requireOnCreate: ['task_description'],
    category: 'Service Ops', icon: '✅',
    roleWrite: 'technician', roleDelete: 'manager',
  },
  {
    table: 'rma_trackers', singular: 'rma_tracker', plural: 'rma_trackers',
    columns: ['venue_id', 'company_name', 'client_name', 'date_received', 'project_code', 'part_number', 'part_name', 'model_number', 'led_manufacturer', 'description', 'quantities', 'repair_vendor', 'shipping_method', 'shipment_tracking', 'status'],
    searchColumns: ['description', 'part_number', 'part_name', 'project_code'],
    category: 'Service Ops', icon: '↩️',
    roleWrite: 'manager', roleDelete: 'admin',
  },
  {
    table: 'parts', singular: 'part', plural: 'parts',
    columns: ['part_number', 'part_name', 'manufacturer', 'model_name', 'description', 'unit_cost', 'quantity_on_hand', 'reorder_threshold'],
    searchColumns: ['part_name', 'part_number', 'manufacturer'],
    requireOnCreate: ['part_name'],
    category: 'Service Ops', icon: '🔩',
    roleWrite: 'manager', roleDelete: 'admin',
  },
  {
    table: 'parts_orders', singular: 'parts_order', plural: 'parts_orders',
    columns: ['venue_id', 'part_id', 'parts_needed', 'quantity', 'requestor_name', 'requestor_email', 'shipping_address', 'notes', 'status'],
    searchColumns: ['parts_needed', 'requestor_name'],
    requireOnCreate: ['parts_needed'],
    category: 'Service Ops', icon: '📦',
    roleWrite: 'technician', roleDelete: 'manager',
  },
  {
    table: 'inventory', singular: 'inventory_asset', plural: 'inventory_assets',
    columns: ['venue_id', 'item_name', 'sku', 'quantity', 'threshold_low', 'manufacturer', 'model_name', 'model_number', 'ip_address', 'location_code', 'screen_number', 'display_type', 'install_phase'],
    searchColumns: ['item_name', 'sku', 'manufacturer', 'model_name'],
    requireOnCreate: ['venue_id', 'item_name'],
    category: 'Service Ops', icon: '🗄️',
    roleWrite: 'manager', roleDelete: 'admin',
  },
  {
    table: 'designer_hours_budgets', singular: 'hours_budget', plural: 'hours_budgets',
    columns: ['client_name', 'venue_id', 'league', 'season', 'total_hours', 'contract_start', 'contract_end', 'notes'],
    searchColumns: ['client_name', 'season'],
    requireOnCreate: ['client_name', 'total_hours'],
    category: 'Creative', icon: '⏱️',
    roleWrite: 'manager', roleDelete: 'admin',
  },
  {
    table: 'designer_time_entries', singular: 'time_entry', plural: 'time_entries',
    columns: ['budget_id', 'designer_id', 'design_request_id', 'entry_date', 'hours', 'description'],
    searchColumns: ['description'],
    requireOnCreate: ['hours'],
    category: 'Creative', icon: '⌛',
    roleWrite: 'technician', roleDelete: 'manager',
  },
]

function jsonTypeForColumn(col: string): Record<string, unknown> {
  // Cheap heuristic; we don't introspect pg types for every table.
  if (/_id$/.test(col) || col === 'id') return { type: 'string' }
  if (/^(date|start_time|end_time|due_date|ship_date|arrival_date|contract_start|contract_end|completed_date|scheduled_date|reported_date|entry_date|launch_date|last_updated)$/.test(col)) {
    return { type: 'string', description: 'YYYY-MM-DD (or ISO timestamp for *_time)' }
  }
  if (/^(hours|hours_spent|hours_estimated|total_hours|quantity|quantities|quantity_on_hand|threshold_low|reorder_threshold|britten_cost|anc_cost|unit_cost|days_out)$/.test(col)) {
    return { type: 'number' }
  }
  if (/^(is_active|in_person|files_ready|requires_staffing|requires_assignment|remit_to_stock)$/.test(col)) {
    return { type: 'boolean' }
  }
  return { type: 'string' }
}

function buildPropsSchema(cols: string[]) {
  const props: Record<string, unknown> = {}
  for (const c of cols) props[c] = jsonTypeForColumn(c)
  return props
}

function skillsForTable(spec: TableSpec): Skill[] {
  const { table, singular, plural, columns, searchColumns, category, icon } = spec

  const findMany: Skill = {
    name: `find_many_${plural}`,
    description: `Search ${plural.replace(/_/g, ' ')} by free text across ${searchColumns.join(', ')}. Returns paginated rows.`,
    category, icon,
    parameters: {
      type: 'object',
      properties: {
        q: { type: 'string', description: `Search term matched against ${searchColumns.join(', ')}` },
        limit: { type: 'integer', default: 20, maximum: 100 },
      },
    },
    role: spec.roleRead,
    async handler(args) {
      const limit = Math.min(Math.max(Number(args.limit) || 20, 1), 100)
      const selectCols = columns.join(', ')
      if (args.q && searchColumns.length > 0) {
        const likeClauses = searchColumns.map((c, i) => `COALESCE(${c}::text, '') ILIKE $${i + 1}`).join(' OR ')
        const params = searchColumns.map(() => `%${args.q}%`)
        params.push(String(limit))
        const r = await query(
          `SELECT id, ${selectCols} FROM ${table} WHERE ${likeClauses} ORDER BY id DESC LIMIT $${params.length}`,
          params
        )
        return { rows: r.rows, count: r.rows.length }
      }
      const r = await query(`SELECT id, ${selectCols} FROM ${table} ORDER BY id DESC LIMIT $1`, [limit])
      return { rows: r.rows, count: r.rows.length }
    },
  }

  const findOne: Skill = {
    name: `find_one_${singular}`,
    description: `Get a single ${singular.replace(/_/g, ' ')} by id.`,
    category, icon,
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    role: spec.roleRead,
    async handler(args) {
      const r = await query(`SELECT * FROM ${table} WHERE id = $1`, [args.id])
      return r.rows[0] || { ok: false, error: 'not found' }
    },
  }

  const writable = columns.filter(c => !(spec.readonlyColumns || []).includes(c))
  const create: Skill = {
    name: `create_${singular}`,
    description: `Create a new ${singular.replace(/_/g, ' ')}. Required: ${(spec.requireOnCreate || []).join(', ') || '(none)'}`,
    category, icon,
    parameters: {
      type: 'object',
      properties: buildPropsSchema(writable),
      required: spec.requireOnCreate || [],
    },
    role: spec.roleWrite,
    async handler(args) {
      const provided = writable.filter(c => args[c] !== undefined)
      if (provided.length === 0) return { ok: false, error: 'no fields provided' }
      const placeholders = provided.map((_, i) => `$${i + 1}`).join(', ')
      const values = provided.map(c => args[c] === '' ? null : args[c])
      const r = await query(
        `INSERT INTO ${table} (${provided.join(', ')}) VALUES (${placeholders}) RETURNING *`,
        values
      )
      return { row: r.rows[0], _ui_action: { type: 'refresh' } }
    },
  }

  const update: Skill = {
    name: `update_${singular}`,
    description: `Update fields of an existing ${singular.replace(/_/g, ' ')}.`,
    category, icon,
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' }, ...buildPropsSchema(writable) },
      required: ['id'],
    },
    role: spec.roleWrite,
    async handler(args) {
      const provided = writable.filter(c => args[c] !== undefined)
      if (provided.length === 0) return { ok: false, error: 'no fields to update' }
      const setClauses = provided.map((c, i) => `${c} = $${i + 1}`).join(', ')
      const values = provided.map(c => args[c] === '' ? null : args[c])
      values.push(args.id)
      const r = await query(
        `UPDATE ${table} SET ${setClauses} WHERE id = $${values.length} RETURNING *`,
        values
      )
      return r.rows[0] ? { row: r.rows[0], _ui_action: { type: 'refresh' } } : { ok: false, error: 'not found' }
    },
  }

  const del: Skill = {
    name: `delete_${singular}`,
    description: `Delete a ${singular.replace(/_/g, ' ')} by id.`,
    category, icon,
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    role: spec.roleDelete,
    async handler(args) {
      const r = await query(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [args.id])
      return r.rows[0] ? { ok: true, id: r.rows[0].id, _ui_action: { type: 'refresh' } } : { ok: false, error: 'not found' }
    },
  }

  return [findMany, findOne, create, update, del]
}

export function autoCrudSkills(): Skill[] {
  return TABLES.flatMap(skillsForTable)
}
