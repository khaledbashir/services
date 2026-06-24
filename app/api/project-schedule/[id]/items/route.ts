import { NextRequest, NextResponse } from 'next/server'
import { isAuthError, requireRole } from '@/lib/rbac'
import {
  updateProjectScheduleDeploymentDocumentOverride,
  updateProjectScheduleSubmittalOverride,
  type DeploymentDocumentPatch,
  type DeploymentDocumentStatus,
  type SubmittalItemPatch,
  type SubmittalStatus,
} from '@/lib/project-schedule'

const SUBMITTAL_STATUSES = new Set<SubmittalStatus>(['needed', 'submitted', 'returned', 'approved'])
const DOCUMENT_STATUSES = new Set<DeploymentDocumentStatus>(['ready', 'watch', 'missing'])

function cleanString(value: unknown) {
  if (value === null || value === undefined) return undefined
  return String(value).replace(/\s+/g, ' ').trim()
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await requireRole(request, 'manager')
    if (isAuthError(auth)) return auth

    const body = await request.json()
    const itemKind = cleanString(body.itemKind)
    const itemKey = cleanString(body.itemKey)
    const updatedBy = auth.email || auth.fullName

    if (!itemKey) {
      return NextResponse.json({ error: 'Missing itemKey' }, { status: 400 })
    }

    if (itemKind === 'submittal') {
      const patch: SubmittalItemPatch = {}

      if (body.status !== undefined) {
        const status = cleanString(body.status) as SubmittalStatus | undefined
        if (status && !SUBMITTAL_STATUSES.has(status)) {
          return NextResponse.json({ error: 'Invalid submittal status' }, { status: 400 })
        }
        patch.status = status
      }

      const title = cleanString(body.title)
      if (title !== undefined) patch.title = title

      const packageType = cleanString(body.packageType)
      if (packageType !== undefined) patch.packageType = packageType

      const owner = cleanString(body.owner)
      if (owner !== undefined) patch.owner = owner

      const dueDate = cleanString(body.dueDate)
      if (dueDate !== undefined) patch.dueDate = dueDate

      const data = await updateProjectScheduleSubmittalOverride(params.id, itemKey, patch, updatedBy)
      if (!data) return NextResponse.json({ error: 'Submittal not found' }, { status: 404 })
      return NextResponse.json({ data })
    }

    if (itemKind === 'deployment-document') {
      const patch: DeploymentDocumentPatch = {}

      if (body.status !== undefined) {
        const status = cleanString(body.status) as DeploymentDocumentStatus | undefined
        if (status && !DOCUMENT_STATUSES.has(status)) {
          return NextResponse.json({ error: 'Invalid document status' }, { status: 400 })
        }
        patch.status = status
      }

      const label = cleanString(body.label)
      if (label !== undefined) patch.label = label

      const detail = cleanString(body.detail)
      if (detail !== undefined) patch.detail = detail

      const data = await updateProjectScheduleDeploymentDocumentOverride(params.id, itemKey, patch, updatedBy)
      if (!data) return NextResponse.json({ error: 'Deployment document not found' }, { status: 404 })
      return NextResponse.json({ data })
    }

    return NextResponse.json({ error: 'Invalid itemKind' }, { status: 400 })
  } catch (err) {
    console.error('Error updating project schedule item:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
