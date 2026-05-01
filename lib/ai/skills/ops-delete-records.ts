import { NocoOps } from '@/lib/nocodb-ops'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'ops_delete_records',
  description:
    'Delete records from an ANC Operations table. Destructive — use ops_query_table first to confirm exactly which Ids should go. Pass table_id and an array of record Ids.',
  category: 'Service Ops',
  icon: '🗑',
  parameters: {
    type: 'object',
    properties: {
      table_id: { type: 'string', description: 'NocoDB table id' },
      ids: {
        type: 'array',
        items: { type: ['integer', 'string'] },
        description: 'Array of record Ids to delete (the "Id" field from ops_query_table results).',
      },
    },
    required: ['table_id', 'ids'],
  },
  async handler(args) {
    if (!NocoOps.configured()) return { error: 'NOCODB_OPS_PAT missing.' }
    const ids = Array.isArray(args.ids) ? args.ids as Array<number | string> : []
    if (ids.length === 0) return { error: 'ids array is required and cannot be empty.' }
    const deleted = await NocoOps.deleteRecords(String(args.table_id), ids)
    return { deleted_count: deleted.length, ids: deleted.map((d) => d.Id) }
  },
}
export default skill
