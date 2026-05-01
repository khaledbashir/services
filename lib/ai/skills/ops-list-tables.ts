import { NocoOps } from '@/lib/nocodb-ops'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'ops_list_tables',
  description:
    'List every base + table in the ANC Operations workspace at ops.ancsports.net (the iframe at /operations). Returns base id, base title, table id, table title — call this BEFORE ops_query_table / ops_create_records / ops_update_records when you don\'t already know the table id. Tables are organized into bases like "WMATA Inventory", "ANC Service - South", "Inventory Tracking", etc.',
  category: 'Service Ops',
  icon: '🗂',
  parameters: { type: 'object', properties: {} },
  async handler() {
    if (!NocoOps.configured()) {
      return { error: 'Operations backend (NocoDB) is not configured (NOCODB_OPS_PAT missing).' }
    }
    const bases = await NocoOps.listBases()
    const out: Array<{ base_id: string; base_title: string; tables: Array<{ id: string; title: string }> }> = []
    for (const b of bases) {
      const tables = await NocoOps.listTables(b.id)
      out.push({
        base_id: b.id,
        base_title: b.title,
        tables: tables.map((t) => ({ id: t.id, title: t.title })),
      })
    }
    return { workspace_id: NocoOps.workspaceId(), bases: out }
  },
}
export default skill
