import { NextRequest, NextResponse } from 'next/server'
import { isAuthError, requireRole } from '@/lib/rbac'
import { updateProjectScheduleOverride, type DeploymentStatus, type ProjectSchedulePatch } from '@/lib/project-schedule'

const DEPLOYMENT_STATUSES = new Set<DeploymentStatus>(['blocked', 'needs-docs', 'needs-update', 'ready', 'complete'])

function cleanString(value: unknown) {
  if (value === null || value === undefined) return undefined
  return String(value).replace(/\s+/g, ' ').trim()
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const patch: ProjectSchedulePatch = {}

    const pm = cleanString(body.pm)
    if (pm !== undefined) patch.pm = pm

    const phase = cleanString(body.phase)
    if (phase !== undefined) patch.phase = phase

    const installOnsite = cleanString(body.installOnsite)
    if (installOnsite !== undefined) patch.installOnsite = installOnsite

    const substantialCompletion = cleanString(body.substantialCompletion)
    if (substantialCompletion !== undefined) patch.substantialCompletion = substantialCompletion

    const nextDate = cleanString(body.nextDate)
    if (nextDate !== undefined) patch.nextDate = nextDate

    const nextDateLabel = cleanString(body.nextDateLabel)
    if (nextDateLabel !== undefined) patch.nextDateLabel = nextDateLabel

    const notes = cleanString(body.notes)
    if (notes !== undefined) patch.notes = notes

    if (body.deploymentStatus !== undefined) {
      const deploymentStatus = cleanString(body.deploymentStatus) as DeploymentStatus | undefined
      if (deploymentStatus && !DEPLOYMENT_STATUSES.has(deploymentStatus)) {
        return NextResponse.json({ error: 'Invalid deployment status' }, { status: 400 })
      }
      patch.deploymentStatus = deploymentStatus
    }

    const data = await updateProjectScheduleOverride(params.id, patch, auth.email || auth.fullName)
    if (!data) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Error updating project schedule:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
