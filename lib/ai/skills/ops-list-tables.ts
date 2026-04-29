import { Baserow } from '@/lib/baserow'
import type { Skill } from '@/lib/ai/types'

const skill: Skill = {
  name: 'ops_list_tables',
  description: 'List the tables available in the Operations workspace (Nick\'s self-hosted Airtable replacement at /operations). Returns workspace + database + table ids and names. Use before ops_query_table when you don\'t already know the table id.',
  category: 'Service Ops',
  icon: '🗂',
  parameters: {
    type: 'object',
    properties: {},
  },
  async handler() {
    if (!Baserow.configured()) {
      return { error: 'Operations backend (Baserow) is not configured on this server (BASEROW_API_TOKEN missing).' }
    }
    const apps = await Baserow.listApplications()
    const databases = apps.filter((a) => a.type === 'database')
    const out: Array<{
      workspace_id: number
      workspace_name: string
      databases: Array<{ id: number; name: string; tables: Array<{ id: number; name: string }> }>
    }> = []
    const wsMap = new Map<number, { workspace_id: number; workspace_name: string; databases: any[] }>()
    for (const db of databases) {
      const tables = await Baserow.listTables(db.id)
      const ws = wsMap.get(db.workspace.id) || {
        workspace_id: db.workspace.id,
        workspace_name: db.workspace.name,
        databases: [],
      }
      ws.databases.push({
        id: db.id,
        name: db.name,
        tables: tables.map((t) => ({ id: t.id, name: t.name })),
      })
      wsMap.set(db.workspace.id, ws)
    }
    for (const ws of wsMap.values()) out.push(ws)
    return { workspaces: out }
  },
}
export default skill
