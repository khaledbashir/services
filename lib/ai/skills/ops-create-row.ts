import { NocoOps } from '@/lib/nocodb-ops'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'ops_create_records',
  description:
    'Create one or many records in a NocoDB table in the ANC Operations workspace. Pass table_id (from ops_list_tables) and a records array — each record is a field→value object using field titles as keys (e.g. { "Event": "Yankees vs Red Sox", "Status": "Planned", "Crew Size": 12 }). NocoDB accepts a bulk array, so you can create dozens of rows in a single call.',
  category: 'Service Ops',
  icon: '➕',
  parameters: {
    type: 'object',
    properties: {
      table_id: { type: 'string', description: 'NocoDB table id (from ops_list_tables)' },
      records: {
        type: 'array',
        items: { type: 'object' },
        description: 'Array of records. Each is a field-value object using column titles as keys. Pass as many as needed — NocoDB bulk-creates them in one call.',
      },
    },
    required: ['table_id', 'records'],
  },
  async handler(args) {
    if (!NocoOps.configured()) {
      return { error: 'Operations backend (NocoDB) is not configured (NOCODB_OPS_PAT missing).' }
    }
    const records = Array.isArray(args.records) ? args.records as Record<string, unknown>[] : []
    if (records.length === 0) return { error: 'records array is required and cannot be empty.' }
    const created = await NocoOps.createRecords(String(args.table_id), records)
    return { created_count: created.length, ids: created.map((c) => c.Id) }
  },
}
export default skill
