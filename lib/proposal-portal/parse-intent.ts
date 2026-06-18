import { PORTAL_MODULE_MAP, normalizeModuleOrder } from './modules'
import { PORTAL_RECIPES, modulesForRecipe, normalizePresetId } from './recipes'
import type { PortalClientData, PortalModuleId, PortalRecipeId } from './types'

export type AssembleResult = {
  reply: string
  enabledModules: PortalModuleId[]
  recipe: PortalRecipeId
  data: Partial<PortalClientData>
  missingModules: string[]
}

const MODULE_ALIASES: Record<string, PortalModuleId> = {
  deck: 'deal-deck',
  deal: 'deal-deck',
  sales: 'deal-deck',
  proposal: 'deal-deck',
  presentation: 'deal-deck',
  portal: 'customer-portal',
  customer: 'customer-portal',
  client: 'customer-portal',
  login: 'customer-portal',
  ticket: 'tickets',
  tickets: 'tickets',
  request: 'tickets',
  requests: 'tickets',
  case: 'tickets',
  cases: 'tickets',
  health: 'service-health',
  service: 'service-health',
  displays: 'service-health',
  maintenance: 'service-health',
  diagnosis: 'ai-diagnosis',
  diagnose: 'ai-diagnosis',
  vision: 'ai-diagnosis',
  photo: 'ai-diagnosis',
  picture: 'ai-diagnosis',
  kb: 'ai-diagnosis',
  documents: 'documents',
  docs: 'documents',
  files: 'documents',
  downloads: 'documents',
  approval: 'approvals',
  approvals: 'approvals',
  proof: 'approvals',
  signoff: 'approvals',
  report: 'reports-qbr',
  reports: 'reports-qbr',
  qbr: 'reports-qbr',
  renewal: 'reports-qbr',
  onboarding: 'onboarding',
  orientation: 'onboarding',
  training: 'onboarding',
  contacts: 'onboarding',
}

const PRESET_ALIASES: Record<string, PortalRecipeId> = {
  'sales proposal': 'sales-proposal',
  proposal: 'sales-proposal',
  'deal deck': 'sales-proposal',
  'service portal': 'service-portal',
  service: 'service-portal',
  portal: 'service-portal',
  qbr: 'renewal-qbr',
  renewal: 'renewal-qbr',
  'issue intake': 'issue-intake',
  intake: 'issue-intake',
  'first line': 'issue-intake',
  diagnosis: 'issue-intake',
  onboarding: 'project-onboarding',
  orientation: 'project-onboarding',
  executive: 'executive-review',
  review: 'executive-review',
}

