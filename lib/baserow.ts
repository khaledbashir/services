// Thin client for the self-hosted Baserow instance — Nick's Airtable
// replacement (MIT license, fully rebrandable). Supersedes lib/nocodb.ts.
// Server-side only: never expose BASEROW_API_TOKEN to the browser.
//
// Configure via env on the EasyPanel anc-services service:
//   BASEROW_BASE_URL=https://ops.ancsports.net
//   BASEROW_API_TOKEN=<token from Settings → API tokens in Baserow>

const DEFAULT_BASE_URL = 'https://ops.ancsports.net'

function baseUrl(): string {
  return (process.env.BASEROW_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
}

function token(): string {
  const t = process.env.BASEROW_API_TOKEN || ''
  if (!t) throw new Error('BASEROW_API_TOKEN is not configured on the server.')
  return t
}

async function browFetch<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Token ${token()}`,
      ...(init.headers || {}),
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Baserow ${res.status} on ${path}: ${body.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

export interface BaserowApplication {
  id: number
  name: string
  type: string
  workspace: { id: number; name: string }
}

export interface BaserowTable {
  id: number
  name: string
  database_id: number
}

export interface BaserowField {
  id: number
  table_id: number
  name: string
  type: string
  primary?: boolean
  read_only?: boolean
  // Single/multi-select fields carry their choices here.
  select_options?: Array<{ id: number; value: string; color: string }>
}

export interface BaserowRowsResult<T = Record<string, unknown>> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

// Baserow models data as: workspace > application (database) > table > rows.
// "Application" is what the UI calls a "database" — keeping the API name in
// types so it matches the official docs.
export const Baserow = {
  baseUrl,
  configured: () => !!process.env.BASEROW_API_TOKEN,

  async listApplications(): Promise<BaserowApplication[]> {
    // Returns ALL applications across every workspace the token can see.
    const data = await browFetch<BaserowApplication[]>('/api/applications/')
    return Array.isArray(data) ? data : []
  },

  async listTables(databaseId: number | string): Promise<BaserowTable[]> {
    const data = await browFetch<BaserowTable[]>(`/api/database/tables/database/${databaseId}/`)
    return Array.isArray(data) ? data : []
  },

  async listFields(tableId: number | string): Promise<BaserowField[]> {
    const data = await browFetch<BaserowField[]>(`/api/database/fields/table/${tableId}/`)
    return Array.isArray(data) ? data : []
  },

  async listRows<T = Record<string, unknown>>(
    tableId: number | string,
    opts: {
      page?: number
      size?: number
      search?: string
      orderBy?: string
      filter?: string
    } = {},
  ): Promise<BaserowRowsResult<T>> {
    const params = new URLSearchParams()
    params.set('page', String(opts.page || 1))
    params.set('size', String(Math.min(Math.max(opts.size || 50, 1), 200)))
    // Use friendly field names in the API response so callers don't have to
    // remember field IDs.
    params.set('user_field_names', 'true')
    if (opts.search) params.set('search', opts.search)
    if (opts.orderBy) params.set('order_by', opts.orderBy)
    if (opts.filter) {
      // Baserow accepts a JSON filter tree; pass through as-is.
      params.set('filters', opts.filter)
    }
    return browFetch<BaserowRowsResult<T>>(`/api/database/rows/table/${tableId}/?${params}`)
  },

  async createRow<T = Record<string, unknown>>(
    tableId: number | string,
    fields: Partial<T>,
  ): Promise<T> {
    return browFetch<T>(`/api/database/rows/table/${tableId}/?user_field_names=true`, {
      method: 'POST',
      body: JSON.stringify(fields),
    })
  },

  async updateRow<T = Record<string, unknown>>(
    tableId: number | string,
    rowId: number | string,
    fields: Partial<T>,
  ): Promise<T> {
    return browFetch<T>(`/api/database/rows/table/${tableId}/${rowId}/?user_field_names=true`, {
      method: 'PATCH',
      body: JSON.stringify(fields),
    })
  },

  async deleteRow(tableId: number | string, rowId: number | string): Promise<void> {
    const res = await fetch(`${baseUrl()}/api/database/rows/table/${tableId}/${rowId}/`, {
      method: 'DELETE',
      headers: { Authorization: `Token ${token()}` },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Baserow ${res.status} on delete row: ${body.slice(0, 300)}`)
    }
  },
}
