import { PORTAL_MODULE_MAP, normalizeModuleOrder } from './modules'
import { PORTAL_RECIPES, modulesForRecipe } from './recipes'
import type { PortalClientData, PortalModuleId, PortalRecipeId } from './types'
import { DEFAULT_PORTAL_DATA } from './types'

export type AssembleResult = {
  reply: string
  enabledModules: PortalModuleId[]
  recipe: PortalRecipeId
  data: Partial<PortalClientData>
  missingModules: string[]
}

const MODULE_ALIASES: Record<string, PortalModuleId> = {
  hero: 'venue-hero',
  venue: 'venue-hero',
  'before after': 'before-after',
  beforeafter: 'before-after',
  ba: 'before-after',
  solution: 'solution-story',
  story: 'solution-story',
  vision: 'solution-story',
  gallery: 'proof-gallery',
  proof: 'proof-gallery',
  team: 'team',
  stats: 'stats',
  numbers: 'stats',
  pricing: 'pricing',
  price: 'pricing',
  investment: 'pricing',
  timeline: 'timeline',
  steps: 'timeline',
  'case study': 'case-study',
  casestudy: 'case-study',
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

export function parsePortalIntent(
  message: string,
  currentModules: PortalModuleId[],
  currentRecipe: PortalRecipeId = 'custom',
): AssembleResult {
  const lower = message.toLowerCase().trim()
  let modules = [...currentModules]
  let recipe: PortalRecipeId = currentRecipe
  const data: Partial<PortalClientData> = {}
  const missingModules: string[] = []
  const hasRemovalIntent = /\b(remove|drop|hide|without|no)\b/.test(lower)
  const hasAddIntent = /\b(add|include|enable|want|need)\b/.test(lower)

  for (const r of PORTAL_RECIPES) {
    if (lower.includes(r.id) || lower.includes(r.owner.toLowerCase()) || lower.includes(r.label.toLowerCase())) {
      recipe = r.id
      modules = modulesForRecipe(r.id)
      for (const id of r.modules) {
        const mod = PORTAL_MODULE_MAP[id]
        if (mod && !mod.implemented) missingModules.push(mod.label)
      }
      break
    }
  }

  if (/\b(reset|start over|clear)\b/.test(lower)) {
    modules = modulesForRecipe('natalia')
    recipe = 'natalia'
  }

  const removeHits = findMentionedModules(lower.replace(/\b(remove|drop|hide|without|no)\b/g, ' '))
  if (hasRemovalIntent) {
    for (const id of removeHits) {
      if (!PORTAL_MODULE_MAP[id]?.required) {
        modules = modules.filter((m) => m !== id)
      }
    }
  }

  if (hasAddIntent || !hasRemovalIntent) {
    const addHits = findMentionedModules(lower)
    for (const id of addHits) {
      const mod = PORTAL_MODULE_MAP[id]
      if (!mod?.implemented) {
        if (mod) missingModules.push(mod.label)
      } else {
        modules = [...new Set([...modules, id])]
      }
    }
  }

  const clientName = extractClientName(message)
  if (clientName) {
    data.clientName = clientName.replace(/\b\w/g, (c) => c.toUpperCase())
    data.league = data.clientName.includes('Arena') ? 'Renovation · 2026' : 'Venue Technology'
  }

  modules = normalizeModuleOrder(modules)

  let reply: string
  const uniqueMissing = [...new Set(missingModules)]
  if (uniqueMissing.length > 0) {
    reply = `Turned on what we have. These modules aren't in the library yet: ${uniqueMissing.join(', ')}.`
  } else if (recipe !== 'custom' && recipe !== currentRecipe) {
    reply = `Loaded the ${PORTAL_RECIPES.find((r) => r.id === recipe)?.label} recipe (${PORTAL_RECIPES.find((r) => r.id === recipe)?.owner}'s preset). Watch the preview update.`
  } else if (clientName) {
    reply = `Updated for ${data.clientName}. Modules: ${modules.map((m) => PORTAL_MODULE_MAP[m].label).join(' → ')}.`
  } else {
    reply = `Portal updated — ${modules.length} modules active. Toggle anything in the panel or keep talking.`
  }

  return {
    reply,
    enabledModules: modules,
    recipe,
    data: { ...DEFAULT_PORTAL_DATA, ...data },
    missingModules: uniqueMissing,
  }
}
