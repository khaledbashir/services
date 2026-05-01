import { NocoOps } from '@/lib/nocodb-ops'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'ops_count_records',
  description:
    'Count records in an ANC Operations table, optionally with a filter. Cheap — returns just the number, no row data. Use this before answering "how many" questions instead of querying and counting client-side.',
  category: 'Service Ops',
  icon: '🔢',
  parameters: {
    type: 'object',
    properties: {
      table_id: { type: 'string', description: 'NocoDB table id' },
      where: { type: 'string', description: 'Optional NocoDB filter, e.g. (Status,eq,Open)' },
    },
    required: ['table_id'],
  },
  async handler(args) {
    if (!NocoOps.configured()) return { error: 'NOCODB_OPS_PAT missing.' }
    const count = await NocoOps.countRecords(String(args.table_id), args.where ? String(args.where) : undefined)
    return { count, where: args.where || null }
  },
}
export default skill
