import type { PortalModuleDef, PortalModuleId } from './types'

export const PORTAL_MODULES: PortalModuleDef[] = [
  {
    id: 'venue-hero',
    label: 'Venue Hero',
    description: 'Cinematic opening — client name, venue render, ANC brand frame.',
    audience: ['design', 'sales'],
    scroll: 'pin',
    required: true,
    implemented: true,
  },
  {
    id: 'before-after',
    label: 'Before / After',
    description: 'Scroll-driven LED transformation reveal.',
    audience: ['design', 'sales'],
    scroll: 'pin',
    implemented: true,
  },
  {
    id: 'solution-story',
    label: 'Solution Story',
    description: 'Executive vision copy between hero moments.',
    audience: ['sales'],
    scroll: 'river',
    implemented: true,
  },
  {
    id: 'proof-gallery',
    label: 'Proof Gallery',
    description: 'Rotating case-study imagery — MetLife, Sixers, Cavs.',
    audience: ['sales'],
    scroll: 'river',
    implemented: false,
  },
  {
    id: 'team',
    label: 'Team & Leadership',
    description: 'Who the client is betting on.',
    audience: ['sales', 'design'],
    scroll: 'river',
    implemented: false,
  },
  {
    id: 'stats',
    label: 'Scale & Stats',
    description: 'Venues, events, years — credibility numbers.',
    audience: ['sales'],
    scroll: 'river',
    implemented: false,
  },
  {
    id: 'pricing',
    label: 'Investment & CTA',
    description: 'Pinned pricing stinger + executive review CTA.',
    audience: ['sales', 'design'],
    scroll: 'pin',
    implemented: true,
  },
  {
    id: 'timeline',
    label: 'Timeline & Next Steps',
    description: 'What happens after they say yes.',
    audience: ['sales'],
    scroll: 'river',
    implemented: false,
  },
  {
    id: 'case-study',
    label: 'Case Study',
    description: 'One venue deep-dive story.',
    audience: ['sales'],
    scroll: 'river',
    implemented: false,
  },
]

export const PORTAL_MODULE_MAP = Object.fromEntries(
  PORTAL_MODULES.map((m) => [m.id, m]),
) as Record<PortalModuleId, PortalModuleDef>

export function isImplementedModule(id: PortalModuleId): boolean {
  return PORTAL_MODULE_MAP[id]?.implemented === true
}

export function normalizeModuleOrder(modules: PortalModuleId[]): PortalModuleId[] {
  const order = PORTAL_MODULES.map((m) => m.id)
  const set = new Set(modules.filter((id) => isImplementedModule(id)))
  if (!set.has('venue-hero')) set.add('venue-hero')
  return order.filter((id) => set.has(id))
}

export function toggleModule(
  current: PortalModuleId[],
  id: PortalModuleId,
  on: boolean,
): PortalModuleId[] {
  const mod = PORTAL_MODULE_MAP[id]
  if (mod?.required && !on) return current
  const set = new Set(current)
  if (on) set.add(id)
  else set.delete(id)
  return normalizeModuleOrder([...set])
}
