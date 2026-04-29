import { Noco } from '@/lib/nocodb'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'noco_list_tables',
  description: 'List the tables available in NocoDB (Nick\'s Airtable replacement at /operations). Use this before noco_query_table when you don\'t already know the table id. Returns base + table ids and titles.',
  category: 'Service Ops',
  icon: '🗂',
  parameters: {
    type: 'object',
    properties: {},
  },
  async handler() {
    if (!Noco.configured()) {
      return { error: 'NocoDB is not configured on this server (NOCODB_API_TOKEN missing).' }
    }
    const bases = await Noco.listBases()
    const out: Array<{ base_id: string; base_title: string; tables: Array<{ id: string; title: string }> }> = []
    for (const base of bases) {
      const tables = await Noco.listTables(base.id)
      out.push({
        base_id: base.id,
        base_title: base.title,
        tables: tables.map((t) => ({ id: t.id, title: t.title })),
      })
    }
    return { bases: out }
  },
}
export default skill
