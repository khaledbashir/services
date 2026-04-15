// Shared types for the in-dashboard AI agent.

export type AgentRole = 'admin' | 'manager' | 'technician' | 'any'

export interface SkillContext {
  userId: string
  userRole: AgentRole
  userName?: string
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
