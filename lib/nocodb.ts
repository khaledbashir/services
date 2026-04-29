// Thin client for the self-hosted NocoDB instance Nick is using as the
// Airtable replacement. All calls go through the API token, server-side
// only — never expose NOCODB_API_TOKEN to the browser.
//
// Uses NocoDB v3 API to match the bash CLI skill at
// ~/.claude/skills/nocodb. v3 traverses workspace → base → table.
//
// Configure via env on the EasyPanel anc-services service:
//   NOCODB_BASE_URL=https://ahmad-nocodb.izcgmb.easypanel.host
//   NOCODB_API_TOKEN=nc_pat_...

const DEFAULT_BASE_URL = 'https://ahmad-nocodb.izcgmb.easypanel.host'

function baseUrl(): string {
  return (process.env.NOCODB_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function token(): string {
  const t = process.env.NOCODB_API_TOKEN || ''
  if (!t) throw new Error('NOCODB_API_TOKEN is not configured on the server.')
  return t
}

async function nocoFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'xc-token': token(),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`NocoDB ${res.status} on ${path}: ${body.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

export interface NocoWorkspace {
  id: string
  title: string
}

export interface NocoBase {
  id: string
  title: string
  workspace_id?: string
}

export interface NocoTable {
  id: string
  title: string
  table_name?: string
}

export interface NocoRecordsResult<T = Record<string, unknown>> {
  records: T[]
  next?: string | null
  prev?: string | null
}

export const Noco = {
  baseUrl,
  configured: () => !!process.env.NOCODB_API_TOKEN,

  async listWorkspaces(): Promise<NocoWorkspace[]> {
    const data = await nocoFetch<{ list: NocoWorkspace[] }>('/api/v3/meta/workspaces')
    return data.list || []
  },

  async listBases(workspaceId?: string): Promise<NocoBase[]> {
    if (workspaceId) {
      const data = await nocoFetch<{ list: NocoBase[] }>(`/api/v3/meta/workspaces/${workspaceId}/bases`)
      return (data.list || []).map((b) => ({ ...b, workspace_id: workspaceId }))
    }
    // Default: walk every workspace and aggregate. v3 has no flat list-all-bases endpoint.
    const workspaces = await this.listWorkspaces()
    const all: NocoBase[] = []
    for (const ws of workspaces) {
      const data = await nocoFetch<{ list: NocoBase[] }>(`/api/v3/meta/workspaces/${ws.id}/bases`)
      for (const b of data.list || []) all.push({ ...b, workspace_id: ws.id })
    }
    return all
  },

  async listTables(baseId: string): Promise<NocoTable[]> {
    const data = await nocoFetch<{ list: NocoTable[] }>(`/api/v3/meta/bases/${baseId}/tables`)
    return data.list || []
  },

  async getTableMeta(baseId: string, tableId: string): Promise<{
    id: string
    title: string
    fields: Array<{
      id: string
      title: string
      type: string
      options?: { choices?: Array<{ title: string; color?: string }> } | null
    }>
  }> {
    const data = await nocoFetch<any>(`/api/v3/meta/bases/${baseId}/tables/${tableId}`)
    return {
      id: data.id,
      title: data.title,
      fields: (data.fields || []).map((f: any) => ({
        id: f.id,
        title: f.title,
        type: f.type,
        options: f.options || null,
      })),
    }
  },

  async listRows<T = Record<string, unknown>>(
    baseId: string,
    tableId: string,
    opts: { page?: number; pageSize?: number; where?: string; sort?: string; fields?: string; viewId?: string } = {},
  ): Promise<NocoRecordsResult<T>> {
    const params = new URLSearchParams()
    params.set('page', String(opts.page || 1))
    params.set('pageSize', String(Math.min(Math.max(opts.pageSize || 25, 1), 100)))
    if (opts.where) params.set('where', opts.where)
    if (opts.sort) params.set('sort', opts.sort)
    if (opts.fields) params.set('fields', opts.fields)
    if (opts.viewId) params.set('viewId', opts.viewId)
    return nocoFetch<NocoRecordsResult<T>>(`/api/v3/data/${baseId}/${tableId}/records?${params}`)
  },

  async createRow<T = Record<string, unknown>>(
    baseId: string,
    tableId: string,
    fields: Partial<T>,
  ): Promise<T> {
    return nocoFetch<T>(`/api/v3/data/${baseId}/${tableId}/records`, {
      method: 'POST',
      body: JSON.stringify({ fields }),
    })
  },

  async updateRow<T = Record<string, unknown>>(
    baseId: string,
    tableId: string,
    rowId: string | number,
    fields: Partial<T>,
  ): Promise<T> {
    return nocoFetch<T>(`/api/v3/data/${baseId}/${tableId}/records/${rowId}`, {
      method: 'PATCH',
      body: JSON.stringify({ fields }),
    })
  },

  async deleteRow(baseId: string, tableId: string, rowId: string | number): Promise<void> {
    await nocoFetch(`/api/v3/data/${baseId}/${tableId}/records/${rowId}`, {
      method: 'DELETE',
    })
  },

  async countRows(baseId: string, tableId: string, where?: string): Promise<number> {
    const qs = where ? `?where=${encodeURIComponent(where)}` : ''
    const data = await nocoFetch<{ count: number }>(`/api/v3/data/${baseId}/${tableId}/count${qs}`)
    return data.count
  },
}
