import { NocoOps } from '@/lib/nocodb-ops'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'ops_list_documents',
  description:
    'List every NocoDB document in a base. Returns id, title, parent_id, and last-updated timestamp. Use this to find a docId by title before calling ops_write_document.',
  category: 'Service Ops',
  icon: '📄',
  parameters: {
    type: 'object',
    properties: {
      base_id: { type: 'string', description: 'NocoDB base id (from ops_list_tables)' },
    },
    required: ['base_id'],
  },
  async handler(args) {
    if (!NocoOps.configured()) return { error: 'NOCODB_OPS_PAT missing.' }
    const docs = await NocoOps.listDocuments(String(args.base_id))
    return { documents: docs }
  },
}
export default skill
