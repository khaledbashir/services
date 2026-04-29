import { Baserow } from '@/lib/baserow'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'ops_query_table',
  description: 'Read rows from an Operations table (Baserow). Use ops_list_tables first to discover the table_id. Returns rows with field names as keys (user_field_names=true is always on).',
  category: 'Service Ops',
  icon: '📊',
  parameters: {
    type: 'object',
    properties: {
      table_id: { type: 'integer', description: 'Baserow table id (from ops_list_tables)' },
      search: { type: 'string', description: 'Optional full-text search across all string fields' },
      order_by: { type: 'string', description: 'Optional sort, e.g. "Status,-CreatedAt" (prefix - for desc)' },
      page_size: { type: 'integer', default: 50, maximum: 200 },
    },
    required: ['table_id'],
  },
  async handler(args) {
    if (!Baserow.configured()) {
      return { error: 'Operations backend (Baserow) is not configured (BASEROW_API_TOKEN missing).' }
    }
    const result = await Baserow.listRows(Number(args.table_id), {
      size: Number(args.page_size) || 50,
      search: args.search ? String(args.search) : undefined,
      orderBy: args.order_by ? String(args.order_by) : undefined,
    })
    return {
      records: result.results,
      count: result.count,
      has_more: !!result.next,
    }
  },
}
export default skill
