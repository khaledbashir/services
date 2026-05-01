import { NocoOps } from '@/lib/nocodb-ops'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'ops_update_records',
  description:
    'Bulk-update records in an ANC Operations table. Pass table_id and an array of {Id, ...fields_to_change} — NocoDB updates them all in one call. Use ops_query_table first to find the records you want to update and grab their Ids. Example: change all "Open" issues at WMATA to "In Progress" → query first, then ops_update_records with [{Id:1, Status:"In Progress"}, {Id:5, Status:"In Progress"}, …].',
  category: 'Service Ops',
  icon: '✏️',
  parameters: {
    type: 'object',
    properties: {
      table_id: { type: 'string', description: 'NocoDB table id' },
      updates: {
        type: 'array',
        items: { type: 'object' },
        description: 'Array of update objects. Each MUST include "Id" plus any fields to change. Example: [{"Id": 12, "Status": "Done"}, {"Id": 15, "Status": "Done", "Notes": "Closed by AI"}]',
      },
    },
    required: ['table_id', 'updates'],
  },
  async handler(args) {
    if (!NocoOps.configured()) return { error: 'NOCODB_OPS_PAT missing.' }
    const updates = Array.isArray(args.updates) ? args.updates as Array<{ Id: number | string } & Record<string, unknown>> : []
    if (updates.length === 0) return { error: 'updates array is required and cannot be empty.' }
    if (updates.some((u) => u.Id == null)) return { error: 'Every update object must include an "Id" field.' }
    const updated = await NocoOps.updateRecords(String(args.table_id), updates)
    return { updated_count: updated.length, ids: updated.map((u) => u.Id) }
  },
}
export default skill
