import { NextRequest, NextResponse } from 'next/server'
import { isAuthError, requireRole } from '@/lib/rbac'
import {
  createProjectScheduleTask,
  listProjectScheduleTasks,
  type ProjectScheduleTaskInput,
} from '@/lib/project-schedule'

function cleanString(value: unknown) {
  if (value === null || value === undefined) return undefined
  return String(value).replace(/\s+/g, ' ').trim()
}

function cleanNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  if (value === null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth
    const data = await listProjectScheduleTasks(params.id)
    return NextResponse.json({ data })
  } catch (err) {
    console.error('Error listing project schedule tasks:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const name = cleanString(body.name)
    if (!name) return NextResponse.json({ error: 'Missing task name' }, { status: 400 })

    const input: ProjectScheduleTaskInput = {
      name,
      duration: cleanNumber(body.duration),
      start: cleanString(body.start) ?? null,
      end: cleanString(body.end) ?? null,
      phase: cleanString(body.phase) ?? null,
      parentId: cleanString(body.parentId) ?? null,
      isMilestone: body.isMilestone === undefined ? undefined : Boolean(body.isMilestone),
      isSubmittalMilestone: body.isSubmittalMilestone === undefined ? undefined : Boolean(body.isSubmittalMilestone),
      orderIndex: cleanNumber(body.orderIndex) ?? undefined,
    }

    const data = await createProjectScheduleTask(params.id, input, auth.email || auth.fullName)
    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Error creating project schedule task:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
