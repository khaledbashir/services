import { NextRequest, NextResponse } from 'next/server'
import { isAuthError, requireRole } from '@/lib/rbac'
import {
  BALL_IN_COURT_VALUES,
  SUBMITTAL_DISPOSITIONS,
  updateProjectScheduleDeploymentDocumentOverride,
  updateProjectScheduleSubmittalOverride,
  type BallInCourt,
  type DeploymentDocumentPatch,
  type DeploymentDocumentStatus,
  type SubmittalDisposition,
  type SubmittalItemPatch,
  type SubmittalStatus,
} from '@/lib/project-schedule'

const SUBMITTAL_STATUSES = new Set<SubmittalStatus>(['needed', 'submitted', 'returned', 'approved'])
const DOCUMENT_STATUSES = new Set<DeploymentDocumentStatus>(['ready', 'watch', 'missing'])
const DISPOSITIONS = new Set<SubmittalDisposition>(SUBMITTAL_DISPOSITIONS)
const BALL_IN_COURT = new Set<BallInCourt>(BALL_IN_COURT_VALUES)

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

      if (body.disposition !== undefined) {
        const disposition = cleanString(body.disposition) as SubmittalDisposition | undefined
        if (disposition && !DISPOSITIONS.has(disposition)) {
          return NextResponse.json({ error: 'Invalid submittal disposition' }, { status: 400 })
        }
        if (disposition) patch.disposition = disposition
      }

      if (body.ballInCourt !== undefined) {
        const ballInCourt = cleanString(body.ballInCourt) as BallInCourt | undefined
        if (ballInCourt && !BALL_IN_COURT.has(ballInCourt)) {
          return NextResponse.json({ error: 'Invalid ball-in-court value' }, { status: 400 })
        }
        if (ballInCourt) patch.ballInCourt = ballInCourt
      }

      const submittedDate = cleanString(body.submittedDate)
      if (submittedDate !== undefined) patch.submittedDate = submittedDate

      const returnedDate = cleanString(body.returnedDate)
      if (returnedDate !== undefined) patch.returnedDate = returnedDate

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
