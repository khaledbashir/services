import { Noco } from '@/lib/nocodb'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'noco_query_table',
  description: 'Read rows from a NocoDB table (Nick\'s Airtable replacement). Use noco_list_tables first to discover the base_id and table_id. Supports a `where` filter using NocoDB\'s syntax, e.g. (Status,eq,Open) or (Venue,like,%Heinz%). Returns rows with all fields.',
  category: 'Service Ops',
  icon: '📊',
  parameters: {
    type: 'object',
    properties: {
      base_id: { type: 'string', description: 'NocoDB base id (from noco_list_tables)' },
      table_id: { type: 'string', description: 'NocoDB table id (from noco_list_tables)' },
      where: { type: 'string', description: 'Optional NocoDB where filter, e.g. (Status,eq,Open)~and(Venue,like,%Heinz%)' },
      sort: { type: 'string', description: 'Optional sort field; prefix with - for descending, e.g. -CreatedAt' },
      page_size: { type: 'integer', default: 25, maximum: 100 },
    },
    required: ['base_id', 'table_id'],
  },
  async handler(args) {
    if (!Noco.configured()) {
      return { error: 'NocoDB is not configured on this server (NOCODB_API_TOKEN missing).' }
    }
    const result = await Noco.listRows(String(args.base_id), String(args.table_id), {
      pageSize: Number(args.page_size) || 25,
      where: args.where ? String(args.where) : undefined,
      sort: args.sort ? String(args.sort) : undefined,
    })
    return {
      records: result.records,
      next: result.next || null,
    }
  },
}
export default skill
