import { getSkills } from '@/lib/ai/registry'
import type { Skill, AgentRole } from '@/lib/ai/types'

/**
 * Tool taxonomy for the voice-agent permissions tree.
 *
 * Two top-level groups:
 *   - ANC Tools — capabilities tied to ANC's own systems
 *       · Service Dashboard (this app)
 *       · Twenty CRM (read/write of CRM-mirrored objects)
 *       · Proposal Engine (rag2)        [stub — cross-repo, see notes below]
 *       · docs.anc.com                  [stub — cross-repo, see notes below]
 *   - General Tools — system-level, UI-driving, integrations not specific to ANC
 *
 * The tree is derived from the live skill registry — adding a new skill
 * automatically picks up the right subgroup via the rules below. No manual
 * registry edits are needed for ordinary CRUD additions.
 *
 * Cross-repo stubs (Proposal Engine, docs.anc.com): the subgroups exist in
 * the UI but contain no tools yet. Wiring them up means adding proxy skills
 * that call out to those services' APIs (each lives in a separate Next.js
 * project). Tracked as a follow-up.
 */

export type TopGroupKey = 'anc' | 'general'

export interface ToolNode {
  name: string
  description: string
  category?: string
  role?: string
  icon?: string
}

export interface SubgroupNode {
  key: string
  label: string
  description?: string
  /** UI badge when there's no underlying implementation yet. */
  comingSoon?: boolean
  tools: ToolNode[]
}

export interface GroupNode {
  key: TopGroupKey
  label: string
  description: string
  subgroups: SubgroupNode[]
}

interface SubgroupMeta {
  group: TopGroupKey
  key: string
  label: string
  description?: string
}

const SUBGROUPS: Record<string, SubgroupMeta> = {
  // ANC group
  'sd-events': { group: 'anc', key: 'sd-events', label: 'Service Dashboard · Events & Schedule', description: 'Events, schedules, my-events, shift templates.' },
  'sd-venues': { group: 'anc', key: 'sd-venues', label: 'Service Dashboard · Venues', description: 'Venue records, services attached to venues, walkthroughs.' },
  'sd-tickets': { group: 'anc', key: 'sd-tickets', label: 'Service Dashboard · Tickets & Support', description: 'Service tickets, comments, status changes, KB.' },
  'sd-staff': { group: 'anc', key: 'sd-staff', label: 'Service Dashboard · Staff', description: 'Staff records, lookups, scheduling.' },
  'sd-creative': { group: 'anc', key: 'sd-creative', label: 'Service Dashboard · Creative & Designs', description: 'Design requests, CG designs, content schedules, time entries, hours budgets.' },
  'sd-service-ops': { group: 'anc', key: 'sd-service-ops', label: 'Service Dashboard · Service Ops', description: 'Maintenance logs, RMA, parts, parts orders, opening checklists.' },
  'sd-clients': { group: 'anc', key: 'sd-clients', label: 'Service Dashboard · Clients & Portals', description: 'Clients, client portals.' },
  'sd-reports': { group: 'anc', key: 'sd-reports', label: 'Service Dashboard · Reports & Stats', description: 'Dashboard stats, analytics, repeat-clients report.' },
  'twenty-crm': { group: 'anc', key: 'twenty-crm', label: 'Twenty CRM', description: 'Companies, people, opportunities, services synced from the CRM.' },
  'proposal-engine': { group: 'anc', key: 'proposal-engine', label: 'Proposal Engine (rag2)', description: 'Proposal generation, sample packs, mirror mode, intelligence mode. (Coming soon — cross-repo bridge pending.)' },
  'docs-anc': { group: 'anc', key: 'docs-anc', label: 'docs.anc.com', description: 'ANC docs site search and Q&A. (Coming soon — cross-repo bridge pending.)' },

  // General group
  'ops-workspace': { group: 'general', key: 'ops-workspace', label: 'Operations Workspace (NocoDB)', description: 'Direct CRUD against the ops.ancsports.net workspace tables.' },
  'ui-driving': { group: 'general', key: 'ui-driving', label: 'UI driving', description: 'Navigate, click, fill, highlight, toast — moves the user around the dashboard.' },
  'integrations': { group: 'general', key: 'integrations', label: 'External integrations', description: 'Salesforce enrichment, Slack canvases, Twenty sync triggers.' },
  'misc': { group: 'general', key: 'misc', label: 'Miscellaneous', description: 'Tools that don\'t fit anywhere else.' },
}

