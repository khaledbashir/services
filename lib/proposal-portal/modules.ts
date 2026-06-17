import type { PortalModuleDef, PortalModuleId } from './types'

export const PORTAL_MODULES: PortalModuleDef[] = [
  {
    id: 'deal-deck',
    label: 'Deal Deck',
    description: 'Sales/proposal story: visuals, proof, investment, and executive close.',
    audience: ['sales', 'executive'],
    category: 'presentation',
    implemented: true,
  },
  {
    id: 'customer-portal',
    label: 'Customer Portal',
    description: 'Client login surface: venues, requests, account overview, and portal landing.',
    audience: ['service', 'executive'],
    category: 'service',
    required: true,
    implemented: true,
  },
  {
    id: 'tickets',
    label: 'Tickets',
    description: 'Issue submission, open/closed cases, replies, priority, and photo uploads.',
    audience: ['service', 'operations'],
    category: 'support',
    implemented: true,
  },
  {
    id: 'service-health',
    label: 'Service Health',
    description: 'Venue status, display inventory, maintenance history, and operational risks.',
    audience: ['service', 'operations', 'executive'],
    category: 'service',
    implemented: true,
  },
  {
    id: 'ai-diagnosis',
    label: 'AI Diagnosis',
    description: 'Photo-based first read: diagnose display issues and search prior fixes.',
    audience: ['service', 'operations'],
    category: 'support',
    implemented: true,
  },
  {
    id: 'documents',
    label: 'Documents',
    description: 'Reports, drawings, proof files, approved assets, and downloads.',
    audience: ['service', 'executive'],
    category: 'workflow',
    implemented: true,
  },
  {
    id: 'approvals',
    label: 'Approvals',
    description: 'Client review for designs, proofs, scope, changes, and sign-off decisions.',
    audience: ['sales', 'service', 'operations'],
    category: 'workflow',
    implemented: true,
  },
  {
    id: 'reports-qbr',
    label: 'Reports / QBR',
    description: 'Monthly service summary, uptime, ticket trends, completed work, and renewal readout.',
    audience: ['service', 'executive'],
    category: 'reporting',
    implemented: true,
  },
  {
    id: 'onboarding',
    label: 'Onboarding / Orientation',
    description: 'How to use the portal, service scope, contacts, escalation paths, and next steps.',
    audience: ['service', 'operations'],
    category: 'service',
    implemented: true,
  },
]

export const PORTAL_MODULE_MAP = Object.fromEntries(
  PORTAL_MODULES.map((m) => [m.id, m]),
) as Record<PortalModuleId, PortalModuleDef>

const LEGACY_MODULE_MAP: Record<string, PortalModuleId> = {
  'venue-hero': 'deal-deck',
  'before-after': 'deal-deck',
  'solution-story': 'deal-deck',
  'proof-gallery': 'deal-deck',
  team: 'customer-portal',
  stats: 'reports-qbr',
  pricing: 'deal-deck',
  timeline: 'onboarding',
  'case-study': 'deal-deck',
}

export function normalizeModuleId(id: string): PortalModuleId | null {
  if (id in PORTAL_MODULE_MAP) return id as PortalModuleId
  return LEGACY_MODULE_MAP[id] ?? null
}

export function isImplementedModule(id: PortalModuleId): boolean {
  return PORTAL_MODULE_MAP[id]?.implemented === true
}

export function normalizeModuleOrder(modules: string[]): PortalModuleId[] {
  const order = PORTAL_MODULES.map((m) => m.id)
  const set = new Set<PortalModuleId>()
  for (const id of modules) {
    const normalized = normalizeModuleId(id)
    if (normalized && isImplementedModule(normalized)) set.add(normalized)
  }
  if (!set.has('customer-portal')) set.add('customer-portal')
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
