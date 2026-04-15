import fs from 'node:fs'
import path from 'node:path'
import type { Skill, AgentRole } from '@/lib/ai/types'

// Skill auto-discovery.
// Any .ts file in /lib/ai/skills/ that default-exports a Skill is picked
// up at boot. To add a new skill: drop a new file in that directory and
// redeploy — no registry edits needed.

const SKILLS_DIR = path.join(process.cwd(), 'lib', 'ai', 'skills')

let cache: Skill[] | null = null

async function loadSkills(): Promise<Skill[]> {
  if (cache) return cache
  const skills: Skill[] = []

  // In Next.js server runtime, require() against the built output doesn't
  // give us the TS source list reliably — but we built the skills file set
  // at compile time. Webpack stuffs them into the build. We use a static
  // import map here for deterministic inclusion so the bundler keeps them.
  //
  // When a new skill is added, append it to the import map below (single
  // source of truth). The discovery fallback below reads the fs at runtime
  // too, so dev mode with tsx / node picks up new files without rebuilding.
  const staticImports: Array<() => Promise<{ default: Skill }>> = [
    () => import('@/lib/ai/skills/search-events'),
    () => import('@/lib/ai/skills/search-venues'),
    () => import('@/lib/ai/skills/search-staff'),
    () => import('@/lib/ai/skills/create-ticket'),
    () => import('@/lib/ai/skills/create-design-request'),
    () => import('@/lib/ai/skills/log-walkthrough'),
    () => import('@/lib/ai/skills/log-maintenance'),
    () => import('@/lib/ai/skills/dashboard-stats'),
    () => import('@/lib/ai/skills/move-design-to-client-review'),
  ]
  for (const load of staticImports) {
    try {
      const mod = await load()
      if (mod?.default?.name) skills.push(mod.default)
    } catch (err) {
      console.warn('[ai/registry] failed to load skill:', err instanceof Error ? err.message : err)
    }
  }

  // Auto-generated CRUD skills (find_many / find_one / create / update /
  // delete) for every dashboard table we care about. Lives in
  // _auto-crud.ts — underscore prefix keeps the fs-scan fallback from
  // trying to interpret it as a single-skill file.
  try {
    const { autoCrudSkills } = await import('@/lib/ai/skills/_auto-crud')
    for (const s of autoCrudSkills()) {
      if (!skills.some(existing => existing.name === s.name)) skills.push(s)
    }
  } catch (err) {
    console.warn('[ai/registry] failed to load auto-CRUD skills:', err instanceof Error ? err.message : err)
  }

  // Fallback fs scan for files that aren't in the static map yet (dev mode).
  try {
    const entries = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.ts') && !f.startsWith('_'))
    for (const entry of entries) {
      const name = entry.replace(/\.ts$/, '')
      if (skills.some(s => s.name.replace(/_/g, '-') === name || s.name === name)) continue
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const mod = require(path.join(SKILLS_DIR, entry))
        const skill: Skill | undefined = mod?.default
        if (skill?.name) skills.push(skill)
      } catch {
        // ignore — Next.js server build won't have the source .ts anyway
      }
    }
  } catch {
    // Directory might not exist in prod build; that's fine — static map covers it.
  }

  cache = skills
  return skills
}

const ROLE_RANK: Record<string, number> = { any: 0, technician: 1, manager: 2, admin: 3 }

function roleAllows(userRole: AgentRole, minimum?: AgentRole | 'any'): boolean {
  if (!minimum || minimum === 'any') return true
  return (ROLE_RANK[userRole] ?? 0) >= (ROLE_RANK[minimum] ?? 0)
}

/** Skills visible to a given user role. */
export async function getSkills(userRole: AgentRole): Promise<Skill[]> {
  const all = await loadSkills()
  return all.filter(s => roleAllows(userRole, s.role))
}

/** OpenAI-style tool definitions for the LLM. */
export async function toolDefinitions(userRole: AgentRole) {
  const skills = await getSkills(userRole)
  return skills.map(s => ({
    type: 'function' as const,
    function: { name: s.name, description: s.description, parameters: s.parameters },
  }))
}

/** Run a tool by name. Never throws across the boundary. */
export async function invokeSkill(
  name: string,
  argsJson: string,
  ctx: { userId: string; userRole: AgentRole; userName?: string }
): Promise<string> {
  const all = await loadSkills()
  const skill = all.find(s => s.name === name)
  if (!skill) return JSON.stringify({ ok: false, error: `Unknown skill: ${name}` })
  if (!roleAllows(ctx.userRole, skill.role)) {
    return JSON.stringify({ ok: false, error: `Skill ${name} requires role: ${skill.role}` })
  }
  try {
    const args = argsJson ? JSON.parse(argsJson) : {}
    const result = await skill.handler(args, ctx)
    return JSON.stringify({ ok: true, ...(typeof result === 'object' && result !== null ? result : { result }) })
  } catch (err) {
    return JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