function extractClientName(text: string): string | undefined {
  const forMatch = text.match(/\bfor\s+(?:the\s+)?([a-z0-9][\w\s.'-]{2,40})/i)
  if (forMatch?.[1]) return forMatch[1].trim().replace(/\s+portal$/i, '')
  return undefined
}

function findMentionedModules(text: string): PortalModuleId[] {
  const lower = text.toLowerCase()
  const found = new Set<PortalModuleId>()

  for (const mod of Object.values(PORTAL_MODULE_MAP)) {
    if (lower.includes(mod.id) || lower.includes(mod.label.toLowerCase())) {
      found.add(mod.id)
    }
  }

  for (const [alias, id] of Object.entries(MODULE_ALIASES)) {
    if (lower.includes(alias)) found.add(id)
  }

  const digitList = lower.match(/\b(?:modules?|include|want|add)\s+([0-9,\sand]+)/i)
  if (digitList?.[1]) {
    const nums = digitList[1].match(/\d+/g) ?? []
    const ordered = Object.keys(PORTAL_MODULE_MAP) as PortalModuleId[]
    for (const n of nums) {
      const idx = Number.parseInt(n, 10) - 1
      if (ordered[idx]) found.add(ordered[idx])
    }
  }

  return [...found]
}

function findPreset(text: string): PortalRecipeId | null {
  const lower = text.toLowerCase()
  for (const preset of PORTAL_RECIPES) {
    if (lower.includes(preset.id) || lower.includes(preset.label.toLowerCase())) return preset.id
  }
  for (const [alias, id] of Object.entries(PRESET_ALIASES)) {
    if (lower.includes(alias)) return id
  }
  const normalized = normalizePresetId(lower)
  return normalized === lower ? normalized : null
}

function findThemePatch(text: string): Partial<PortalClientData> {
  if (/\bblue\b/.test(text) && /\b(gold|yellow)\b/.test(text)) {
    return { brandPrimary: '#0A52EB', brandAccent: '#F5B84B' }
  }
  if (/\bblack\b/.test(text) && /\bgold\b/.test(text)) {
    return { brandPrimary: '#05070A', brandAccent: '#F5B84B' }
  }
  if (/\bred\b/.test(text)) return { brandPrimary: '#D92D20', brandAccent: '#F5B84B' }
  if (/\bgreen\b/.test(text)) return { brandPrimary: '#16A34A', brandAccent: '#2DD4BF' }
  if (/\bpurple\b/.test(text)) return { brandPrimary: '#6D28D9', brandAccent: '#F5B84B' }
  return {}
}

export function parsePortalIntent(
  message: string,
  currentModules: PortalModuleId[],
  currentRecipe: PortalRecipeId = 'custom',
): AssembleResult {
  const lower = message.toLowerCase().trim()
  let modules = [...currentModules]
  let recipe: PortalRecipeId = currentRecipe
  const data: Partial<PortalClientData> = {}
  const hasRemovalIntent = /\b(remove|drop|hide|without|no)\b/.test(lower)
  const hasAddIntent = /\b(add|include|enable|want|need|turn on|show)\b/.test(lower)

  const preset = findPreset(lower)
  if (preset && !hasRemovalIntent) {
    recipe = preset
    modules = modulesForRecipe(preset)
  }

  if (/\b(reset|start over|clear)\b/.test(lower)) {
    modules = modulesForRecipe('service-portal')
    recipe = 'service-portal'
  }

  if (hasRemovalIntent) {
    const removeHits = findMentionedModules(lower.replace(/\b(remove|drop|hide|without|no)\b/g, ' '))
    for (const id of removeHits) {
      if (!PORTAL_MODULE_MAP[id]?.required) modules = modules.filter((m) => m !== id)
    }
    recipe = 'custom'
  }

  if (hasAddIntent || (!hasRemovalIntent && !preset)) {
    const addHits = findMentionedModules(lower)
    for (const id of addHits) modules = [...new Set([...modules, id])]
    if (addHits.length > 0 && !preset) recipe = 'custom'
  }

  const clientName = extractClientName(message)
  if (clientName) {
    data.clientName = clientName.replace(/\b\w/g, (c) => c.toUpperCase())
    data.league = data.clientName.includes('Arena') ? 'Service Portal · 2026' : 'Client Portal'
  }
  Object.assign(data, findThemePatch(lower))

  modules = normalizeModuleOrder(modules)

  let reply: string
  if (data.brandPrimary || data.brandAccent) {
    reply = `Updated the portal colors and active modules: ${modules.map((m) => PORTAL_MODULE_MAP[m].label).join(', ')}.`
  } else if (preset && preset !== currentRecipe && !hasRemovalIntent) {
    reply = `Loaded ${PORTAL_RECIPES.find((r) => r.id === preset)?.label}. Active modules: ${modules.map((m) => PORTAL_MODULE_MAP[m].label).join(', ')}.`
  } else if (clientName) {
    reply = `Updated for ${data.clientName}. Active modules: ${modules.map((m) => PORTAL_MODULE_MAP[m].label).join(', ')}.`
  } else {
    reply = `Updated. Active modules: ${modules.map((m) => PORTAL_MODULE_MAP[m].label).join(', ')}.`
  }

  return {
    reply,
    enabledModules: modules,
    recipe,
    data,
    missingModules: [],
  }
}
