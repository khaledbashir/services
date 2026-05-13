// Server-side NocoDB client for the ANC ops workspace at ops.ancsports.net.
// Replaces the now-defunct Baserow client (lib/baserow.ts) — same workspace
// URL, totally different API. NocoDB v2 conventions:
//   * xc-token header (not Authorization: Token)
//   * /api/v2/meta/{workspaces|bases|tables|views}/*
//   * /api/v2/tables/{tableId}/records   ← data plane
//
// Configure via env on the EasyPanel anc-services service:
//   NOCODB_OPS_BASE_URL=https://ops.ancsports.net
//   NOCODB_OPS_PAT=nc_pat_<token from /root/.nocodb-creds>
//   NOCODB_OPS_WORKSPACE_ID=w2116qsq    (default — the ANC workspace)
//
// Never expose the PAT to the browser. All callers run server-side from
// the AI skill handlers in /api/ai/invoke.

const DEFAULT_BASE = 'https://ops.ancsports.net'
const DEFAULT_WORKSPACE = 'w2116qsq'

export class NocoDBOpsError extends Error {
  status?: number
  body?: unknown
  constructor(message: string, status?: number, body?: unknown) {
    super(message)
    this.status = status
    this.body = body
  }
}

function baseUrl(): string {
  return (process.env.NOCODB_OPS_BASE_URL || DEFAULT_BASE).replace(/\/+$/, '')
}

function token(): string {
  const t = process.env.NOCODB_OPS_PAT || ''
  if (!t) throw new NocoDBOpsError('NOCODB_OPS_PAT is not configured on the server.')
  return t
}

function workspaceId(): string {
  return process.env.NOCODB_OPS_WORKSPACE_ID || DEFAULT_WORKSPACE
}

