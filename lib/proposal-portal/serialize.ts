import { normalizeModuleOrder } from './modules'
import { modulesForRecipe, normalizePresetId } from './recipes'
import {
  DEFAULT_PORTAL_DATA,
  type PortalClientData,
  type PortalModuleId,
  type PortalRecipeId,
} from './types'

export function parseModules(raw: unknown): PortalModuleId[] {
  if (!Array.isArray(raw)) return modulesForRecipe('service-portal')
  return normalizeModuleOrder(raw.filter((x) => typeof x === 'string') as string[])
}

export function parseClientData(raw: unknown): PortalClientData {
  if (!raw || typeof raw !== 'object') return DEFAULT_PORTAL_DATA
  return { ...DEFAULT_PORTAL_DATA, ...(raw as PortalClientData) }
}

export function parseRecipe(raw: unknown): PortalRecipeId {
  return normalizePresetId(raw)
}
