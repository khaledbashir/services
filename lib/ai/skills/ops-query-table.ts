import { NocoOps } from '@/lib/nocodb-ops'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'ops_query_table',
  description:
    'Read rows from a table in the ANC Operations workspace (NocoDB at ops.ancsports.net). Call ops_list_tables first to get table_id. Returns rows with field titles as keys. Use the where filter to narrow — NocoDB filter syntax is "(FieldName,op,value)" combined with "~and" / "~or", e.g. "(Status,eq,Open)~and(Venue,like,WMATA)". Operators: eq, neq, like, nlike, gt, lt, gte, lte, isnull, notnull, in, btw.',
  category: 'Service Ops',
  icon: '📊',
  parameters: {
    type: 'object',
    properties: {
      table_id: { type: 'string', description: 'NocoDB table id (from ops_list_tables)' },
      where: { type: 'string', description: 'NocoDB filter expression, e.g. (Status,eq,Open)~and(Venue,like,WMATA)' },
      sort: { type: 'string', description: 'Sort, e.g. "-CreatedAt,Title" (prefix - for desc)' },
      fields: { type: 'string', description: 'Comma-separated field names to include (omits the rest — saves tokens)' },
      view_id: { type: 'string', description: 'Optional view id to apply that view\'s filters/sorts' },
      limit: { type: 'integer', default: 50, maximum: 200 },
      offset: { type: 'integer', default: 0 },
    },
    required: ['table_id'],
  },
  async handler(args) {
    if (!NocoOps.configured()) {
      return { error: 'Operations backend (NocoDB) is not configured (NOCODB_OPS_PAT missing).' }
    }
    const result = await NocoOps.listRecords(String(args.table_id), {
      where: args.where ? String(args.where) : undefined,
      sort: args.sort ? String(args.sort) : undefined,
      fields: args.fields ? String(args.fields) : undefined,
      viewId: args.view_id ? String(args.view_id) : undefined,
      limit: Number(args.limit) || 50,
      offset: Number(args.offset) || 0,
    })
    return {
      records: result.records,
      total: result.pageInfo.totalRows,
      page: result.pageInfo.page,
      page_size: result.pageInfo.pageSize,
      has_more: !result.pageInfo.isLastPage,
    }
  },
}
export default skill
