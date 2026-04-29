// Thin client for the self-hosted NocoDB instance Nick is using as the
// Airtable replacement. All calls go through the API token, server-side
// only — never expose NOCODB_API_TOKEN to the browser.
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

export interface NocoBase {
  id: string
  title: string
}

export interface NocoTable {
  id: string
  title: string
  table_name: string
}

export interface NocoListResult<T = Record<string, unknown>> {
  list: T[]
  pageInfo: {
    totalRows: number
    page: number
    pageSize: number
    isFirstPage: boolean
    isLastPage: boolean
  }
}

// NocoDB v2 API (the modern one — not the legacy v1).
export const Noco = {
  baseUrl,
  configured: () => !!process.env.NOCODB_API_TOKEN,

  async listBases(): Promise<NocoBase[]> {
    const data = await nocoFetch<{ list: NocoBase[] }>('/api/v2/meta/bases')
    return data.list || []
  },

  async listTables(baseId: string): Promise<NocoTable[]> {
    const data = await nocoFetch<{ list: NocoTable[] }>(`/api/v2/meta/bases/${baseId}/tables`)
    return data.list || []
  },

  async listRows<T = Record<string, unknown>>(
    tableId: string,
    opts: { limit?: number; offset?: number; where?: string; sort?: string; fields?: string } = {},
  ): Promise<NocoListResult<T>> {
    const params = new URLSearchParams()
    params.set('limit', String(Math.min(Math.max(opts.limit || 25, 1), 100)))
    if (opts.offset) params.set('offset', String(opts.offset))
    if (opts.where) params.set('where', opts.where)
    if (opts.sort) params.set('sort', opts.sort)
    if (opts.fields) params.set('fields', opts.fields)
    return nocoFetch<NocoListResult<T>>(`/api/v2/tables/${tableId}/records?${params}`)
  },

  async createRow<T = Record<string, unknown>>(tableId: string, data: Partial<T>): Promise<T> {
    return nocoFetch<T>(`/api/v2/tables/${tableId}/records`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  async updateRow<T = Record<string, unknown>>(
    tableId: string,
    rowId: string | number,
    data: Partial<T>,
  ): Promise<T> {
    return nocoFetch<T>(`/api/v2/tables/${tableId}/records`, {
      method: 'PATCH',
      body: JSON.stringify({ Id: rowId, ...data }),
    })
  },

  async deleteRow(tableId: string, rowId: string | number): Promise<void> {
    await nocoFetch(`/api/v2/tables/${tableId}/records`, {
      method: 'DELETE',
      body: JSON.stringify({ Id: rowId }),
    })
  },
}
