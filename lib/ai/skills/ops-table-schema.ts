import { NocoOps } from '@/lib/nocodb-ops'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'ops_table_schema',
  description:
    'Get the column schema + view list for a NocoDB table — exact column titles, types (uidt: SingleSelect / Date / Number / Attachment / etc.), select-option values, and the table\'s saved views. Call this BEFORE ops_create_records / ops_update_records when you don\'t know the exact field names + accepted values, so you don\'t get validation errors.',
  category: 'Service Ops',
  icon: '🧬',
  parameters: {
    type: 'object',
    properties: {
      table_id: { type: 'string', description: 'NocoDB table id' },
    },
    required: ['table_id'],
  },
  async handler(args) {
    if (!NocoOps.configured()) return { error: 'NOCODB_OPS_PAT missing.' }
    const tableId = String(args.table_id)
    const [t, views] = await Promise.all([
      NocoOps.getTable(tableId),
      NocoOps.listViews(tableId),
    ])
    const VIEW_TYPES: Record<number, string> = { 1: 'Form', 2: 'Gallery', 3: 'Grid', 4: 'Kanban', 5: 'Map', 6: 'Calendar' }
    return {
      table: { id: t.id, title: t.title, base_id: t.base_id },
      columns: (t.columns || []).map((c) => ({
        title: c.title,
        type: c.uidt,
        is_primary: !!c.pv,
        select_options: c.colOptions?.options?.map((o) => o.title),
      })),
      views: (views || []).map((v) => ({ id: v.id, title: v.title, type: VIEW_TYPES[v.type] || `type_${v.type}` })),
    }
  },
}
export default skill
