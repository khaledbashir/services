export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { invokeSkill, getSkills } from '@/lib/ai/registry'
import type { AgentRole } from '@/lib/ai/types'

// Bridge endpoint so OpenClaw (or any other non-browser caller) can invoke
// a single skill by name with args and get back the JSON result.
//
// Auth: Authorization: Bearer <OPENCLAW_INVOKE_TOKEN>. Never exposed to
// browser sessions — this is a service-to-service door only.
//
// Input: { skill_name, args, slack_user_id?, user_id? }
// Output: { ok: true, text_summary, result } | { ok: false, error }

const CLAW_STAFF_ID = process.env.OPENCLAW_CLAW_STAFF_ID || '7fb556c3-5d2d-430a-b3dc-42f58d79be33'

function authorized(request: NextRequest): boolean {
  const token = process.env.OPENCLAW_INVOKE_TOKEN
  if (!token) return false
  const header = request.headers.get('authorization') || ''
  return header === `Bearer ${token}`
}

async function resolveCaller(input: {
  user_id?: string
  slack_user_id?: string
}): Promise<{ userId: string; userRole: AgentRole; userName?: string } | null> {
  // 1. Explicit user_id wins — look it up.
  if (input.user_id) {
    const r = await query(
      `SELECT id, COALESCE(role,'technician') AS role, COALESCE(full_name, email) AS name
       FROM staff WHERE id = $1 LIMIT 1`,
      [input.user_id]
    )
    if (r.rows.length > 0) {
      const row = r.rows[0]
      return { userId: row.id, userRole: row.role as AgentRole, userName: row.name }
    }
    return null
  }

  // 2. Slack user id — look up via slack_user_ids[] column.
  if (input.slack_user_id) {
    const r = await query(
      `SELECT id, COALESCE(role,'technician') AS role, COALESCE(full_name, email) AS name
       FROM staff WHERE $1 = ANY(slack_user_ids) LIMIT 1`,
      [input.slack_user_id]
    )
    if (r.rows.length > 0) {
      const row = r.rows[0]
      return { userId: row.id, userRole: row.role as AgentRole, userName: row.name }
    }

    // Fallback: env-configured admin allowlist (transition period — before
    // slack_user_ids is backfilled into real staff rows). Runs as the Claw
    // service account with admin role.
    const adminIds = (process.env.ANC_SLACK_ADMIN_IDS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
    if (adminIds.includes(input.slack_user_id)) {
      return { userId: CLAW_STAFF_ID, userRole: 'admin', userName: 'Claw (Slack admin)' }
    }
    return null
  }

  return null
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const skillName = typeof body.skill_name === 'string' ? body.skill_name : ''
  const args = body.args && typeof body.args === 'object' ? body.args : {}
  const slackUserId = typeof body.slack_user_id === 'string' ? body.slack_user_id : undefined
  const userId = typeof body.user_id === 'string' ? body.user_id : undefined

  if (!skillName) {
    return NextResponse.json({ ok: false, error: 'skill_name required' }, { status: 400 })
  }

  const caller = await resolveCaller({ user_id: userId, slack_user_id: slackUserId })
  if (!caller) {
    return NextResponse.json({
      ok: false,
      error: 'unknown_caller',
      hint: 'Provide a user_id (staff UUID) or a slack_user_id that matches staff.slack_user_ids or ANC_SLACK_ADMIN_IDS.',
    }, { status: 403 })
  }

  const resultJson = await invokeSkill(skillName, JSON.stringify(args), {
    userId: caller.userId,
    userRole: caller.userRole,
    userName: caller.userName,
    channel: 'slack',
  })

  // Re-parse so the caller gets a normal object rather than a stringified one.
  try {
    const parsed = JSON.parse(resultJson)
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_skill_response', raw: resultJson })
  }
}

// GET returns the list of skills available to a given role so OpenClaw can
// dynamically build its tool list — no capabilities.md regeneration needed.
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  const url = new URL(request.url)
  const role = (url.searchParams.get('role') as AgentRole) || 'admin'
  const skills = await getSkills(role)
  return NextResponse.json({
    skills: skills.map(s => ({
      name: s.name,
      description: s.description,
      parameters: s.parameters,
      role: s.role || 'any',
      category: s.category || 'Other',
    })),
  })
}
