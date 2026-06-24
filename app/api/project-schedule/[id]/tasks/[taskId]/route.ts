import { NextRequest, NextResponse } from 'next/server'
import { isAuthError, requireRole } from '@/lib/rbac'
import {
  deleteProjectScheduleTask,
  updateProjectScheduleTask,
  type ProjectScheduleTaskPatch,
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; taskId: string } },
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const patch: ProjectScheduleTaskPatch = {}

    const name = cleanString(body.name)
    if (name !== undefined) patch.name = name
    if (body.duration !== undefined) patch.duration = cleanNumber(body.duration)
    if (body.start !== undefined) patch.start = cleanString(body.start) ?? null
    if (body.end !== undefined) patch.end = cleanString(body.end) ?? null
    if (body.phase !== undefined) patch.phase = cleanString(body.phase) ?? null
    if (body.parentId !== undefined) patch.parentId = cleanString(body.parentId) ?? null
    if (body.isMilestone !== undefined) patch.isMilestone = Boolean(body.isMilestone)
    if (body.isSubmittalMilestone !== undefined) patch.isSubmittalMilestone = Boolean(body.isSubmittalMilestone)
    if (body.orderIndex !== undefined) patch.orderIndex = cleanNumber(body.orderIndex) ?? undefined

    const data = await updateProjectScheduleTask(params.taskId, patch, auth.email || auth.fullName)
    if (!data) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    return NextResponse.json({ data })
  } catch (err) {
    console.error('Error updating project schedule task:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; taskId: string } },
) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const ok = await deleteProjectScheduleTask(params.taskId)
    if (!ok) return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    return NextResponse.json({ data: { deleted: true } })
  } catch (err) {
    console.error('Error deleting project schedule task:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
