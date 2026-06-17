import { normalizeModuleOrder } from './modules'
import { modulesForRecipe } from './recipes'
import {
  DEFAULT_PORTAL_DATA,
  type PortalClientData,
  type PortalModuleId,
  type PortalRecipeId,
} from './types'

export function parseModules(raw: unknown): PortalModuleId[] {
  if (!Array.isArray(raw)) return modulesForRecipe('natalia')
  return normalizeModuleOrder(raw.filter((x) => typeof x === 'string') as PortalModuleId[])
}

export function parseClientData(raw: unknown): PortalClientData {
  if (!raw || typeof raw !== 'object') return DEFAULT_PORTAL_DATA
  return { ...DEFAULT_PORTAL_DATA, ...(raw as PortalClientData) }
}

export function parseRecipe(raw: unknown): PortalRecipeId {
  const v = String(raw ?? 'natalia')
  if (v === 'jireh' || v === 'joe' || v === 'custom' || v === 'natalia') return v
  return 'natalia'
}