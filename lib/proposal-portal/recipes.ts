import { normalizeModuleOrder } from './modules'
import type { PortalModuleId, PortalRecipeId } from './types'

export type PortalRecipeDef = {
  id: PortalRecipeId
  label: string
  tagline: string
  modules: PortalModuleId[]
}

export const PORTAL_RECIPES: PortalRecipeDef[] = [
  {
    id: 'sales-proposal',
    label: 'Sales Proposal',
    tagline: 'Deal deck, proof story, approvals, documents, and executive close.',
    modules: ['deal-deck', 'customer-portal', 'documents', 'approvals'],
  },
  {
    id: 'service-portal',
    label: 'Service Portal',
    tagline: 'Customer login, tickets, health, documents, and orientation.',
    modules: ['customer-portal', 'tickets', 'service-health', 'documents', 'onboarding'],
  },
  {
    id: 'renewal-qbr',
    label: 'Renewal / QBR',
    tagline: 'Service performance, reports, health, completed work, and renewal proof.',
    modules: ['customer-portal', 'service-health', 'tickets', 'reports-qbr', 'documents'],
  },
  {
    id: 'issue-intake',
    label: 'Issue Intake',
    tagline: 'Client-facing first line of defense for issues, photos, and AI triage.',
    modules: ['customer-portal', 'tickets', 'ai-diagnosis', 'service-health'],
  },
  {
    id: 'project-onboarding',
    label: 'Project Onboarding',
    tagline: 'Orientation, documents, approvals, status, and next steps.',
    modules: ['customer-portal', 'onboarding', 'documents', 'approvals', 'service-health'],
  },
  {
    id: 'executive-review',
    label: 'Executive Review',
    tagline: 'High-level story, service health, reports, risks, and decisions.',
    modules: ['deal-deck', 'customer-portal', 'service-health', 'reports-qbr', 'approvals'],
  },
]

export const PORTAL_RECIPE_MAP = Object.fromEntries(
  PORTAL_RECIPES.map((r) => [r.id, r]),
) as Record<Exclude<PortalRecipeId, 'custom'>, PortalRecipeDef>

const LEGACY_RECIPE_MAP: Record<string, PortalRecipeId> = {
  natalia: 'sales-proposal',
  jireh: 'sales-proposal',
  joe: 'service-portal',
}

export function normalizePresetId(raw: unknown): PortalRecipeId {
  const id = String(raw ?? 'service-portal')
  if (
    id === 'sales-proposal' ||
    id === 'service-portal' ||
    id === 'renewal-qbr' ||
    id === 'issue-intake' ||
    id === 'project-onboarding' ||
    id === 'executive-review' ||
    id === 'custom'
  ) return id
  return LEGACY_RECIPE_MAP[id] ?? 'service-portal'
}

export function modulesForRecipe(recipe: PortalRecipeId): PortalModuleId[] {
  const normalized = normalizePresetId(recipe)
  if (normalized === 'custom') return normalizeModuleOrder(['customer-portal', 'tickets', 'service-health'])
  return normalizeModuleOrder(PORTAL_RECIPE_MAP[normalized]?.modules ?? ['customer-portal'])
}
