// Shared types for the in-dashboard AI agent.

export type AgentRole = 'admin' | 'tech_support' | 'manager' | 'technician' | 'designer' | 'design_contractor' | 'any'

/**
 * Where the skill is being invoked from. Skills can use this to adjust
 * side-effects — e.g. when ctx.channel === 'slack', suppress the direct
 * Slack notification since OpenClaw will format the final reply itself.
 */
export type AgentChannel = 'web' | 'slack' | 'voice'

export interface SkillContext {
  userId: string
  userRole: AgentRole
  userName?: string
  channel?: AgentChannel
}

/**
 * Privilege ordering. Shared by the registry's skill-level gate and the
 * generic record tools, which must gate per-table inside the handler
 * (one tool serves many tables, so Skill.role can't express it).
 */
export const ROLE_RANK: Record<string, number> = {
  any: 0,
  designer: 1,
  design_contractor: 1,
  technician: 1,
  manager: 2,
  tech_support: 3,
  admin: 4,
}

export function roleAtLeast(userRole: AgentRole, minimum?: AgentRole | 'any'): boolean {
  if (!minimum || minimum === 'any') return true
  return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[minimum] ?? 0)
}

/**
 * Structured error skills can throw to give the agent (and the UI / Slack)
 * a stable error code + a one-line suggestion for recovery.
 */
export class SkillError extends Error {
  code: string
  suggestion?: string
  constructor(code: string, message: string, suggestion?: string) {
    super(message)
    this.code = code
    this.suggestion = suggestion
  }
}

/** UI grouping for the skill picker. Rendered dynamically — safe to extend. */
export type SkillCategory =
  | 'Events'
  | 'Venues'
  | 'Staff'
  | 'Support'
  | 'Service Ops'
  | 'Creative'
  | 'Clients'
  | 'Projects'
  | 'Marketing'
  | 'Gamification'
  | 'Knowledge'
  | 'System'

export interface Skill {
  /** Unique snake_case identifier used by the LLM. */
  name: string
  /** One-sentence description shown to the LLM and in the UI. */
  description: string
  /** JSON Schema for the tool's arguments (OpenAI tool spec shape). */
  parameters: Record<string, unknown>
  /** Server-side handler. Return any JSON-serializable shape. */
  handler: (args: Record<string, unknown>, ctx: SkillContext) => Promise<unknown>
  /** Optional minimum role to expose the skill. */
  role?: Exclude<AgentRole, 'any'>
  /** UI category label shown in the skill picker. */
  category?: SkillCategory
  /** Short lucide-style icon name or emoji for the UI. */
  icon?: string
}
