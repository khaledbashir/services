/**
 * Thin wrapper around the AnythingLLM REST API for voice-agent knowledge bases.
 *
 * Each voice agent gets its own ALLM workspace (lazy-created on first KB
 * upload). Files and URLs ingest into AnythingLLM's hotdir, then embed
 * into the agent's workspace. At conversation time we vector-search the
 * workspace and inject the top chunks into the system prompt.
 *
 * Uses the same instance the client portal already runs on. New env vars
 * (ANYTHINGLLM_BASE_URL / ANYTHINGLLM_API_KEY) override the defaults so a
 * dedicated instance can be split off later without code changes.
 */

const BASE = (process.env.ANYTHINGLLM_BASE_URL || 'https://ancservices-anything-llm.izcgmb.easypanel.host/api/v1').replace(/\/$/, '')
const API_KEY = process.env.ANYTHINGLLM_API_KEY || 'XGDBZ5Q-90R4117-NZJG7WZ-ZK693NP'
const VOICE_WORKSPACE_PREFIX = 'va-'

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${API_KEY}` }
}

function jsonHeaders(): HeadersInit {
  return { ...authHeaders(), 'Content-Type': 'application/json' }
}

export interface AllmDocument {
  id?: string
  url?: string
  title?: string
  docAuthor?: string
  description?: string
  docSource?: string
  chunkSource?: string
  /** AnythingLLM internal location like "custom-documents/<filename>-<hash>.json". */
  location?: string
}

export interface AllmUploadResult {
  success: boolean
  error: string | null
  documents: AllmDocument[]
}

export interface AllmVectorChunk {
  id?: string
  text: string
  score?: number
  source?: string
  metadata?: Record<string, unknown>
}

export interface AllmWorkspaceDoc {
  id: string
  docpath: string
  filename?: string
  title?: string
  pinned?: boolean
}

export interface AllmWorkspace {
  id: number
  name: string
  slug: string
  documents?: AllmWorkspaceDoc[]
}

function workspaceSlugFor(agentSlug: string): string {
  return `${VOICE_WORKSPACE_PREFIX}${agentSlug}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-')
}

async function fetchJson<T>(path: string, init: RequestInit, errLabel: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init)
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`${errLabel} failed (${res.status}): ${detail.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

/** Returns existing workspace or creates a new one for this agent. */
export async function ensureWorkspace(agentSlug: string, displayName: string): Promise<string> {
  const slug = workspaceSlugFor(agentSlug)
  const existing = await fetch(`${BASE}/workspace/${encodeURIComponent(slug)}`, { headers: authHeaders() })
  if (existing.ok) return slug

  const created = await fetchJson<{ workspace?: { slug?: string } }>(
    '/workspace/new',
    {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ name: `Voice agent — ${displayName}` }),
    },
    'workspace create'
  )
  return created.workspace?.slug || slug
}

/** Upload a raw file into the AnythingLLM hotdir. Returns the document records. */
export async function uploadFile(file: File): Promise<AllmDocument[]> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/document/upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: form,
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`document upload failed (${res.status}): ${detail.slice(0, 200)}`)
  }
  const data = (await res.json()) as AllmUploadResult
  if (!data.success) throw new Error(data.error || 'upload failed')
  return data.documents
}

/** Tell AnythingLLM to scrape a URL and ingest it as a document. */
export async function uploadUrl(url: string): Promise<AllmDocument[]> {
  const data = await fetchJson<AllmUploadResult>(
    '/document/upload-link',
    { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ link: url }) },
    'document upload-link'
  )
  if (!data.success) throw new Error(data.error || 'url ingest failed')
  return data.documents
}

/**
 * Embed already-ingested documents (by their `location` returned from
 * uploadFile / uploadUrl) into a workspace so they're searchable.
 */
export async function embedToWorkspace(workspaceSlug: string, docLocations: string[]): Promise<void> {
  if (docLocations.length === 0) return
  await fetchJson(
    `/workspace/${encodeURIComponent(workspaceSlug)}/update-embeddings`,
    {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ adds: docLocations, deletes: [] }),
    },
    'embed to workspace'
  )
}

export async function removeFromWorkspace(workspaceSlug: string, docLocations: string[]): Promise<void> {
  if (docLocations.length === 0) return
  await fetchJson(
    `/workspace/${encodeURIComponent(workspaceSlug)}/update-embeddings`,
    {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify({ adds: [], deletes: docLocations }),
    },
    'remove from workspace'
  )
}

/** Drop the documents from the AnythingLLM filesystem entirely. */
export async function deleteDocuments(docLocations: string[]): Promise<void> {
  if (docLocations.length === 0) return
  // names in the system endpoint are the doc locations.
  await fetch(`${BASE}/system/remove-documents`, {
    method: 'DELETE',
    headers: jsonHeaders(),
    body: JSON.stringify({ names: docLocations }),
  })
}

export async function listWorkspaceDocs(workspaceSlug: string): Promise<AllmWorkspaceDoc[]> {
  const data = await fetchJson<{ workspace?: AllmWorkspace[] | AllmWorkspace }>(
    `/workspace/${encodeURIComponent(workspaceSlug)}`,
    { method: 'GET', headers: authHeaders() },
    'workspace fetch'
  )
  // Endpoint returns { workspace: [ { ... } ] } in newer ALLM versions and
  // { workspace: { ... } } in older ones — handle both.
  const ws = Array.isArray(data.workspace) ? data.workspace[0] : data.workspace
  return ws?.documents || []
}

export async function vectorSearch(
  workspaceSlug: string,
  query: string,
  topN = 4
): Promise<AllmVectorChunk[]> {
  const trimmed = query.trim()
  if (!trimmed) return []
  try {
    const data = await fetchJson<{ results?: AllmVectorChunk[] }>(
      `/workspace/${encodeURIComponent(workspaceSlug)}/vector-search`,
      {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ query: trimmed, topN }),
      },
      'vector search'
    )
    return data.results || []
  } catch (err) {
    // Vector search is best-effort — failure should not break a voice turn.
    console.error('[anythingllm] vector search failed:', err)
    return []
  }
}

export { workspaceSlugFor }