async function noco<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${baseUrl()}${path}`
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'xc-token': token(),
      ...(init.headers || {}),
    },
    cache: 'no-store',
  })
  const text = await res.text()
  let body: unknown
  try { body = text ? JSON.parse(text) : null } catch { body = text }
  if (!res.ok) {
    throw new NocoDBOpsError(
      `NocoDB ${init.method || 'GET'} ${path} failed (${res.status}): ${typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`,
      res.status,
      body
    )
  }
  return body as T
}

// ---- Discovery ----

export interface NocoBase {
  id: string
  title: string
  description?: string | null
}

export interface NocoTable {
  id: string
  base_id: string
  title: string
  table_name?: string
  description?: string | null
}

export interface NocoColumn {
  id: string
  title: string
  column_name: string
  uidt: string                      // SingleLineText | LongText | SingleSelect | …
  pv?: boolean                       // primary value (display column)
  colOptions?: { options?: Array<{ title: string; color?: string }> }
}

export interface NocoView {
  id: string
  title: string
  type: number                       // 1=Form 2=Gallery 3=Grid 4=Kanban 5=Map 6=Calendar
}

export const NocoOps = {
  baseUrl,
  workspaceId,

  configured(): boolean {
    return !!process.env.NOCODB_OPS_PAT
  },

  // The workspace-listing endpoint is forbidden for PAT auth — but enumerating
  // bases of every workspace IS allowed. We filter to ours.
  async listBases(): Promise<NocoBase[]> {
    const r = await noco<{ list: NocoBase[] }>(
      `/api/v2/meta/workspaces/${workspaceId()}/bases`
    )
    return r.list || []
  },

  async listTables(baseId: string): Promise<NocoTable[]> {
    const r = await noco<{ list: NocoTable[] }>(`/api/v2/meta/bases/${baseId}/tables`)
    return r.list || []
  },

  async getTable(tableId: string): Promise<NocoTable & { columns: NocoColumn[] }> {
    return await noco(`/api/v2/meta/tables/${tableId}`)
  },

  async listViews(tableId: string): Promise<NocoView[]> {
    const r = await noco<{ list: NocoView[] }>(`/api/v2/meta/tables/${tableId}/views`)
    return r.list || []
  },

  // ---- Records ----

  async listRecords(tableId: string, opts: {
    where?: string                    // NocoDB filter syntax e.g. (Status,eq,Done)
    sort?: string                     // e.g. -CreatedAt,Title
    fields?: string                   // comma-separated
    limit?: number
    offset?: number
    viewId?: string                   // scope to a specific view
  } = {}): Promise<{ records: Record<string, unknown>[]; pageInfo: { totalRows: number; page: number; pageSize: number; isFirstPage: boolean; isLastPage: boolean } }> {
    const qs = new URLSearchParams()
    if (opts.where) qs.set('where', opts.where)
    if (opts.sort) qs.set('sort', opts.sort)
    if (opts.fields) qs.set('fields', opts.fields)
    if (opts.viewId) qs.set('viewId', opts.viewId)
    // NocoDB v2 caps a single request at ~1000 rows. Defaults to 50 if the
    // caller doesn't say. Was previously clamped to 200 (legacy from the
    // walkthrough form's dropdown loaders); the DataGrid pages need 500+.
    qs.set('limit', String(Math.min(opts.limit ?? 50, 1000)))
    if (opts.offset != null) qs.set('offset', String(opts.offset))
    const r = await noco<{ list: Record<string, unknown>[]; pageInfo: any }>(
      `/api/v2/tables/${tableId}/records?${qs.toString()}`
    )
    return { records: r.list || [], pageInfo: r.pageInfo || { totalRows: 0, page: 1, pageSize: 0, isFirstPage: true, isLastPage: true } }
  },

  async countRecords(tableId: string, where?: string): Promise<number> {
    const qs = new URLSearchParams()
    if (where) qs.set('where', where)
    const r = await noco<{ count: number }>(`/api/v2/tables/${tableId}/records/count?${qs.toString()}`)
    return r.count ?? 0
  },

  // POST accepts an array → bulk-create. Returns array of {Id} for created rows.
  async createRecords(tableId: string, rows: Record<string, unknown>[]): Promise<Array<{ Id: number | string }>> {
    return await noco(`/api/v2/tables/${tableId}/records`, {
      method: 'POST',
      body: JSON.stringify(rows),
    })
  },

  // PATCH accepts an array of {Id, ...fields} → bulk-update. Returns array of {Id}.
  async updateRecords(tableId: string, rows: Array<{ Id: number | string } & Record<string, unknown>>): Promise<Array<{ Id: number | string }>> {
    return await noco(`/api/v2/tables/${tableId}/records`, {
      method: 'PATCH',
      body: JSON.stringify(rows),
    })
  },

  // DELETE accepts an array of {Id} → bulk-delete. Returns array of {Id}.
  async deleteRecords(tableId: string, ids: Array<number | string>): Promise<Array<{ Id: number | string }>> {
    return await noco(`/api/v2/tables/${tableId}/records`, {
      method: 'DELETE',
      body: JSON.stringify(ids.map((Id) => ({ Id }))),
    })
  },

  // ---- Linked records ----
  // Add child rows to a LinkToAnotherRecord field on a parent row.
  async addLinks(tableId: string, linkColumnId: string, parentRowId: number | string, childIds: Array<number | string>): Promise<unknown> {
    return await noco(`/api/v2/tables/${tableId}/links/${linkColumnId}/records/${parentRowId}`, {
      method: 'POST',
      body: JSON.stringify(childIds.map((Id) => ({ Id }))),
    })
  },

  // Read child rows linked to a parent row through a LinkToAnotherRecord
  // column. Returns the linked records (with whatever fields NocoDB
  // surfaces by default — Id + primary display column). Used to walk the
  // Venue → Display Locations chain without falling back to fragile
  // name-based filters (which leak across venues when a location's Venue
  // string isn't a perfect match).
  async listLinks(
    tableId: string,
    linkColumnId: string,
    parentRowId: number | string,
    opts: { limit?: number; offset?: number; fields?: string } = {}
  ): Promise<Record<string, unknown>[]> {
    const qs = new URLSearchParams()
    qs.set('limit', String(Math.min(opts.limit ?? 200, 1000)))
    if (opts.offset != null) qs.set('offset', String(opts.offset))
    if (opts.fields) qs.set('fields', opts.fields)
    const r = await noco<{ list?: Record<string, unknown>[] } | Record<string, unknown>[]>(
      `/api/v2/tables/${tableId}/links/${linkColumnId}/records/${parentRowId}?${qs.toString()}`
    )
    if (Array.isArray(r)) return r
    return (r as { list?: Record<string, unknown>[] }).list || []
  },

  // ---- Storage / attachments ----
  // NocoDB attachments live in /api/v2/storage/upload as multipart. Returns
  // an array of file metadata objects ({ url, title, mimetype, size, ... })
  // that can be set directly on an Attachment field via record update.
  async uploadFile(opts: {
    filename: string
    contentType: string
    body: Buffer | Uint8Array
    pathHint?: string  // optional folder hint, e.g. 'walkthroughs/2026-05'
  }): Promise<Array<Record<string, unknown>>> {
    const url = `${baseUrl()}/api/v2/storage/upload?path=${encodeURIComponent(opts.pathHint || 'misc')}`
    const form = new FormData()
    const u8 = new Uint8Array(opts.body)
    const blob = new Blob([u8], { type: opts.contentType })
    form.append('file', blob, opts.filename)
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'xc-token': token() },
      body: form,
    })
    const text = await res.text()
    let body: unknown
    try { body = text ? JSON.parse(text) : null } catch { body = text }
    if (!res.ok) {
      throw new NocoDBOpsError(`NocoDB upload failed (${res.status}): ${typeof body === 'string' ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`, res.status, body)
    }
    return Array.isArray(body) ? (body as Array<Record<string, unknown>>) : []
  },

  // ---- Documents ----
  //
  // NocoDB documents are first-class models with type='document'. Their
  // payload is ProseMirror JSON ({type: 'doc', content: [...]}). Read /
  // write through the internal POST endpoint scoped to a workspace + base.
  // Updates require an optimistic-lock `version` matching the current
  // server-side version; bump on every successful update.

  // List every document in a base (returns id, title, parent_id, etc.).
  async listDocuments(baseId: string): Promise<Array<{ id: string; title: string; parent_id: string | null; updated_at: string }>> {
    const tables = await noco<{ list: Array<{ id: string; title: string; type: string; parent_id?: string | null; updated_at?: string }> }>(
      `/api/v2/meta/bases/${baseId}/tables?includeM2M=true`
    )
    return (tables.list || [])
      .filter((t) => t.type === 'document')
      .map((t) => ({ id: t.id, title: t.title, parent_id: t.parent_id ?? null, updated_at: t.updated_at ?? '' }))
  },

  // Fetch a document with its full ProseMirror JSON content + version.
  async getDocument(baseId: string, docId: string): Promise<{ id: string; title: string; version: number; content: any }> {
    const r = await noco<{ id: string; title: string; version: number; content: any }>(
      `/api/v2/internal/${workspaceId()}/${baseId}?operation=documentGet&docId=${encodeURIComponent(docId)}`
    )
    return r
  },

  // Replace document content + title. Pass the current version (from
  // getDocument); NocoDB rejects if it's stale (someone else edited).
  async updateDocument(baseId: string, opts: {
    docId: string
    version: number
    title?: string
    content?: any                       // ProseMirror JSON ({type:'doc', content:[...]})
  }): Promise<{ id: string; title: string; version: number }> {
    const body: Record<string, unknown> = {
      docId: opts.docId,
      version: opts.version,
    }
    if (opts.title != null) body.title = opts.title
    if (opts.content != null) body.content = opts.content
    return await noco(
      `/api/v2/internal/${workspaceId()}/${baseId}?operation=documentUpdate`,
      { method: 'POST', body: JSON.stringify(body) }
    )
  },
}
