import { SkillError, roleAtLeast, type Skill, type AgentRole, type AgentChannel } from '@/lib/ai/types'
import { fileSkills } from '@/lib/ai/skills/index.generated'
import { uiSkills } from '@/lib/ai/skills/_ui-actions'
import { recordSkills } from '@/lib/ai/skills/_records'

/**
 * Skill registry.
 *
 * Sources, in precedence order (first definition of a name wins):
 *   1. fileSkills   — every lib/ai/skills/*.ts, via the generated manifest.
 *                     Dedicated skills win over generated CRUD, so the
 *                     hand-written create_ticket (which also posts to Slack)
 *                     shadows the generic one.
 *   2. uiSkills     — browser-driving actions, echoed back to the client.
 *   3. recordSkills — schema-introspected record tools, generic + named CRUD
 *                     for the hot tables.
 *
 * There is no runtime filesystem scan. The manifest is generated at build
 * time and verified by `npm run ai:check-skills`, so a skill file that isn't
 * wired up fails the build rather than disappearing from production.
 */

let cache: Skill[] | null = null
let inflight: Promise<{ skills: Skill[]; complete: boolean }> | null = null

async function build(): Promise<{ skills: Skill[]; complete: boolean }> {
  const skills: Skill[] = []
  const seen = new Set<string>()

  const add = (list: Skill[]) => {
    for (const s of list) {
      if (!s?.name || seen.has(s.name)) continue
      seen.add(s.name)
      skills.push(s)
    }
  }

  add(fileSkills)
  add(uiSkills())

  // Record tools introspect the database. If Postgres is briefly unreachable
  // we still serve the rest of the agent — but we must NOT cache that
  // degraded list, or a single blip at boot would leave the assistant
  // without data tools until the process restarts.
  let complete = true
  try {
    add(await recordSkills())
  } catch (err) {
    complete = false
    console.error('[ai/registry] record skills unavailable, not caching:', err instanceof Error ? err.message : err)
  }

  return { skills, complete }
}

async function loadSkills(): Promise<Skill[]> {
  if (cache) return cache
  if (inflight) return (await inflight).skills
  inflight = build()
    .then(result => {
      if (result.complete) cache = result.skills
      return result
    })
    .finally(() => {
      inflight = null
    })
  return (await inflight).skills
}

/** Drop the cache so the next call re-introspects the schema. */
export function invalidateSkillCache(): void {
  cache = null
}

/** Skills visible to a given user role. */
export async function getSkills(userRole: AgentRole): Promise<Skill[]> {
  const all = await loadSkills()
  return all.filter(s => roleAtLeast(userRole, s.role))
}

/** OpenAI-style tool definitions for the LLM. */
export async function toolDefinitions(userRole: AgentRole) {
  const skills = await getSkills(userRole)
  return skills.map(s => ({
    type: 'function' as const,
    function: { name: s.name, description: s.description, parameters: s.parameters },
  }))
}

/**
 * Run a tool by name. Never throws across the boundary — always returns a
 * JSON string with one of two shapes:
 *   { ok: true, text_summary?: string, ...handler_result }
 *   { ok: false, error: { code, message, suggestion? }, text_summary: string }
 *
 * `text_summary` is the human-readable one-liner (for Slack / logs / the
 * thought stream). Handlers can set it themselves; if missing we default
 * to the error message on failure.
 */
export async function invokeSkill(
  name: string,
  argsJson: string,
  ctx: { userId: string; userRole: AgentRole; userName?: string; channel?: AgentChannel }
): Promise<string> {
  const all = await loadSkills()
  const skill = all.find(s => s.name === name)
  if (!skill) {
    return JSON.stringify({
      ok: false,
      error: { code: 'unknown_skill', message: `Unknown skill: ${name}`, suggestion: 'Check the available skill list.' },
      text_summary: `Unknown skill: ${name}`,
    })
  }
  if (!roleAtLeast(ctx.userRole, skill.role)) {
    return JSON.stringify({
      ok: false,
      error: { code: 'permission_denied', message: `Skill ${name} requires role: ${skill.role}`, suggestion: 'Ask an admin to run this for you.' },
      text_summary: `Permission denied — ${name} needs ${skill.role}`,
    })
  }
  let args: Record<string, unknown> = {}
  try {
    args = argsJson ? JSON.parse(argsJson) : {}
  } catch {
    return JSON.stringify({
      ok: false,
      error: { code: 'invalid_args', message: `Invalid JSON args for ${name}`, suggestion: 'Retry with valid JSON.' },
      text_summary: `Bad args for ${name}`,
    })
  }
  try {
    const result = await skill.handler(args, ctx)
    const obj = (typeof result === 'object' && result !== null ? result : { result }) as Record<string, unknown>
    return JSON.stringify({ ok: true, ...obj })
  } catch (err) {
    if (err instanceof SkillError) {
      return JSON.stringify({
        ok: false,
        error: { code: err.code, message: err.message, suggestion: err.suggestion },
        text_summary: err.message,
      })
    }
    // Postgres errors: detect common patterns and turn them into useful codes.
    const raw = err instanceof Error ? err.message : String(err)
    let code = 'server_error'
    let suggestion: string | undefined
    if (/foreign key|violates.*constraint/i.test(raw)) {
      code = 'constraint_violation'
      suggestion = 'One of the referenced IDs does not exist — look it up first.'
    } else if (/not[- ]?found|no rows/i.test(raw)) {
      code = 'not_found'
      suggestion = 'Confirm the id or search by name.'
    } else if (/duplicate|unique/i.test(raw)) {
      code = 'conflict'
      suggestion = 'A record with those values already exists.'
    }
    return JSON.stringify({
      ok: false,
      error: { code, message: raw, suggestion },
      text_summary: raw.slice(0, 180),
    })
  }
}
