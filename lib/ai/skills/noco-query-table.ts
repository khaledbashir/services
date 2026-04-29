import { Noco } from '@/lib/nocodb'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'noco_query_table',
  description: 'Read rows from a NocoDB table (Nick\'s Airtable replacement). Use noco_list_tables first to discover the table_id. Supports a `where` filter using NocoDB\'s syntax, e.g. (Status,eq,Open) or (Venue,like,%Heinz%). Returns rows with all fields.',
  category: 'Service Ops',
  icon: '📊',
  parameters: {
    type: 'object',
    properties: {
      table_id: { type: 'string', description: 'NocoDB table id (from noco_list_tables)' },
      where: { type: 'string', description: 'Optional NocoDB where filter, e.g. (Status,eq,Open)~and(Venue,like,%Heinz%)' },
      sort: { type: 'string', description: 'Optional sort field; prefix with - for descending, e.g. -CreatedAt' },
      limit: { type: 'integer', default: 25, maximum: 100 },
    },
    required: ['table_id'],
  },
  async handler(args) {
    if (!Noco.configured()) {
      return { error: 'NocoDB is not configured on this server (NOCODB_API_TOKEN missing).' }
    }
    const result = await Noco.listRows(String(args.table_id), {
      limit: Number(args.limit) || 25,
      where: args.where ? String(args.where) : undefined,
      sort: args.sort ? String(args.sort) : undefined,
    })
    return {
      rows: result.list,
      total: result.pageInfo.totalRows,
      page_size: result.pageInfo.pageSize,
      is_last_page: result.pageInfo.isLastPage,
    }
  },
}
export default skill
