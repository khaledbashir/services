import { normalizeModuleOrder } from './modules'
import type { PortalModuleId, PortalRecipeId } from './types'

export type PortalRecipeDef = {
  id: PortalRecipeId
  label: string
  owner: string
  tagline: string
  modules: PortalModuleId[]
}

export const PORTAL_RECIPES: PortalRecipeDef[] = [
  {
    id: 'natalia',
    label: 'Win the room',
    owner: 'Natalia',
    tagline: 'Maximum visual polish — hero, proof, team, close.',
    modules: ['venue-hero', 'solution-story', 'before-after', 'proof-gallery', 'team', 'pricing'],
  },
  {
    id: 'jireh',
    label: 'Close the deal',
    owner: 'Jireh',
    tagline: 'Sales-heavy — proof, stats, case study, pricing, timeline.',
    modules: [
      'venue-hero',
      'proof-gallery',
      'stats',
      'case-study',
      'before-after',
      'pricing',
      'timeline',
    ],
  },
  {
    id: 'joe',
    label: "We're on it",
    owner: 'Joe',
    tagline: 'Ops trust — milestones and accountability (project mode).',
    modules: ['venue-hero', 'solution-story', 'timeline'],
  },
]

export const PORTAL_RECIPE_MAP = Object.fromEntries(
  PORTAL_RECIPES.map((r) => [r.id, r]),
) as Record<PortalRecipeId, PortalRecipeDef>

export function modulesForRecipe(recipe: PortalRecipeId): PortalModuleId[] {
  if (recipe === 'custom') return normalizeModuleOrder(['venue-hero', 'before-after', 'pricing'])
  return normalizeModuleOrder(PORTAL_RECIPE_MAP[recipe]?.modules ?? ['venue-hero'])
}
