import { Noco } from '@/lib/nocodb'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'noco_create_row',
  description: 'Create a new row in a NocoDB table. Pass base_id + table_id (from noco_list_tables) and a fields object whose keys match the table\'s column titles. Returns the created row.',
  category: 'Service Ops',
  icon: '➕',
  parameters: {
    type: 'object',
    properties: {
      base_id: { type: 'string', description: 'NocoDB base id (from noco_list_tables)' },
      table_id: { type: 'string', description: 'NocoDB table id (from noco_list_tables)' },
      fields: {
        type: 'object',
        description: 'Field-value pairs. Keys must match the column titles exactly. Example: { "Title": "Display offline", "Status": "Open", "Venue": "Heinz Athletic Center" }',
      },
    },
    required: ['base_id', 'table_id', 'fields'],
  },
  async handler(args) {
    if (!Noco.configured()) {
      return { error: 'NocoDB is not configured on this server (NOCODB_API_TOKEN missing).' }
    }
    const fields = (args.fields && typeof args.fields === 'object') ? args.fields as Record<string, unknown> : {}
    if (Object.keys(fields).length === 0) {
      return { error: 'fields object is required and cannot be empty.' }
    }
    const created = await Noco.createRow(String(args.base_id), String(args.table_id), fields)
    return { created }
  },
}
export default skill