// Explicit name-prefix → subgroup. Anything not matched here falls through
// to the category-based heuristic below.
const NAME_RULES: Array<{ test: (name: string) => boolean; subgroup: string }> = [
  { test: (n) => n.startsWith('ops_'), subgroup: 'ops-workspace' },
  { test: (n) => n.startsWith('ui_'), subgroup: 'ui-driving' },
  { test: (n) => /event|schedule|shift/.test(n), subgroup: 'sd-events' },
  { test: (n) => /venue|walkthrough/.test(n), subgroup: 'sd-venues' },
  { test: (n) => /ticket|support|knowledge|kb_|maintenance_log|sla/.test(n), subgroup: 'sd-tickets' },
  { test: (n) => /staff|technician/.test(n), subgroup: 'sd-staff' },
  { test: (n) => /design|creative|content_schedule|time_entr|hours_budget|print_request|gallery|cg_/.test(n), subgroup: 'sd-creative' },
  { test: (n) => /maintenance|rma|part|opening_checklist/.test(n), subgroup: 'sd-service-ops' },
  { test: (n) => /client|portal/.test(n), subgroup: 'sd-clients' },
  { test: (n) => /dashboard_stats|jireh|report/.test(n), subgroup: 'sd-reports' },
  { test: (n) => /company|companies|people|person|opportunit|service_/.test(n), subgroup: 'twenty-crm' },
  { test: (n) => /salesforce|slack_|enrich/.test(n), subgroup: 'integrations' },
]

function pickSubgroupFor(skill: Skill): string {
  for (const rule of NAME_RULES) {
    if (rule.test(skill.name)) return rule.subgroup
  }
  // Category fallback for skills with explicit categories.
  switch (skill.category) {
    case 'Events': return 'sd-events'
    case 'Venues': return 'sd-venues'
    case 'Support': return 'sd-tickets'
    case 'Staff': return 'sd-staff'
    case 'Creative': return 'sd-creative'
    case 'Service Ops': return 'sd-service-ops'
    case 'System': return 'misc'
    default: return 'misc'
  }
}

export async function buildToolTree(userRole: AgentRole = 'admin'): Promise<GroupNode[]> {
  const skills = await getSkills(userRole)

  // Bucket skills into subgroups.
  const buckets = new Map<string, ToolNode[]>()
  for (const s of skills) {
    const sub = pickSubgroupFor(s)
    const list = buckets.get(sub) || []
    list.push({
      name: s.name,
      description: s.description,
      category: s.category,
      role: s.role,
      icon: s.icon,
    })
    buckets.set(sub, list)
  }

  // Materialize ALL declared subgroups (even empty ones — we want the tree
  // structure to be predictable and to surface the cross-repo stubs).
  const groupedSubs: Record<TopGroupKey, SubgroupNode[]> = { anc: [], general: [] }
  const seen = new Set<string>()
  for (const meta of Object.values(SUBGROUPS)) {
    seen.add(meta.key)
    const tools = (buckets.get(meta.key) || []).sort((a, b) => a.name.localeCompare(b.name))
    const isStub = meta.key === 'proposal-engine' || meta.key === 'docs-anc'
    groupedSubs[meta.group].push({
      key: meta.key,
      label: meta.label,
      description: meta.description,
      comingSoon: isStub && tools.length === 0,
      tools,
    })
  }
  // Anything in `buckets` that didn't match a declared subgroup goes to misc.
  for (const [key, tools] of buckets.entries()) {
    if (!seen.has(key)) {
      const misc = groupedSubs.general.find(s => s.key === 'misc')
      if (misc) misc.tools.push(...tools)
    }
  }

  return [
    {
      key: 'anc',
      label: 'ANC Tools',
      description: 'Capabilities tied to ANC\'s own systems — CRM, Service Dashboard, Proposal Engine, docs.',
      subgroups: groupedSubs.anc,
    },
    {
      key: 'general',
      label: 'General Tools',
      description: 'System-level capabilities and external integrations.',
      subgroups: groupedSubs.general.filter(s => s.tools.length > 0 || s.key === 'misc'),
    },
  ]
}

/**
 * Filter a list of tool definitions to those allowed for an agent.
 * - allowedTools === null  → all tools allowed (default, current behavior)
 * - allowedTools === []    → NO tools (the agent can only talk)
 * - allowedTools = [a, b]  → only those names
 */
export function filterToolsByAllowlist<T extends { function?: { name?: string } }>(
  tools: T[],
  allowedTools: string[] | null | undefined
): T[] {
  if (allowedTools === null || allowedTools === undefined) return tools
  const allowed = new Set(allowedTools)
  return tools.filter(t => t.function?.name && allowed.has(t.function.name))
}
