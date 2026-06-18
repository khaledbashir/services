import { query } from '@/lib/db'
import { modulesForRecipe } from '@/lib/proposal-portal/recipes'
import { parseClientData, parseModules, parseRecipe } from '@/lib/proposal-portal/serialize'
import { DEFAULT_PORTAL_DATA } from '@/lib/proposal-portal/types'

export interface ProposalPortalRecord {
  id: string
  title: string
  mode: string
  recipe: string
  enabled_modules: unknown
  client_data: unknown
  created_by_user_id: string
  created_by_email: string
  is_public: boolean
  created_at: string
  updated_at: string
  published_at: string | null
  published_version: number
  published_title: string | null
  published_modules: unknown | null
  published_client_data: unknown | null
}

export interface ProposalPortalListItem {
  id: string
  title: string
  mode: string
  recipe: string
  created_by_email: string
  is_public: boolean
  updated_at: string
  published_at: string | null
}

export async function listProposalPortalsForWorkspace(): Promise<ProposalPortalListItem[]> {
  const result = await query(
    `SELECT id, title, mode, recipe, created_by_email, is_public, updated_at, published_at
     FROM proposal_portals
     ORDER BY updated_at DESC`,
  )
  return result.rows
}

export async function createProposalPortal(params: {
  userId: string
  email: string
  title?: string
  clientName?: string
  recipe?: string
}) {
  const recipe = parseRecipe(params.recipe ?? 'service-portal')
  const clientName = params.clientName?.trim() || 'Client workspace'
  const title = (params.title ?? `${clientName} — Client Portal`).slice(0, 200)
  const data = { ...DEFAULT_PORTAL_DATA, clientName }
  const modules = modulesForRecipe(recipe)

  const result = await query(
    `INSERT INTO proposal_portals (
       title, recipe, enabled_modules, client_data,
       created_by_user_id, created_by_email
     ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
     RETURNING id, title, recipe, is_public`,
    [title, recipe, JSON.stringify(modules), JSON.stringify(data), params.userId, params.email],
  )

  return result.rows[0]
}

export async function getProposalPortalById(id: string): Promise<ProposalPortalRecord | null> {
  const result = await query(`SELECT * FROM proposal_portals WHERE id = $1`, [id])
  return result.rows[0] || null
}

export async function updateProposalPortal(
  id: string,
  patch: {
    title?: string
    recipe?: string
    enabledModules?: unknown
    clientData?: unknown
    isPublic?: boolean
  },
) {
  const existing = await getProposalPortalById(id)
  if (!existing) return null

  const nextTitle = patch.title ? patch.title.slice(0, 200) : existing.title
  const nextModules = patch.enabledModules
    ? parseModules(patch.enabledModules)
    : parseModules(existing.enabled_modules)
  const nextData = patch.clientData
    ? parseClientData(patch.clientData)
    : parseClientData(existing.client_data)
  const nextRecipe = patch.recipe ? parseRecipe(patch.recipe) : parseRecipe(existing.recipe)
  const publishing = patch.isPublic === true

  const result = await query(
    `UPDATE proposal_portals SET
       title = COALESCE($3, title),
       recipe = COALESCE($4, recipe),
       enabled_modules = COALESCE($5::jsonb, enabled_modules),
       client_data = COALESCE($6::jsonb, client_data),
       is_public = COALESCE($7, is_public),
       published_at = CASE WHEN $8 THEN NOW() ELSE published_at END,
       published_version = CASE WHEN $8 THEN published_version + 1 ELSE published_version END,
       published_title = CASE WHEN $8 THEN $9 ELSE published_title END,
       published_modules = CASE WHEN $8 THEN $10::jsonb ELSE published_modules END,
       published_client_data = CASE WHEN $8 THEN $11::jsonb ELSE published_client_data END,
       updated_at = NOW()
     WHERE id = $1 AND created_by_user_id = $2
     RETURNING id, title, recipe, is_public`,
    [
      id,
      existing.created_by_user_id,
      patch.title ? nextTitle : null,
      patch.recipe ? nextRecipe : null,
      patch.enabledModules ? JSON.stringify(nextModules) : null,
      patch.clientData ? JSON.stringify(nextData) : null,
      typeof patch.isPublic === 'boolean' ? patch.isPublic : null,
      publishing,
      nextTitle,
      JSON.stringify(nextModules),
      JSON.stringify(nextData),
    ],
  )

  return result.rows[0] || null
}

export function serializeProposalPortalForClient(portal: ProposalPortalRecord, publicOnly: boolean) {
  if (publicOnly && !portal.is_public) return null

  const usePublished = publicOnly && portal.is_public && portal.published_modules

  return {
    id: portal.id,
    title: usePublished ? portal.published_title ?? portal.title : portal.title,
    mode: portal.mode,
    recipe: portal.recipe,
    enabledModules: parseModules(usePublished ? portal.published_modules : portal.enabled_modules),
    clientData: parseClientData(usePublished ? portal.published_client_data : portal.client_data),
    isPublic: portal.is_public,
  }
}
