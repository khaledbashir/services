import { Baserow } from '@/lib/baserow'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'ops_create_row',
  description: 'Create a new row in an Operations table (Baserow). Pass table_id (from ops_list_tables) and a fields object whose keys match the table\'s column names exactly. Returns the created row with its id.',
  category: 'Service Ops',
  icon: '➕',
  parameters: {
    type: 'object',
    properties: {
      table_id: { type: 'integer', description: 'Baserow table id (from ops_list_tables)' },
      fields: {
        type: 'object',
        description: 'Field-value pairs. Keys must match column names exactly. Example: { "Name": "Display offline", "Status": "Open", "Venue": "Heinz Athletic Center" }',
      },
    },
    required: ['table_id', 'fields'],
  },
  async handler(args) {
    if (!Baserow.configured()) {
      return { error: 'Operations backend (Baserow) is not configured (BASEROW_API_TOKEN missing).' }
    }
    const fields = (args.fields && typeof args.fields === 'object') ? args.fields as Record<string, unknown> : {}
    if (Object.keys(fields).length === 0) {
      return { error: 'fields object is required and cannot be empty.' }
    }
    const created = await Baserow.createRow(Number(args.table_id), fields)
    return { created }
  },
}
export default skill
