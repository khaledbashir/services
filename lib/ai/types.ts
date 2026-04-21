// Shared types for the in-dashboard AI agent.

export type AgentRole = 'admin' | 'tech_support' | 'manager' | 'technician' | 'any'

/**
 * Where the skill is being invoked from. Skills can use this to adjust
 * side-effects — e.g. when ctx.channel === 'slack', suppress the direct
 * Slack notification since OpenClaw will format the final reply itself.
 */
export type AgentChannel = 'web' | 'slack'

export interface SkillContext {
  userId: string
  userRole: AgentRole
  userName?: string
  channel?: AgentChannel
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
  category?: 'Events' | 'Venues' | 'Staff' | 'Support' | 'Service Ops' | 'Creative' | 'System'
  /** Short lucide-style icon name or emoji for the UI. */
  icon?: string
}
